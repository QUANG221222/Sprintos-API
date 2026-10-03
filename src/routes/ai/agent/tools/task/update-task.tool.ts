import { Injectable } from '@nestjs/common'
import OpenAI from 'openai'
import { randomUUID } from 'crypto'
import { PrismaService } from '~/shared/services/prisma.service'
import { ActionProposal, AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'


type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

@Injectable()
export class UpdateTaskTool implements IAgentTool {
  readonly name = 'updateTask'
  readonly description =
    'Cập nhật thông tin của một công việc hiện có: đổi tiêu đề, mô tả, Story Point, thời gian thi công (duration ngày cho CPM), độ ưu tiên (LOW, MEDIUM, HIGH, CRITICAL) hoặc di chuyển cột trạng thái Kanban (ví dụ sang "In Progress", "Done", "To Do").'
  readonly category: ToolCategory = 'TASK'
  readonly riskLevel: ToolRiskLevel = 'WRITE'
  readonly level: ToolActionLevel = 'WRITE'
  readonly parameters = {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'ID của công việc cần cập nhật (bắt buộc)' },
      title: { type: 'string', description: 'Tiêu đề mới của công việc' },
      description: { type: 'string', description: 'Mô tả chi tiết mới của công việc' },
      storyPoint: { type: 'number', description: 'Số điểm Story Point mới' },
      duration: { type: 'number', description: 'Số ngày thi công mới (cho CPM)' },
      priority: {
        type: 'string',
        enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        description: 'Độ ưu tiên mới của công việc'
      },
      targetColumnName: {
        type: 'string',
        description: 'Tên cột Kanban muốn chuyển task tới (ví dụ: "In Progress", "Done", "To Do", "Testing")'
      },
      dryRun: {
        type: 'boolean',
        description: 'Nếu true, chỉ tính toán và trả về bản xem trước (Preview Diff) các trường thay đổi mà KHÔNG lưu vào DB. Mặc định: false'
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
      title?: string
      description?: string
      storyPoint?: number
      duration?: number
      priority?: TaskPriority
      targetColumnName?: string
    },
    context: AgentContext
  ): Promise<ToolExecutionResult> {
    if (!args.taskId) {
      return {
        output: 'Thiếu taskId để cập nhật công việc.',
        status: 'ERROR',
        summary: 'Thiếu ID Task'
      }
    }

    try {
      const existingTask = await this.prisma.task.findUnique({
        where: { id: args.taskId },
        include: { boardColumn: true }
      })

      if (!existingTask || existingTask.deletedAt) {
        return {
          output: `Không tìm thấy công việc với ID: ${args.taskId}`,
          status: 'ERROR',
          summary: 'Không tìm thấy task'
        }
      }

      let newBoardColumnId = existingTask.boardColumnId
      let newColumnTitle = existingTask.boardColumn.title

      // Nếu có yêu cầu chuyển cột
      if (args.targetColumnName) {
        const columns = await this.prisma.boardColumn.findMany({
          where: { sprintId: existingTask.sprintId, deletedAt: null }
        })

        const matchedCol = columns.find(
          (c) => c.title.toLowerCase().trim() === args.targetColumnName!.toLowerCase().trim()
        ) || columns.find((c) => c.title.toLowerCase().includes(args.targetColumnName!.toLowerCase().trim()))

        if (matchedCol) {
          newBoardColumnId = matchedCol.id
          newColumnTitle = matchedCol.title
        }
      }

      const updateData: any = {}
      if (args.title && args.title.trim().length >= 3) updateData.title = args.title.trim()
      if (args.description !== undefined) updateData.description = args.description?.trim() || null
      if (args.storyPoint !== undefined) updateData.storyPoint = Math.max(0, Math.round(args.storyPoint))
      if (args.duration !== undefined) updateData.duration = Math.max(1, Math.round(args.duration))
      if (args.priority) updateData.priority = args.priority
      if (newBoardColumnId !== existingTask.boardColumnId) updateData.boardColumnId = newBoardColumnId

      const isDryRun = Boolean((args as any).dryRun || context.dryRun)
      if (isDryRun) {
        const diffPreview = {
          mode: 'DRY_RUN_PREVIEW',
          taskId: existingTask.id,
          before: {
            title: existingTask.title,
            description: existingTask.description,
            storyPoint: existingTask.storyPoint,
            duration: existingTask.duration,
            priority: existingTask.priority,
            column: existingTask.boardColumn.title
          },
          after: {
            title: updateData.title ?? existingTask.title,
            description: updateData.description !== undefined ? updateData.description : existingTask.description,
            storyPoint: updateData.storyPoint ?? existingTask.storyPoint,
            duration: updateData.duration ?? existingTask.duration,
            priority: updateData.priority ?? existingTask.priority,
            column: newColumnTitle
          }
        }

        let md = `### 🔍 [Xem Trước Mô Phỏng - Chưa Lưu DB] Cập Nhật Công Việc\n\n`
        md += `* **Công việc:** **${existingTask.title}** (ID: \`${existingTask.id}\`)\n`
        if (updateData.title) md += `* **Tiêu đề:** ${existingTask.title} ➡️ **${updateData.title}**\n`
        if (updateData.storyPoint !== undefined) md += `* **Story Point:** ${existingTask.storyPoint} SP ➡️ **${updateData.storyPoint} SP**\n`
        if (updateData.duration !== undefined) md += `* **Thời lượng CPM:** ${existingTask.duration} ngày ➡️ **${updateData.duration} ngày**\n`
        if (updateData.priority) md += `* **Độ ưu tiên:** ${existingTask.priority} ➡️ **${updateData.priority}**\n`
        if (newBoardColumnId !== existingTask.boardColumnId) md += `* **Cột Kanban:** [${existingTask.boardColumn.title}] ➡️ **[${newColumnTitle}]**\n`
        md += `\n*⚠️ Thao tác đang chạy ở chế độ xem trước (Dry-Run). Cơ sở dữ liệu CHƯA thay đổi.*`

        return {
          output: md,
          status: 'SUCCESS',
          summary: `[Mô phỏng] Dự kiến cập nhật task "${existingTask.title}"`,
          diff: diffPreview
        }
      }

      // Human-in-the-loop: Nếu chưa có sự phê duyệt, sinh ActionProposal
      if (!(args as any).isApproved) {
        const proposalId = (args as any).proposalId || randomUUID()
        const changesSummary = [
          updateData.title ? `Tiêu đề: "${updateData.title}"` : null,
          updateData.storyPoint !== undefined ? `Story Point: ${updateData.storyPoint} SP` : null,
          updateData.duration !== undefined ? `Thời lượng: ${updateData.duration} ngày` : null,
          updateData.priority ? `Ưu tiên: ${updateData.priority}` : null,
          newBoardColumnId !== existingTask.boardColumnId ? `Chuyển cột: [${newColumnTitle}]` : null
        ].filter(Boolean).join(', ')

        const proposal: ActionProposal = {
          id: proposalId,
          type: 'UPDATE_TASK',
          summary: `Cập nhật task "${existingTask.title}": ${changesSummary || 'Chỉnh sửa thông tin'}`,
          payload: {
            taskId: existingTask.id,
            title: updateData.title,
            description: updateData.description,
            storyPoint: updateData.storyPoint,
            duration: updateData.duration,
            priority: updateData.priority,
            targetColumnName: newColumnTitle,
            targetColumnId: newBoardColumnId
          },
          status: 'PENDING',
          createdAt: new Date().toISOString()
        }

        return {
          output: `Tôi đã lập đề xuất cập nhật công việc **"${existingTask.title}"** (${changesSummary || 'thay đổi thông tin'}).\n\nĐề xuất này đã được đính kèm vào thẻ phê duyệt trên màn hình. Bạn vui lòng kiểm tra lại và bấm **[Xác nhận thực thi]** để áp dụng thay đổi.`,
          status: 'SUCCESS',
          summary: `Đề xuất cập nhật task "${existingTask.title}"`,
          actionProposal: proposal
        }
      }

      const updatedTask = await this.prisma.$transaction(async (tx) => {
        const task = await tx.task.update({
          where: { id: args.taskId },
          data: updateData
        })


        // Nếu chuyển sang cột mới -> Cập nhật vị trí hiển thị trong BoardColumnTaskOrder
        if (newBoardColumnId !== existingTask.boardColumnId) {
          const maxOrder = await tx.boardColumnTaskOrder.findFirst({
            where: { boardColumnId: newBoardColumnId },
            orderBy: { sortOrder: 'desc' }
          })
          const nextOrder = (maxOrder?.sortOrder ?? 0) + 1

          await tx.boardColumnTaskOrder.upsert({
            where: {
              id: (
                await tx.boardColumnTaskOrder.findFirst({
                  where: { taskId: args.taskId }
                })
              )?.id || 'unknown'
            },
            create: {
              boardColumnId: newBoardColumnId,
              taskId: args.taskId,
              sortOrder: nextOrder
            },
            update: {
              boardColumnId: newBoardColumnId,
              sortOrder: nextOrder
            }
          })
        }

        return task
      })

      const outputData = {
        taskId: updatedTask.id,
        title: updatedTask.title,
        column: newColumnTitle,
        storyPoint: updatedTask.storyPoint,
        duration: updatedTask.duration,
        priority: updatedTask.priority
      }

      return {
        output: JSON.stringify(outputData, null, 2),
        status: 'SUCCESS',
        summary: `Đã cập nhật task "${updatedTask.title}" (Cột: ${newColumnTitle}, ${updatedTask.storyPoint} SP, ${updatedTask.duration} ngày)`,
        diff: outputData,
        undoAction: {
          action: 'UPDATE_TASK',
          taskId: existingTask.id,
          taskTitle: existingTask.title,
          previousState: {
            title: existingTask.title,
            description: existingTask.description,
            storyPoint: existingTask.storyPoint,
            duration: existingTask.duration,
            priority: existingTask.priority
          },
          newState: outputData,
          summary: `Khôi phục thông tin ban đầu của task "${existingTask.title}"`
        }
      }
    } catch (err: any) {
      return {
        output: `Lỗi khi cập nhật công việc trong cơ sở dữ liệu: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Cập nhật task thất bại'
      }
    }
  }
}
