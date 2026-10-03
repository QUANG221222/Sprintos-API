import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

const DEFAULT_BOARD_COLUMNS = [
  { title: 'To Do', isDone: false, isWip: false, isBlocked: false, isCancelled: false, color: '#64748B' },
  { title: 'In Progress', isDone: false, isWip: true, isBlocked: false, isCancelled: false, color: '#0EA5E9' },
  { title: 'Code Review', isDone: false, isWip: true, isBlocked: false, isCancelled: false, color: '#F59E0B' },
  { title: 'Done', isDone: true, isWip: false, isBlocked: false, isCancelled: false, color: '#10B981' }
]

@Injectable()
export class CompleteSprintTool implements IAgentTool {
  private readonly logger = new Logger(CompleteSprintTool.name)

  readonly name = 'completeSprint'
  readonly description =
    'Kết thúc Sprint (chuyển trạng thái sang COMPLETED), tổng kết Velocity thực tế ' +
    '(tổng Story Points của các task đã hoàn thành trong cột Done), ' +
    'và tự động di chuyển các công việc còn dang dở (Incomplete tasks) sang Sprint kế tiếp hoặc Backlog theo đúng quy chuẩn Scrum.'

  readonly category: ToolCategory = 'SPRINT'
  readonly riskLevel: ToolRiskLevel = 'WRITE'
  readonly level: ToolActionLevel = 'WRITE'

  readonly parameters = {
    type: 'object',
    properties: {
      sprintId: {
        type: 'string',
        description: 'ID của Sprint cần hoàn thành (nếu để trống sẽ tự lấy từ ngữ cảnh hiện tại)'
      },
      targetSprintId: {
        type: 'string',
        description: 'ID của Sprint đích tiếp theo để nhận các task chưa hoàn thành (nếu để trống sẽ tự động tìm Sprint PLANNED kế tiếp hoặc Backlog)'
      },
      dryRun: {
        type: 'boolean',
        description: 'Nếu true, chỉ tính toán và xem trước báo cáo tổng kết Sprint mà chưa ghi dữ liệu vào DB (mặc định: false)'
      }
    }
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
    const targetSprintId = args.sprintId || context.activeSprintId
    if (!targetSprintId) {
      return {
        output: '❌ **Lỗi:** Không xác định được `sprintId`. Vui lòng chỉ định rõ Sprint cần kết thúc.',
        status: 'ERROR',
        summary: 'Thiếu sprintId để kết thúc Sprint'
      }
    }

    const dryRun = Boolean(args.dryRun)

    try {
      // 1. Truy vấn Sprint và toàn bộ tasks kèm cột Kanban
      const sprint = await this.prisma.sprint.findFirst({
        where: { id: targetSprintId, deletedAt: null },
        include: {
          project: { select: { id: true, name: true } },
          boardColumns: { where: { deletedAt: null } },
          tasks: {
            where: { deletedAt: null },
            include: {
              boardColumn: true,
              assignees: { include: { user: { select: { displayName: true } } } }
            }
          }
        }
      })

      if (!sprint) {
        return {
          output: `❌ **Lỗi:** Không tìm thấy Sprint với ID "${targetSprintId}" hoặc Sprint đã bị xóa.`,
          status: 'ERROR',
          summary: `Sprint không tồn tại: ${targetSprintId}`
        }
      }

      if (sprint.status === 'COMPLETED') {
        return {
          output: `ℹ️ **Thông báo:** Sprint **"${sprint.name}"** đã hoàn thành trước đó vào ngày ${sprint.endDate.toISOString().slice(0, 10)}.`,
          status: 'SUCCESS',
          summary: `Sprint ${sprint.name} đã ở trạng thái COMPLETED`
        }
      }

      // 2. Phân loại công việc: Hoàn thành (Done) vs Chưa hoàn thành (Incomplete)
      const allTasks = sprint.tasks || []
      const completedTasks = allTasks.filter((t) => t.boardColumn?.isDone === true)
      const incompleteTasks = allTasks.filter((t) => t.boardColumn?.isDone !== true)

      const totalSP = allTasks.reduce((sum, t) => sum + (t.storyPoint || 0), 0)
      const completedSP = completedTasks.reduce((sum, t) => sum + (t.storyPoint || 0), 0)
      const incompleteSP = incompleteTasks.reduce((sum, t) => sum + (t.storyPoint || 0), 0)
      const completionRate = totalSP > 0 ? Math.round((completedSP / totalSP) * 100) : 100

      // 3. Xác định Sprint đích cho các incomplete tasks (nếu có)
      let destinationSprint: { id: string; name: string } | null = null
      let destinationColumnId: string | null = null

      if (incompleteTasks.length > 0) {
        if (args.targetSprintId && args.targetSprintId !== sprint.id) {
          const targetSprint = await this.prisma.sprint.findFirst({
            where: {
              id: args.targetSprintId,
              projectId: sprint.projectId,
              deletedAt: null
            },
            include: {
              boardColumns: { where: { deletedAt: null } }
            }
          })

          if (targetSprint) {
            destinationSprint = { id: targetSprint.id, name: targetSprint.name }
            const orderIds = targetSprint.boardColumnIds || []
            const sortedCols = [...targetSprint.boardColumns].sort((a, b) => {
              const idxA = orderIds.indexOf(a.id)
              const idxB = orderIds.indexOf(b.id)
              if (idxA !== -1 && idxB !== -1) return idxA - idxB
              return 0
            })
            const firstCol = sortedCols.find((c) => !c.isDone) || sortedCols[0]
            destinationColumnId = firstCol?.id || null
          }
        }

        // Nếu chưa có destinationSprint, tìm Sprint PLANNED tiếp theo của dự án
        if (!destinationSprint) {
          const nextPlannedSprint = await this.prisma.sprint.findFirst({
            where: {
              projectId: sprint.projectId,
              id: { not: sprint.id },
              status: 'PLANNED',
              deletedAt: null
            },
            orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
            include: {
              boardColumns: { where: { deletedAt: null } }
            }
          })

          if (nextPlannedSprint) {
            destinationSprint = { id: nextPlannedSprint.id, name: nextPlannedSprint.name }
            const orderIds = nextPlannedSprint.boardColumnIds || []
            const sortedCols = [...nextPlannedSprint.boardColumns].sort((a, b) => {
              const idxA = orderIds.indexOf(a.id)
              const idxB = orderIds.indexOf(b.id)
              if (idxA !== -1 && idxB !== -1) return idxA - idxB
              return 0
            })
            const firstCol = sortedCols.find((c) => !c.isDone) || sortedCols[0]
            destinationColumnId = firstCol?.id || null
          }
        }
      }

      // 4. Nếu dryRun = true: Trả về bản mô phỏng tổng kết Sprint
      if (dryRun) {
        let md = `🧪 **CHẾ ĐỘ XEM TRƯỚC (DRY-RUN): TỔNG KẾT & HOÀN THÀNH SPRINT "${sprint.name}"**\n\n`
        md += `* **Dự án:** ${sprint.project.name}\n`
        md += `* **Trạng thái:** Chuyển sang \`COMPLETED\`\n`
        md += `* **Velocity thực tế đạt được:** **${completedSP} Story Points**\n`
        md += `* **Tỷ lệ hoàn thành:** **${completionRate}%** (${completedTasks.length}/${allTasks.length} tasks)\n\n`

        md += `#### 🏆 Các công việc đã hoàn thành (${completedTasks.length} tasks - ${completedSP} SP):\n`
        if (completedTasks.length === 0) {
          md += `*(Chưa có công việc nào trong cột Done)*\n`
        } else {
          completedTasks.forEach((t) => {
            const assignees = t.assignees.map((a) => a.user.displayName).join(', ') || 'Chưa gán'
            md += `- [x] **${t.title}** (${t.storyPoint || 0} SP) — *${assignees}*\n`
          })
        }

        md += `\n#### 🔄 Kế hoạch luân chuyển công việc dang dở (${incompleteTasks.length} tasks - ${incompleteSP} SP):\n`
        if (incompleteTasks.length === 0) {
          md += `🎉 **Tuyệt vời!** 100% công việc trong Sprint đã hoàn tất. Không có task nào phải dời sang chu kỳ sau.\n`
        } else {
          const destName = destinationSprint ? destinationSprint.name : 'Backlog mới (Tự động khởi tạo)'
          md += `Các công việc sau sẽ được tự động chuyển sang **"${destName}"**:\n`
          incompleteTasks.forEach((t) => {
            md += `- [ ] **${t.title}** (${t.storyPoint || 0} SP) — *Hiện ở cột: ${t.boardColumn?.title || 'Unknown'}*\n`
          })
        }

        md += `\n> 💡 *Để hoàn tất Sprint thật và cập nhật dữ liệu, hãy gọi lại công cụ với \`dryRun: false\`.*`

        return {
          output: md,
          status: 'SUCCESS',
          summary: `[Xem trước] Hoàn thành Sprint ${sprint.name} (Velocity: ${completedSP} SP, ${completionRate}%)`
        }
      }

      // 5. Thực hiện đóng Sprint thật thông qua Transaction
      let finalDestName = ''

      await this.prisma.$transaction(async (tx) => {
        // 5.1. Nếu có incomplete tasks mà chưa có destinationSprint, tạo một Sprint Backlog để đón nhận
        if (incompleteTasks.length > 0 && !destinationSprint) {
          const newSprintStartDate = new Date()
          const newSprintEndDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

          const rolloverSprint = await tx.sprint.create({
            data: {
              projectId: sprint.projectId,
              name: `Backlog Rollover (from ${sprint.name})`,
              goal: `Tiếp nhận các công việc dang dở từ ${sprint.name}`,
              startDate: newSprintStartDate,
              endDate: newSprintEndDate,
              status: 'PLANNED'
            }
          })

          const createdColIds: string[] = []
          for (const col of DEFAULT_BOARD_COLUMNS) {
            const c = await tx.boardColumn.create({
              data: {
                sprintId: rolloverSprint.id,
                title: col.title,
                color: col.color,
                isDone: col.isDone,
                isWip: col.isWip,
                isBlocked: col.isBlocked,
                isCancelled: col.isCancelled
              }
            })
            createdColIds.push(c.id)
          }

          await tx.sprint.update({
            where: { id: rolloverSprint.id },
            data: { boardColumnIds: createdColIds }
          })

          destinationSprint = { id: rolloverSprint.id, name: rolloverSprint.name }
          destinationColumnId = createdColIds[0]
        }

        finalDestName = destinationSprint ? destinationSprint.name : 'Backlog'

        // 5.2. Di chuyển các incomplete tasks sang destinationSprint và cột đầu tiên
        if (incompleteTasks.length > 0 && destinationSprint && destinationColumnId) {
          const incompleteIds = incompleteTasks.map((t) => t.id)

          // Cập nhật sprintId và boardColumnId
          await tx.task.updateMany({
            where: { id: { in: incompleteIds } },
            data: {
              sprintId: destinationSprint.id,
              boardColumnId: destinationColumnId,
              updatedAt: new Date()
            }
          })

          // Dọn dẹp task order cũ và tạo task order mới trong cột đích
          await tx.boardColumnTaskOrder.deleteMany({
            where: { taskId: { in: incompleteIds } }
          })

          for (let i = 0; i < incompleteIds.length; i++) {
            await tx.boardColumnTaskOrder.create({
              data: {
                boardColumnId: destinationColumnId,
                taskId: incompleteIds[i],
                sortOrder: (i + 1) * 10
              }
            })
          }
        }

        // 5.3. Cập nhật Sprint hiện tại sang COMPLETED
        await tx.sprint.update({
          where: { id: sprint.id },
          data: {
            status: 'COMPLETED',
            endDate: new Date(),
            updatedAt: new Date()
          }
        })
      })

      // 6. Định dạng kết quả thành công
      let outputMd = `### 🏁 Sprint Đã Hoàn Thành Thành Công!\n\n`
      outputMd += `Sprint **${sprint.name}** đã chính thức khép lại và được lưu trữ vào lịch sử dự án **${sprint.project.name}**.\n\n`
      outputMd += `| Chỉ số tổng kết | Kết quả đạt được |\n`
      outputMd += `| :--- | :--- |\n`
      outputMd += `| **Sprint ID** | \`${sprint.id}\` |\n`
      outputMd += `| **Trạng thái** | 🏁 **COMPLETED** |\n`
      outputMd += `| **Velocity thực tế** | **${completedSP} Story Points** |\n`
      outputMd += `| **Tỷ lệ hoàn thành** | **${completionRate}%** (${completedTasks.length}/${allTasks.length} tasks) |\n`
      outputMd += `| **Công việc hoàn tất** | ${completedTasks.length} tasks (${completedSP} SP) |\n`
      outputMd += `| **Công việc chuyển tiếp** | ${incompleteTasks.length} tasks (${incompleteSP} SP) ➡️ *${finalDestName}* |\n\n`

      if (incompleteTasks.length > 0) {
        outputMd += `#### 🔄 Danh sách công việc chưa xong đã chuyển sang "${finalDestName}":\n`
        incompleteTasks.forEach((t) => {
          outputMd += `- ⏳ **${t.title}** (${t.storyPoint || 0} SP)\n`
        })
        outputMd += `\n`
      } else {
        outputMd += `🎉 **Hoàn hảo!** Đội ngũ đã hoàn thành 100% khối lượng công việc đã cam kết trong Sprint này.\n\n`
      }

      outputMd += `> 💡 *Bước tiếp theo: Bạn có thể bắt đầu phiên Sprint Retrospective (\`retroAdvisor\`) hoặc tiến hành lập kế hoạch cho Sprint tiếp theo (\`planSprintsFromBacklog\`).*`

      return {
        output: outputMd,
        status: 'SUCCESS',
        summary: `Đã hoàn thành Sprint "${sprint.name}" (Velocity: ${completedSP} SP, ${completionRate}%)`
      }
    } catch (err: any) {
      this.logger.error(`CompleteSprintTool error: ${err?.message}`, err?.stack)
      return {
        output: `❌ **Lỗi khi kết thúc Sprint:** ${err?.message || err}`,
        status: 'ERROR',
        summary: `Lỗi hoàn thành Sprint ${targetSprintId}`
      }
    }
  }
}
