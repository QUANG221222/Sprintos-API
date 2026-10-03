import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { randomUUID } from 'crypto'
import { PrismaService } from '~/shared/services/prisma.service'
import { ActionProposal, AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'


@Injectable()
export class MoveTaskColumnTool implements IAgentTool {
  private readonly logger = new Logger(MoveTaskColumnTool.name)

  readonly name = 'moveTaskColumn'
  readonly description =
    'Di chuyển một công việc (Task) giữa các cột Kanban trên bảng Sprint (ví dụ: chuyển từ "To Do" sang "In Progress", "Code Review" hoặc "Done"). ' +
    'Tự động cập nhật boardColumnId, tính toán và đồng bộ lại sortOrder trong bảng BoardColumnTaskOrder, ' +
    'và tự động kiểm tra giới hạn WIP limit để cảnh báo nguy cơ tắc nghẽn cổ chai (bottleneck) trong quy trình Agile.'

  readonly category: ToolCategory = 'KANBAN'
  readonly riskLevel: ToolRiskLevel = 'WRITE'
  readonly level: ToolActionLevel = 'WRITE'

  readonly parameters = {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'ID của công việc cần di chuyển cột (bắt buộc)'
      },
      targetColumnName: {
        type: 'string',
        description: 'Tên cột Kanban muốn chuyển tới (ví dụ: "In Progress", "Done", "Review", "To Do")'
      },
      targetColumnId: {
        type: 'string',
        description: 'ID của cột Kanban đích (tùy chọn nếu đã cung cấp targetColumnName)'
      },
      position: {
        type: 'string',
        enum: ['TOP', 'BOTTOM'],
        description: 'Vị trí đặt thẻ công việc trong cột đích (mặc định: "BOTTOM" - cuối cột)'
      },
      wipLimit: {
        type: 'number',
        description: 'Ngưỡng giới hạn số task tối đa cho cột đang làm (WIP limit) để cảnh báo tắc nghẽn (mặc định: 5)'
      },
      dryRun: {
        type: 'boolean',
        description: 'Nếu true, chỉ tính toán và trả về bản xem trước (Preview Diff) thay đổi cột mà KHÔNG cập nhật DB. Mặc định: false'
      }
    },
    required: ['taskId']
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

  async execute(
    args: {
      taskId: string
      targetColumnName?: string
      targetColumnId?: string
      position?: 'TOP' | 'BOTTOM'
      wipLimit?: number
    },
    context: AgentContext
  ): Promise<ToolExecutionResult> {
    const { taskId, targetColumnName, targetColumnId, position = 'BOTTOM', wipLimit = 5 } = args

    if (!taskId) {
      return {
        output: 'Thiếu taskId của công việc cần di chuyển cột.',
        status: 'ERROR',
        summary: 'Thiếu tham số taskId'
      }
    }

    if (!targetColumnName && !targetColumnId) {
      return {
        output: 'Vui lòng cung cấp "targetColumnName" hoặc "targetColumnId" của cột đích cần chuyển tới.',
        status: 'ERROR',
        summary: 'Thiếu thông tin cột đích'
      }
    }

    try {
      // 1. Lấy thông tin Task hiện tại
      const task = await this.prisma.task.findUnique({
        where: { id: taskId, deletedAt: null },
        include: {
          boardColumn: true,
          sprint: { select: { id: true, name: true, projectId: true } },
          assignees: { include: { user: { select: { displayName: true } } } }
        }
      })

      if (!task) {
        return {
          output: `Không tìm thấy công việc với ID "${taskId}" hoặc task đã bị xóa.`,
          status: 'ERROR',
          summary: 'Task không tồn tại'
        }
      }

      // 2. Lấy danh sách các cột trong Sprint của Task
      const columns = await this.prisma.boardColumn.findMany({
        where: { sprintId: task.sprintId, deletedAt: null },
        orderBy: { createdAt: 'asc' }
      })

      if (columns.length === 0) {
        return {
          output: `Sprint "${task.sprint.name}" không có cột Kanban nào hợp lệ.`,
          status: 'ERROR',
          summary: 'Sprint thiếu Board Columns'
        }
      }

      // 3. Xác định cột đích
      let targetColumn = columns.find((c) => c.id === targetColumnId)

      if (!targetColumn && targetColumnName) {
        const queryName = targetColumnName.toLowerCase().trim()
        targetColumn =
          columns.find((c) => c.title.toLowerCase().trim() === queryName) ||
          columns.find((c) => c.title.toLowerCase().includes(queryName))
      }

      if (!targetColumn) {
        const availableColNames = columns.map((c) => `"${c.title}"`).join(', ')
        return {
          output: `Không tìm thấy cột đích "${targetColumnName || targetColumnId}" trong Sprint "${task.sprint.name}". Các cột khả dụng hiện tại: ${availableColNames}.`,
          status: 'ERROR',
          summary: 'Cột đích không tồn tại'
        }
      }

      // Nếu task đã ở sẵn cột đích
      if (task.boardColumnId === targetColumn.id) {
        return {
          output: `Công việc "${task.title}" hiện đã nằm sẵn ở cột [${targetColumn.title}]. Không cần di chuyển.`,
          status: 'SUCCESS',
          summary: `Task đã ở cột [${targetColumn.title}]`
        }
      }

      // 4. Kiểm tra giới hạn WIP Limit của cột đích
      const existingTasksInTargetCol = await this.prisma.task.count({
        where: { boardColumnId: targetColumn.id, deletedAt: null }
      })

      const isWipExceeded = Boolean(targetColumn.isWip && existingTasksInTargetCol >= wipLimit)
      let wipWarning: string | null = null

      if (isWipExceeded) {
        wipWarning = `⚠️ Cảnh báo tắc nghẽn (WIP Limit Exceeded): Cột đích [${targetColumn.title}] hiện đang có ${existingTasksInTargetCol} tasks (ngưỡng WIP khuyến nghị là ${wipLimit} tasks). Việc tiếp tục đẩy thêm công việc vào cột này có thể làm giảm thông lượng (Throughput) và tăng thời gian chu kỳ (Cycle Time) của cả đội ngũ.`
      }

      // 5. Kiểm tra chế độ Chạy thử (Dry Run)
      const fromColumnTitle = task.boardColumn.title
      const isDryRun = Boolean((args as any).dryRun || context.dryRun)

      if (isDryRun) {
        let md = `### 🔍 [Xem Trước Mô Phỏng - Chưa Lưu DB] Di Chuyển Cột Kanban\n\n`
        md += `* **Công việc:** **${task.title}** (ID: \`${task.id}\`)\n`
        md += `* **Sprint:** ${task.sprint.name}\n`
        md += `* **Cột hiện tại:** [${fromColumnTitle}]\n`
        md += `* **Cột đích dự kiến:** **[${targetColumn.title}]**\n`
        md += `* **Vị trí dự kiến:** ${position === 'TOP' ? 'Đầu cột (#1)' : `Cuối cột (#${existingTasksInTargetCol + 1})`}\n`
        md += `* **Trạng thái đích:** ${targetColumn.isDone ? '🟢 Đã hoàn thành (Done)' : targetColumn.isWip ? '🔵 Đang thực hiện (In Progress)' : '⚪ Chờ làm (To Do)'}\n\n`
        if (wipWarning) md += `> ${wipWarning}\n\n`
        md += `*⚠️ Lưu ý: Thao tác đang chạy ở chế độ xem trước (Dry-Run). Dữ liệu thật CHƯA bị thay đổi.*`

        return {
          output: md,
          status: 'SUCCESS',
          summary: `[Mô phỏng] Dự kiến chuyển "${task.title}" sang [${targetColumn.title}]`,
          diff: {
            mode: 'DRY_RUN_PREVIEW',
            taskId: task.id,
            fromColumn: fromColumnTitle,
            toColumn: targetColumn.title,
            wipWarning
          }
        }
      }

      // Human-in-the-loop: Nếu chưa có sự phê duyệt, sinh ActionProposal
      if (!(args as any).isApproved) {
        const proposalId = (args as any).proposalId || randomUUID()
        const proposal: ActionProposal = {
          id: proposalId,
          type: 'MOVE_TASK',
          summary: `Di chuyển task "${task.title}" từ cột [${fromColumnTitle}] sang [${targetColumn.title}]`,
          payload: {
            taskId: task.id,
            taskTitle: task.title,
            currentColumnName: fromColumnTitle,
            targetColumnId: targetColumn.id,
            targetColumnName: targetColumn.title,
            position,
            wipLimit
          },
          status: 'PENDING',
          createdAt: new Date().toISOString()
        }

        return {
          output: `Tôi đã lập đề xuất di chuyển công việc **"${task.title}"** từ cột **[${fromColumnTitle}]** sang cột **[${targetColumn.title}]** (vị trí: ${position === 'TOP' ? 'Đầu cột' : 'Cuối cột'}).\n\n${wipWarning ? `> ${wipWarning}\n\n` : ''}Đề xuất này đã được đính kèm vào thẻ phê duyệt trên màn hình. Bạn vui lòng kiểm tra và bấm **[Xác nhận thực thi]** để di chuyển công việc.`,
          status: 'SUCCESS',
          summary: `Đề xuất chuyển "${task.title}" sang [${targetColumn.title}]`,
          actionProposal: proposal
        }
      }

      // 6. Thực thi Transaction chuyển cột và cập nhật BoardColumnTaskOrder
      const prevOrderRecord = await this.prisma.boardColumnTaskOrder.findFirst({

        where: { taskId: task.id, boardColumnId: task.boardColumnId }
      })

      const result = await this.prisma.$transaction(async (tx) => {
        let newSortOrder = 1

        if (position === 'TOP') {
          // Đẩy tất cả task hiện có trong cột đích xuống 1 bậc
          await tx.boardColumnTaskOrder.updateMany({
            where: { boardColumnId: targetColumn.id },
            data: { sortOrder: { increment: 1 } }
          })
          newSortOrder = 1
        } else {
          // Đặt xuống cuối cột (BOTTOM)
          const lastOrder = await tx.boardColumnTaskOrder.findFirst({
            where: { boardColumnId: targetColumn.id },
            orderBy: { sortOrder: 'desc' }
          })
          newSortOrder = (lastOrder?.sortOrder ?? 0) + 1
        }

        // Cập nhật task
        const updatedTask = await tx.task.update({
          where: { id: task.id },
          data: {
            boardColumnId: targetColumn.id
          }
        })

        // Tìm hoặc tạo mới bản ghi BoardColumnTaskOrder
        const existingOrder = await tx.boardColumnTaskOrder.findFirst({
          where: { taskId: task.id }
        })

        if (existingOrder) {
          await tx.boardColumnTaskOrder.update({
            where: { id: existingOrder.id },
            data: {
              boardColumnId: targetColumn.id,
              sortOrder: newSortOrder
            }
          })
        } else {
          await tx.boardColumnTaskOrder.create({
            data: {
              boardColumnId: targetColumn.id,
              taskId: task.id,
              sortOrder: newSortOrder
            }
          })
        }

        return updatedTask
      })

      // 7. Định dạng Markdown trực quan
      let md = `### 🔄 Di Chuyển Cột Kanban Thành Công\n\n`
      md += `* **Công việc:** **${result.title}** (ID: \`${result.id}\`)\n`
      md += `* **Sprint:** ${task.sprint.name}\n`
      md += `* **Chuyển từ cột:** [${fromColumnTitle}] ➡️ **[${targetColumn.title}]**\n`
      md += `* **Vị trí trong cột mới:** ${position === 'TOP' ? 'Đầu cột (#1)' : `Cuối cột (#${existingTasksInTargetCol + 1})`}\n`
      md += `* **Trạng thái cột đích:** ${targetColumn.isDone ? '🟢 Đã hoàn thành (Done)' : targetColumn.isWip ? '🔵 Đang thực hiện (In Progress)' : '⚪ Chờ làm (To Do)'}\n\n`

      if (wipWarning) {
        md += `> ${wipWarning}\n\n`
      }

      const payload = {
        taskId: result.id,
        taskTitle: result.title,
        sprintId: task.sprintId,
        fromColumn: fromColumnTitle,
        toColumn: targetColumn.title,
        toColumnId: targetColumn.id,
        position,
        isWipExceeded,
        wipWarning
      }

      return {
        output: `${md}\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        status: 'SUCCESS',
        summary: `Đã chuyển "${result.title}" từ [${fromColumnTitle}] sang [${targetColumn.title}]${wipWarning ? ' (Có cảnh báo WIP)' : ''}`,
        diff: payload,
        undoAction: {
          action: 'MOVE_TASK',
          taskId: task.id,
          taskTitle: task.title,
          previousState: {
            columnId: task.boardColumnId,
            sortOrder: prevOrderRecord?.sortOrder ?? 0
          },
          newState: {
            columnId: targetColumn.id
          },
          summary: `Khôi phục task "${task.title}" về cột [${fromColumnTitle}]`
        }
      }
    } catch (err: any) {
      this.logger.error(`MoveTaskColumnTool error: ${err?.message}`, err?.stack)
      return {
        output: `Lỗi khi di chuyển công việc giữa các cột Kanban: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Lỗi di chuyển cột task'
      }
    }
  }
}
