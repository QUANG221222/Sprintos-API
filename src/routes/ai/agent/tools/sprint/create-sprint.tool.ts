import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { randomUUID } from 'crypto'
import { PrismaService } from '~/shared/services/prisma.service'
import { ActionProposal, AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'


const DEFAULT_BOARD_COLUMNS = [
  { title: 'To Do', isDone: false, isWip: false, isBlocked: false, isCancelled: false, color: '#64748B' },
  { title: 'In Progress', isDone: false, isWip: true, isBlocked: false, isCancelled: false, color: '#0EA5E9' },
  { title: 'Code Review', isDone: false, isWip: true, isBlocked: false, isCancelled: false, color: '#F59E0B' },
  { title: 'Done', isDone: true, isWip: false, isBlocked: false, isCancelled: false, color: '#10B981' }
]

@Injectable()
export class CreateSprintTool implements IAgentTool {
  private readonly logger = new Logger(CreateSprintTool.name)

  readonly name = 'createSprint'
  readonly description =
    'Khởi tạo một chu kỳ Sprint mới cho dự án trong quy trình Scrum: thiết lập Tên, Mục tiêu (Sprint Goal), ' +
    'ngày bắt đầu (startDate), ngày kết thúc (endDate) và trần Story Points (maxStoryPoint). ' +
    'Tự động kế thừa cấu trúc các cột Kanban tùy biến từ Sprint trước hoặc tự động khởi tạo 4 cột chuẩn ' +
    '("To Do", "In Progress", "Code Review", "Done"). Mặc định Sprint được tạo ở trạng thái PLANNED.'

  readonly category: ToolCategory = 'SPRINT'
  readonly riskLevel: ToolRiskLevel = 'WRITE'
  readonly level: ToolActionLevel = 'WRITE'

  readonly parameters = {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'ID dự án cần tạo Sprint (nếu để trống sẽ tự lấy từ ngữ cảnh hiện tại)'
      },
      name: {
        type: 'string',
        description: 'Tên Sprint (ví dụ: "Sprint 1", "Sprint 2 - Payment Gateway", "Sprint Core Architecture")'
      },
      goal: {
        type: 'string',
        description: 'Mục tiêu kinh doanh và kỹ thuật của Sprint (Sprint Goal)'
      },
      startDate: {
        type: 'string',
        description: 'Ngày bắt đầu Sprint theo định dạng ISO (ví dụ: "2026-03-01T00:00:00.000Z" hoặc "2026-03-01")'
      },
      endDate: {
        type: 'string',
        description: 'Ngày kết thúc Sprint theo định dạng ISO (ví dụ: "2026-03-14T23:59:59.000Z" hoặc "2026-03-14")'
      },
      maxStoryPoint: {
        type: 'number',
        description: 'Trần Story Point tối đa dự kiến cho Sprint (mặc định: 40)'
      },
      copyColumnsFromSprintId: {
        type: 'string',
        description: 'ID của Sprint trước đó muốn sao chép cấu trúc cột Kanban (nếu để trống sẽ tự động lấy từ Sprint mới nhất)'
      },
      dryRun: {
        type: 'boolean',
        description: 'Nếu true, chỉ tính toán và xem trước bản kế hoạch khởi tạo mà không ghi vào cơ sở dữ liệu (mặc định: false)'
      }
    },
    required: ['name', 'startDate', 'endDate']
  }

  constructor(private readonly prisma: PrismaService) {}

  toOpenAiTool(): OpenAI.Chat.ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters
      }
    }
  }

  async execute(args: any, context: AgentContext): Promise<ToolExecutionResult> {
    const targetProjectId = args.projectId || context.targetProjectId
    if (!targetProjectId) {
      return {
        output: '❌ **Lỗi:** Không xác định được `projectId`. Vui lòng chỉ định rõ ID dự án cần tạo Sprint.',
        status: 'ERROR',
        summary: 'Thiếu projectId để tạo Sprint'
      }
    }

    const sprintName = String(args.name || '').trim()
    if (!sprintName) {
      return {
        output: '❌ **Lỗi:** Tên Sprint không được để trống.',
        status: 'ERROR',
        summary: 'Thiếu tên Sprint'
      }
    }

    // 1. Kiểm tra tính hợp lệ của thời gian
    const parsedStart = new Date(args.startDate)
    const parsedEnd = new Date(args.endDate)
    if (isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
      return {
        output: `❌ **Lỗi định dạng ngày:** "startDate" hoặc "endDate" không hợp lệ. Vui lòng cung cấp chuỗi thời gian hợp lệ (ví dụ: "2026-03-01").`,
        status: 'ERROR',
        summary: 'Ngày bắt đầu/kết thúc không hợp lệ'
      }
    }

    if (parsedStart >= parsedEnd) {
      return {
        output: `❌ **Lỗi thời gian:** Ngày bắt đầu (${parsedStart.toISOString().slice(0, 10)}) phải diễn ra trước ngày kết thúc (${parsedEnd.toISOString().slice(0, 10)}).`,
        status: 'ERROR',
        summary: 'startDate phải trước endDate'
      }
    }

    const maxStoryPoint = typeof args.maxStoryPoint === 'number' && args.maxStoryPoint > 0 ? args.maxStoryPoint : 40
    const dryRun = Boolean(args.dryRun)

    try {
      // 2. Xác thực dự án tồn tại
      const project = await this.prisma.project.findFirst({
        where: { id: targetProjectId, deletedAt: null },
        select: { id: true, name: true }
      })

      if (!project) {
        return {
          output: `❌ **Lỗi:** Dự án với ID "${targetProjectId}" không tồn tại hoặc đã bị xóa.`,
          status: 'ERROR',
          summary: `Dự án không tồn tại: ${targetProjectId}`
        }
      }

      // 3. Xác định cấu trúc cột Kanban kế thừa
      let sourceColumns: Array<{
        title: string
        color?: string | null
        isDone: boolean
        isWip: boolean
        isBlocked: boolean
        isCancelled: boolean
      }> = []

      let inheritedFromSprintName = ''

      if (args.copyColumnsFromSprintId) {
        const sourceSprint = await this.prisma.sprint.findFirst({
          where: { id: args.copyColumnsFromSprintId, projectId: targetProjectId, deletedAt: null },
          include: { boardColumns: { where: { deletedAt: null } } }
        })
        if (sourceSprint && sourceSprint.boardColumns.length > 0) {
          inheritedFromSprintName = sourceSprint.name
          const orderIds = sourceSprint.boardColumnIds || []
          const sortedCols = [...sourceSprint.boardColumns].sort((a, b) => {
            const idxA = orderIds.indexOf(a.id)
            const idxB = orderIds.indexOf(b.id)
            if (idxA !== -1 && idxB !== -1) return idxA - idxB
            return 0
          })
          sourceColumns = sortedCols.map((c) => ({
            title: c.title,
            color: c.color,
            isDone: c.isDone,
            isWip: c.isWip,
            isBlocked: c.isBlocked,
            isCancelled: c.isCancelled
          }))
        }
      }

      // Nếu chưa có sourceColumns, tìm Sprint gần nhất của dự án
      if (sourceColumns.length === 0) {
        const latestSprint = await this.prisma.sprint.findFirst({
          where: { projectId: targetProjectId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: { boardColumns: { where: { deletedAt: null } } }
        })
        if (latestSprint && latestSprint.boardColumns.length > 0) {
          inheritedFromSprintName = latestSprint.name
          const orderIds = latestSprint.boardColumnIds || []
          const sortedCols = [...latestSprint.boardColumns].sort((a, b) => {
            const idxA = orderIds.indexOf(a.id)
            const idxB = orderIds.indexOf(b.id)
            if (idxA !== -1 && idxB !== -1) return idxA - idxB
            return 0
          })
          sourceColumns = sortedCols.map((c) => ({
            title: c.title,
            color: c.color,
            isDone: c.isDone,
            isWip: c.isWip,
            isBlocked: c.isBlocked,
            isCancelled: c.isCancelled
          }))
        }
      }

      // Nếu dự án hoàn toàn mới, dùng bộ 4 cột mặc định
      if (sourceColumns.length === 0) {
        sourceColumns = DEFAULT_BOARD_COLUMNS
      }

      // 4. Nếu dryRun = true: Trả về bản mô phỏng
      if (dryRun) {
        let md = `🧪 **CHẾ ĐỘ XEM TRƯỚC (DRY-RUN): KẾ HOẠCH KHỞI TẠO SPRINT**\n\n`
        md += `* **Dự án:** ${project.name}\n`
        md += `* **Tên Sprint:** **${sprintName}**\n`
        md += `* **Sprint Goal:** ${args.goal || '*(Chưa đặt mục tiêu)*'}\n`
        md += `* **Thời gian:** ${parsedStart.toISOString().slice(0, 10)} ➡️ ${parsedEnd.toISOString().slice(0, 10)}\n`
        md += `* **Trần Story Points (Capacity):** ${maxStoryPoint} SP\n`
        md += `* **Trạng thái ban đầu:** \`PLANNED\`\n`
        md += `* **Cấu trúc cột Kanban (${inheritedFromSprintName ? `Kế thừa từ ${inheritedFromSprintName}` : '4 cột chuẩn'}):**\n`
        sourceColumns.forEach((c, idx) => {
          md += `  ${idx + 1}. **${c.title}** ${c.isDone ? '*(Done Column)*' : c.isWip ? '*(WIP)*' : ''}\n`
        })
        md += `\n> 💡 *Để tạo thật vào cơ sở dữ liệu, hãy gọi lại công cụ với \`dryRun: false\`.*`

        return {
          output: md,
          status: 'SUCCESS',
          summary: `[Xem trước] Kế hoạch tạo ${sprintName} (${sourceColumns.length} cột Kanban)`
        }
      }

      // Human-in-the-loop: Nếu chưa có sự phê duyệt, sinh ActionProposal
      if (!(args as any).isApproved) {
        const proposalId = (args as any).proposalId || randomUUID()
        const proposal: ActionProposal = {
          id: proposalId,
          type: 'CREATE_SPRINT',
          summary: `Khởi tạo Sprint "${sprintName}" (${parsedStart.toISOString().slice(0, 10)} ➡️ ${parsedEnd.toISOString().slice(0, 10)}, trần ${maxStoryPoint} SP)`,
          payload: {
            projectId: targetProjectId,
            name: sprintName,
            goal: args.goal || null,
            startDate: parsedStart.toISOString(),
            endDate: parsedEnd.toISOString(),
            maxStoryPoint,
            copyColumnsFromSprintId: args.copyColumnsFromSprintId
          },
          status: 'PENDING',
          createdAt: new Date().toISOString()
        }

        return {
          output: `Tôi đã lập đề xuất khởi tạo Sprint mới: **"${sprintName}"** (từ ngày ${parsedStart.toISOString().slice(0, 10)} đến ${parsedEnd.toISOString().slice(0, 10)}, trần ${maxStoryPoint} SP).\n\nĐề xuất này đã được đính kèm vào thẻ phê duyệt trên màn hình. Bạn vui lòng kiểm tra lại thông tin và bấm **[Xác nhận thực thi]** để khởi tạo Sprint.`,
          status: 'SUCCESS',
          summary: `Đề xuất tạo Sprint "${sprintName}"`,
          actionProposal: proposal
        }
      }

      // 5. Tạo Sprint thật vào DB thông qua Transaction
      const result = await this.prisma.$transaction(async (tx) => {

        // 5.1. Tạo Sprint mới
        const createdSprint = await tx.sprint.create({
          data: {
            projectId: targetProjectId,
            name: sprintName,
            goal: args.goal ? String(args.goal).trim() : null,
            startDate: parsedStart,
            endDate: parsedEnd,
            maxStoryPoint,
            status: 'PLANNED'
          }
        })

        // 5.2. Tạo các cột BoardColumn cho Sprint
        const createdColumnIds: string[] = []
        for (const col of sourceColumns) {
          const createdCol = await tx.boardColumn.create({
            data: {
              sprintId: createdSprint.id,
              title: col.title,
              color: col.color || null,
              isDone: col.isDone,
              isWip: col.isWip,
              isBlocked: col.isBlocked,
              isCancelled: col.isCancelled
            }
          })
          createdColumnIds.push(createdCol.id)
        }

        // 5.3. Cập nhật mảng thứ tự cột boardColumnIds
        const finalSprint = await tx.sprint.update({
          where: { id: createdSprint.id },
          data: { boardColumnIds: createdColumnIds }
        })

        return { finalSprint, createdColumnIds }
      })

      // 6. Định dạng kết quả trả về
      let outputMd = `### 🎉 Khởi Tạo Sprint Thành Công!\n\n`
      outputMd += `Sprint **${sprintName}** đã được tạo thành công trong dự án **${project.name}**.\n\n`
      outputMd += `| Thuộc tính | Chi tiết |\n`
      outputMd += `| :--- | :--- |\n`
      outputMd += `| **Sprint ID** | \`${result.finalSprint.id}\` |\n`
      outputMd += `| **Tên Sprint** | **${result.finalSprint.name}** |\n`
      outputMd += `| **Mục tiêu (Goal)** | ${result.finalSprint.goal || '*(Chưa thiết lập)*'} |\n`
      outputMd += `| **Trạng thái** | \`PLANNED\` (Sẵn sàng nạp Backlog) |\n`
      outputMd += `| **Thời hạn** | ${parsedStart.toISOString().slice(0, 10)} đến ${parsedEnd.toISOString().slice(0, 10)} |\n`
      outputMd += `| **Giới hạn Capacity** | ${maxStoryPoint} Story Points |\n`
      outputMd += `| **Số cột Kanban** | ${result.createdColumnIds.length} cột (${inheritedFromSprintName ? `Sao chép từ "${inheritedFromSprintName}"` : 'Cột chuẩn Scrum'}) |\n\n`

      outputMd += `#### 📋 Quy trình cột Kanban đã thiết lập:\n`
      sourceColumns.forEach((c, idx) => {
        outputMd += `${idx + 1}. **${c.title}** ${c.isDone ? '*(Cột hoàn thành - Done)*' : c.isWip ? '*(Đang thực hiện - WIP)*' : ''}\n`
      })

      outputMd += `\n> 💡 *Bước tiếp theo: Bạn có thể đưa các công việc từ Backlog vào Sprint này hoặc sử dụng \`startSprint\` khi team sẵn sàng bắt đầu chu kỳ.*`

      return {
        output: outputMd,
        status: 'SUCCESS',
        summary: `Đã tạo Sprint "${sprintName}" (ID: ${result.finalSprint.id})`
      }
    } catch (err: any) {
      this.logger.error(`CreateSprintTool error: ${err?.message}`, err?.stack)
      return {
        output: `❌ **Lỗi khi tạo Sprint:** ${err?.message || err}`,
        status: 'ERROR',
        summary: `Lỗi tạo Sprint ${sprintName}`
      }
    }
  }
}
