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
export class DeleteSprintTool implements IAgentTool {
  private readonly logger = new Logger(DeleteSprintTool.name)

  readonly name = 'deleteSprint'
  readonly description =
    'Xóa toàn bộ một chu kỳ Sprint. ' +
    '⚠️ ĐÂY LÀ THAO TÁC CỰC KỲ NGUY HIỂM (LEVEL 4: DANGEROUS) VÀ BẮT BUỘC XÁC NHẬN BẰNG "confirm: true". ' +
    'Bảo vệ an toàn quy trình: Chặn xóa Sprint đang chạy (ACTIVE) trừ khi có cờ "forceActiveDelete: true". ' +
    'Cơ chế cứu hộ dữ liệu (Data Rescue): Tự động bảo toàn và di chuyển toàn bộ tasks hiện có trong Sprint ' +
    'sang một Sprint đích (fallbackSprintId) hoặc tạo Backlog lưu trữ an toàn trước khi xóa Sprint.'

  readonly category: ToolCategory = 'SPRINT'
  readonly riskLevel: ToolRiskLevel = 'DANGEROUS'
  readonly level: ToolActionLevel = 'DANGEROUS'

  readonly parameters = {
    type: 'object',
    properties: {
      sprintId: {
        type: 'string',
        description: 'ID của Sprint cần xóa (bắt buộc)'
      },
      confirm: {
        type: 'boolean',
        description: 'Xác nhận xóa: BẮT BUỘC phải là true để tiến hành xóa dữ liệu. Nếu false, hệ thống chỉ hiển thị hộp thoại cảnh báo nguy cơ và kế hoạch cứu hộ dữ liệu.'
      },
      dryRun: {
        type: 'boolean',
        description: 'Nếu true, chỉ tính toán và xem trước kế hoạch cứu hộ dữ liệu task mà không xóa thật Sprint trong DB. Mặc định: false'
      },
      fallbackSprintId: {
        type: 'string',
        description: 'ID của Sprint đích để chuyển toàn bộ các công việc hiện tại sang trước khi xóa (nếu để trống, hệ thống sẽ tự tìm Sprint PLANNED khác hoặc tự tạo Backlog an toàn)'
      },
      forceActiveDelete: {
        type: 'boolean',
        description: 'Bắt buộc xóa ngay cả khi Sprint đang ở trạng thái ACTIVE (mặc định: false - từ chối xóa để bảo vệ team đang chạy)'
      },
      isHardDelete: {
        type: 'boolean',
        description: 'Nếu true, xóa vĩnh viễn khỏi DB (Hard delete). Nếu false, xóa mềm (Soft delete với deletedAt) để có thể khôi phục (mặc định: false)'
      }
    },
    required: ['sprintId']
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
    const sprintId = args.sprintId
    if (!sprintId) {
      return {
        output: '❌ **Lỗi:** Không tìm thấy `sprintId`. Vui lòng chỉ định ID của Sprint cần xóa.',
        status: 'ERROR',
        summary: 'Thiếu sprintId để xóa Sprint'
      }
    }

    const confirm = args.confirm === true
    const forceActiveDelete = Boolean(args.forceActiveDelete)
    const isHardDelete = Boolean(args.isHardDelete)

    try {
      // 1. Truy vấn Sprint kèm các tasks và cột
      const sprint = await this.prisma.sprint.findFirst({
        where: { id: sprintId, deletedAt: null },
        include: {
          project: { select: { id: true, name: true } },
          boardColumns: { where: { deletedAt: null } },
          tasks: {
            where: { deletedAt: null },
            include: { boardColumn: true }
          },
          dailySnapshots: true
        }
      })

      if (!sprint) {
        return {
          output: `❌ **Lỗi:** Không tìm thấy Sprint với ID "${sprintId}" hoặc Sprint này đã bị xóa trước đó.`,
          status: 'ERROR',
          summary: `Sprint không tồn tại: ${sprintId}`
        }
      }

      // 2. Chặn xóa Sprint đang ACTIVE trừ khi có cờ cưỡng chế
      if (sprint.status === 'ACTIVE' && !forceActiveDelete) {
        return {
          output:
            `🛑 **TỪ CHỐI THAO TÁC: SPRINT ĐANG HOẠT ĐỘNG (ACTIVE)**\n\n` +
            `Sprint **"${sprint.name}"** đang là chu kỳ làm việc chính thức đang chạy của dự án **${sprint.project.name}**.\n\n` +
            `Xóa một Sprint đang ACTIVE sẽ gây gián đoạn nghiêm trọng quy trình làm việc của team và làm hỏng đồ thị Burndown hiện tại.\n\n` +
            `**Khuyến nghị:**\n` +
            `1. Nếu chu kỳ đã xong, hãy sử dụng công cụ \`completeSprint\` để hoàn tất và lưu trữ kết quả.\n` +
            `2. Nếu thực sự có sai sót nghiêm trọng và muốn xóa cưỡng chế ngay, hãy gọi lại công cụ với:\n` +
            `   \`"forceActiveDelete": true\` và \`"confirm": true\`.`,
          status: 'ERROR',
          summary: `Từ chối xóa Sprint đang ACTIVE: ${sprint.name}`
        }
      }

      const tasksCount = sprint.tasks.length
      const totalSP = sprint.tasks.reduce((sum, t) => sum + (t.storyPoint || 0), 0)

      // 3. NẾU CHƯA XÁC NHẬN (confirm !== true) HOẶC ĐANG DRY-RUN ➡️ HIỂN THỊ HỘP THOẠI CẢNH BÁO NGUY HIỂM 2 BƯỚC
      if (!confirm || args.dryRun || context.dryRun) {
        let warningMd = `### ⚠️ HỘP THOẠI XÁC NHẬN XÓA SPRINT (LEVEL 4: DANGEROUS)\n\n`
        warningMd += `Bạn đang yêu cầu **xóa toàn bộ chu kỳ Sprint** sau đây:\n\n`
        warningMd += `* **Tên Sprint:** **${sprint.name}**\n`
        warningMd += `* **Dự án:** ${sprint.project.name}\n`
        warningMd += `* **Mã ID:** \`${sprint.id}\`\n`
        warningMd += `* **Trạng thái:** \`${sprint.status}\`\n`
        warningMd += `* **Thời gian:** ${sprint.startDate.toISOString().slice(0, 10)} ➡️ ${sprint.endDate.toISOString().slice(0, 10)}\n`
        warningMd += `* **Số lượng công việc:** **${tasksCount} tasks** (Tổng: **${totalSP} Story Points**)\n\n`

        if (tasksCount > 0) {
          warningMd += `#### 🛡️ Kế hoạch bảo tồn dữ liệu (Data Rescue Plan):\n`
          warningMd += `Để tránh mất mát công việc của đội ngũ, toàn bộ **${tasksCount} tasks** sẽ được hệ thống tự động cứu hộ và chuyển sang:\n`
          if (args.fallbackSprintId) {
            warningMd += `- Sprint chỉ định: ID \`${args.fallbackSprintId}\`\n`
          } else {
            warningMd += `- Sprint \`PLANNED\` tiếp theo trong dự án hoặc tự động tạo kho lưu trữ \`Project Backlog (Rescued)\`\n`
          }
          warningMd += `> *Không một task nào bị xóa bỏ ngoài ý muốn!*\n\n`
        } else {
          warningMd += `ℹ️ Sprint này hiện rỗng (0 tasks), có thể xóa an toàn mà không ảnh hưởng công việc.\n\n`
        }

        warningMd += `🔴 **Chế độ xóa:** ${isHardDelete ? '**XÓA VĨNH VIỄN KHỎI DB (HARD DELETE)**' : '**Xóa mềm (Soft Delete - có thể khôi phục)**'}\n\n`
        warningMd += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
        warningMd += `👉 **Để xác nhận thực hiện xóa, vui lòng gọi lại công cụ này với tham số:**\n`
        warningMd += `\`\`\`json\n{\n  "sprintId": "${sprint.id}",\n  "confirm": true${sprint.status === 'ACTIVE' ? ',\n  "forceActiveDelete": true' : ''}\n}\n\`\`\``

        return {
          output: warningMd,
          status: 'SUCCESS',
          summary: `[Yêu cầu xác nhận] Cảnh báo xóa Sprint "${sprint.name}" (${tasksCount} tasks)`
        }
      }

      // Human-in-the-loop: Nếu chưa có sự phê duyệt, sinh ActionProposal
      if (!(args as any).isApproved) {
        const proposalId = (args as any).proposalId || randomUUID()
        const proposal: ActionProposal = {
          id: proposalId,
          type: 'DELETE_SPRINT',
          summary: `Xóa Sprint "${sprint.name}" (${tasksCount} tasks, ${totalSP} SP)`,
          payload: {
            sprintId: sprint.id,
            sprintName: sprint.name,
            tasksCount,
            totalSP,
            fallbackSprintId: args.fallbackSprintId,
            forceActiveDelete: args.forceActiveDelete,
            isHardDelete,
            confirm: true
          },
          status: 'PENDING',
          createdAt: new Date().toISOString()
        }

        return {
          output: `⚠️ **CẢNH BÁO NGUY HIỂM (LEVEL 4):** Bạn đang yêu cầu xóa chu kỳ Sprint **"${sprint.name}"** (${tasksCount} tasks, ${totalSP} Story Points).\n\n* Hệ thống có cơ chế cứu hộ tasks sang Sprint khác hoặc Backlog.\n* Đề xuất xóa đã được chuyển lên thẻ phê duyệt (màu đỏ). Bạn vui lòng kiểm tra kỹ và bấm **[Xác nhận thực thi]** để tiến hành.`,
          status: 'SUCCESS',
          summary: `Đề xuất xóa Sprint "${sprint.name}"`,
          actionProposal: proposal
        }
      }

      // 4. KHI ĐÃ XÁC NHẬN (confirm === true) ➡️ TIẾN HÀNH CỨU HỘ TASKS VÀ XÓA SPRINT
      let targetSprintName = ''


      await this.prisma.$transaction(async (tx) => {
        // 4.1. Cứu hộ tasks nếu Sprint có chứa tasks
        if (tasksCount > 0) {
          let targetSprint: { id: string; name: string } | null = null
          let targetColId: string | null = null

          if (args.fallbackSprintId && args.fallbackSprintId !== sprint.id) {
            const specifiedSprint = await tx.sprint.findFirst({
              where: {
                id: args.fallbackSprintId,
                projectId: sprint.projectId,
                deletedAt: null
              },
              include: { boardColumns: { where: { deletedAt: null } } }
            })
            if (specifiedSprint) {
              targetSprint = { id: specifiedSprint.id, name: specifiedSprint.name }
              const orderIds = specifiedSprint.boardColumnIds || []
              const sortedCols = [...specifiedSprint.boardColumns].sort((a, b) => {
                const idxA = orderIds.indexOf(a.id)
                const idxB = orderIds.indexOf(b.id)
                if (idxA !== -1 && idxB !== -1) return idxA - idxB
                return 0
              })
              const firstCol = sortedCols.find((c) => !c.isDone) || sortedCols[0]
              targetColId = firstCol?.id || null
            }
          }

          // Nếu chưa có targetSprint, tìm một Sprint PLANNED khác
          if (!targetSprint) {
            const alternateSprint = await tx.sprint.findFirst({
              where: {
                projectId: sprint.projectId,
                id: { not: sprint.id },
                status: 'PLANNED',
                deletedAt: null
              },
              orderBy: { createdAt: 'asc' },
              include: { boardColumns: { where: { deletedAt: null } } }
            })
            if (alternateSprint) {
              targetSprint = { id: alternateSprint.id, name: alternateSprint.name }
              const orderIds = alternateSprint.boardColumnIds || []
              const sortedCols = [...alternateSprint.boardColumns].sort((a, b) => {
                const idxA = orderIds.indexOf(a.id)
                const idxB = orderIds.indexOf(b.id)
                if (idxA !== -1 && idxB !== -1) return idxA - idxB
                return 0
              })
              const firstCol = sortedCols.find((c) => !c.isDone) || sortedCols[0]
              targetColId = firstCol?.id || null
            }
          }

          // Nếu vẫn chưa có (dự án chỉ có mỗi Sprint này), tự động tạo Sprint Backlog
          if (!targetSprint) {
            const now = new Date()
            const rescuedSprint = await tx.sprint.create({
              data: {
                projectId: sprint.projectId,
                name: 'Project Backlog (Rescued Tasks)',
                goal: 'Lưu trữ các công việc được cứu hộ khi xóa Sprint',
                startDate: now,
                endDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
                status: 'PLANNED'
              }
            })

            const createdColIds: string[] = []
            for (const col of DEFAULT_BOARD_COLUMNS) {
              const createdCol = await tx.boardColumn.create({
                data: {
                  sprintId: rescuedSprint.id,
                  title: col.title,
                  color: col.color,
                  isDone: col.isDone,
                  isWip: col.isWip,
                  isBlocked: col.isBlocked,
                  isCancelled: col.isCancelled
                }
              })
              createdColIds.push(createdCol.id)
            }

            await tx.sprint.update({
              where: { id: rescuedSprint.id },
              data: { boardColumnIds: createdColIds }
            })

            targetSprint = { id: rescuedSprint.id, name: rescuedSprint.name }
            targetColId = createdColIds[0]
          }

          targetSprintName = targetSprint.name

          // Di chuyển toàn bộ tasks sang targetSprint và targetColId
          const taskIds = sprint.tasks.map((t) => t.id)
          if (targetColId) {
            await tx.task.updateMany({
              where: { id: { in: taskIds } },
              data: {
                sprintId: targetSprint.id,
                boardColumnId: targetColId,
                updatedAt: new Date()
              }
            })

            // Dọn dẹp task order cũ và tạo task order mới trong cột đích
            await tx.boardColumnTaskOrder.deleteMany({
              where: { taskId: { in: taskIds } }
            })

            for (let i = 0; i < taskIds.length; i++) {
              await tx.boardColumnTaskOrder.create({
                data: {
                  boardColumnId: targetColId,
                  taskId: taskIds[i],
                  sortOrder: (i + 1) * 10
                }
              })
            }
          }
        }

        // 4.2. Dọn dẹp BoardColumnTaskOrder của các cột thuộc Sprint này
        const colIds = sprint.boardColumns.map((c) => c.id)
        if (colIds.length > 0) {
          await tx.boardColumnTaskOrder.deleteMany({
            where: { boardColumnId: { in: colIds } }
          })
        }

        // 4.3. Xóa các DailySnapshots
        await tx.sprintDailySnapshot.deleteMany({
          where: { sprintId: sprint.id }
        })

        // 4.4. Xóa Sprint (và các BoardColumns)
        if (isHardDelete) {
          await tx.boardColumn.deleteMany({
            where: { sprintId: sprint.id }
          })
          await tx.sprint.delete({
            where: { id: sprint.id }
          })
        } else {
          const now = new Date()
          await tx.boardColumn.updateMany({
            where: { sprintId: sprint.id },
            data: {
              deletedAt: now
            }
          })
          await tx.sprint.update({
            where: { id: sprint.id },
            data: {
              deletedAt: now
            }
          })
        }
      })

      // 5. Định dạng kết quả xóa thành công
      let outputMd = `### 🗑️ Đã Xóa Sprint Thành Công!\n\n`
      outputMd += `Sprint **"${sprint.name}"** (ID: \`${sprint.id}\`) đã được xóa an toàn khỏi dự án **${sprint.project.name}**.\n\n`
      outputMd += `| Thông tin chi tiết | Kết quả xử lý |\n`
      outputMd += `| :--- | :--- |\n`
      outputMd += `| **Tên Sprint đã xóa** | **${sprint.name}** |\n`
      outputMd += `| **Hình thức xóa** | ${isHardDelete ? 'Xóa vĩnh viễn (Hard Delete)' : 'Xóa mềm (Soft Delete)'} |\n`
      outputMd += `| **Số công việc đã bảo tồn** | **${tasksCount} tasks** (${totalSP} SP) |\n`
      if (tasksCount > 0) {
        outputMd += `| **Kho lưu trữ cứu hộ** | Đã di chuyển an toàn sang **"${targetSprintName}"** |\n`
      }
      outputMd += `| **Số cột Kanban đã dọn dẹp** | ${sprint.boardColumns.length} cột |\n`
      outputMd += `| **Dữ liệu Burndown Snapshots** | Đã dọn dẹp sạch sẽ |\n\n`

      if (tasksCount > 0) {
        outputMd += `> 🛡️ **An toàn dữ liệu:** Toàn bộ ${tasksCount} task đã được chuyển giao nguyên vẹn sang Sprint **"${targetSprintName}"**. Bạn có thể kiểm tra lại tại bảng Backlog.`
      }

      return {
        output: outputMd,
        status: 'SUCCESS',
        summary: `Đã xóa Sprint "${sprint.name}" (${tasksCount} tasks đã cứu hộ sang "${targetSprintName}")`
      }
    } catch (err: any) {
      this.logger.error(`DeleteSprintTool error: ${err?.message}`, err?.stack)
      return {
        output: `❌ **Lỗi khi xóa Sprint:** ${err?.message || err}`,
        status: 'ERROR',
        summary: `Lỗi xóa Sprint ${sprintId}`
      }
    }
  }
}
