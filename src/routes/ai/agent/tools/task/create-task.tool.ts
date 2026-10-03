import { Injectable } from '@nestjs/common'
import OpenAI from 'openai'
import { randomUUID } from 'crypto'
import { PrismaService } from '~/shared/services/prisma.service'
import { ActionProposal, AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'


type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

@Injectable()
export class CreateTaskTool implements IAgentTool {
  readonly name = 'createTask'
  readonly description =
    'Tạo một công việc mới trong dự án hoặc Sprint: Tiêu đề, mô tả, Story Point (Fibonacci: 1, 2, 3, 5, 8...), thời gian thi công (duration số ngày làm việc cho CPM), độ ưu tiên (LOW, MEDIUM, HIGH, CRITICAL) và vai trò kỹ thuật (FRONTEND, BACKEND, DEVOPS, QA).'
  readonly category: ToolCategory = 'TASK'
  readonly riskLevel: ToolRiskLevel = 'WRITE'
  readonly level: ToolActionLevel = 'WRITE'
  readonly parameters = {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Tiêu đề công việc cần tạo (bắt buộc, tối thiểu 3 ký tự)' },
      description: { type: 'string', description: 'Mô tả chi tiết yêu cầu công việc hoặc Acceptance Criteria' },
      storyPoint: { type: 'number', description: 'Độ phức tạp Scrum (chuỗi Fibonacci: 1, 2, 3, 5, 8, 13)' },
      duration: { type: 'number', description: 'Thời gian thi công thực tế (số ngày làm việc, dùng cho thuật toán đường găng CPM và Gantt chart)' },
      priority: {
        type: 'string',
        enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        description: 'Độ ưu tiên công việc (mặc định: MEDIUM)'
      },
      role: {
        type: 'string',
        enum: ['FRONTEND', 'BACKEND', 'DEVOPS', 'QA', 'FULLSTACK'],
        description: 'Vai trò kỹ thuật chính phụ trách công việc này'
      },
      sprintId: { type: 'string', description: 'ID của Sprint muốn gán task vào (nếu bỏ trống, tự động gán vào Sprint hiện tại hoặc Backlog)' },
      dryRun: {
        type: 'boolean',
        description: 'Nếu true, chỉ tính toán và trả về bản xem trước (Preview Diff) của task mà KHÔNG tạo thật trong DB. Mặc định: false'
      }
    },
    required: ['title']
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
      title: string
      description?: string
      storyPoint?: number
      duration?: number
      priority?: TaskPriority
      role?: 'FRONTEND' | 'BACKEND' | 'DEVOPS' | 'QA' | 'FULLSTACK'
      sprintId?: string
    },
    context: AgentContext
  ): Promise<ToolExecutionResult> {
    const targetProjectId = context.targetProjectId
    if (!targetProjectId) {
      return {
        output: 'Không xác định được projectId trong ngữ cảnh hiện tại để tạo công việc.',
        status: 'ERROR',
        summary: 'Thiếu ID Dự án'
      }
    }

    if (!args.title || args.title.trim().length < 3) {
      return {
        output: 'Tiêu đề công việc không hợp lệ (phải có ít nhất 3 ký tự).',
        status: 'ERROR',
        summary: 'Tiêu đề task quá ngắn'
      }
    }

    try {
      // 1. Xác định Sprint mục tiêu
      let sprintId = args.sprintId || context.activeSprintId

      if (!sprintId) {
        // Tìm Sprint ACTIVE hoặc PLANNED của dự án
        const targetSprint = await this.prisma.sprint.findFirst({
          where: {
            projectId: targetProjectId,
            status: { in: ['ACTIVE', 'PLANNED'] },
            deletedAt: null
          },
          orderBy: { createdAt: 'desc' }
        })
        sprintId = targetSprint?.id
      }

      if (!sprintId) {
        const anySprint = await this.prisma.sprint.findFirst({
          where: { projectId: targetProjectId, deletedAt: null }
        })
        sprintId = anySprint?.id
      }

      if (!sprintId) {
        return {
          output: 'Dự án hiện chưa có Sprint nào để chứa công việc. Vui lòng tạo Sprint trước.',
          status: 'ERROR',
          summary: 'Dự án chưa có Sprint'
        }
      }

      // 2. Xác định cột ban đầu của Sprint (thường là To Do / cột chưa Done đầu tiên)
      const columns = await this.prisma.boardColumn.findMany({
        where: { sprintId, deletedAt: null }
      })

      if (columns.length === 0) {
        return {
          output: 'Sprint được chọn chưa có cột trạng thái nào trên Kanban Board.',
          status: 'ERROR',
          summary: 'Sprint thiếu Board Columns'
        }
      }

      const initialColumn = columns.find((c) => !c.isDone && c.isWip) || columns.find((c) => !c.isDone) || columns[0]
      const boardColumnId = initialColumn.id

      // 3. Tính toán sortOrder cao nhất trong cột
      const lastTaskOrder = await this.prisma.boardColumnTaskOrder.findFirst({
        where: { boardColumnId },
        orderBy: { sortOrder: 'desc' }
      })
      const nextSortOrder = (lastTaskOrder?.sortOrder ?? 0) + 1

      // 4. Chuẩn hóa giá trị storyPoint và duration (Tuân thủ Điều răn 1)
      const storyPoint = args.storyPoint ? Math.max(0, Math.round(args.storyPoint)) : 1
      const duration = args.duration ? Math.max(1, Math.round(args.duration)) : 1
      const priority: TaskPriority = args.priority || 'MEDIUM'

      if ((args as any).dryRun || context.dryRun) {
        return {
          output: `### 🔍 [Xem Trước Mô Phỏng - Chưa Lưu DB] Tạo Công Việc\n\n* **Tiêu đề:** **${args.title.trim()}**\n* **Cột ban đầu:** [${initialColumn.title}]\n* **Story Points:** ${storyPoint} SP\n* **Thời lượng thi công (CPM):** ${duration} ngày\n* **Độ ưu tiên:** ${priority}\n* **Vai trò kỹ thuật:** ${args.role || 'Chưa gán'}\n* **Vị trí trong cột:** #${nextSortOrder}\n\n*⚠️ Thao tác đang chạy ở chế độ xem trước (Dry-Run). Task chưa được ghi vào DB.*`,
          status: 'SUCCESS',
          summary: `[Mô phỏng] Dự kiến tạo task "${args.title.trim()}" (${storyPoint} SP, ${duration}d)`,
          diff: {
            mode: 'DRY_RUN_PREVIEW',
            title: args.title.trim(),
            storyPoint,
            duration,
            priority,
            role: args.role,
            column: initialColumn.title,
            sprintId
          }
        }
      }

      // 4b. Human-in-the-loop: Nếu chưa có sự phê duyệt của người dùng, sinh ActionProposal
      if (!(args as any).isApproved) {
        const proposalId = (args as any).proposalId || crypto.randomUUID()
        const proposal: ActionProposal = {
          id: proposalId,
          type: 'CREATE_TASK',
          summary: `Tạo công việc "${args.title.trim()}" (${storyPoint} SP, ${duration} ngày tại cột [${initialColumn.title}])`,
          payload: {
            title: args.title.trim(),
            description: args.description?.trim() || null,
            storyPoint,
            duration,
            priority,
            role: args.role,
            sprintId,
            boardColumnId,
            columnTitle: initialColumn.title
          },
          status: 'PENDING',
          createdAt: new Date().toISOString()
        }

        return {
          output: `Tôi đã lập đề xuất tạo công việc: **"${args.title.trim()}"** (${storyPoint} Story Points, ${duration} ngày thi công cho CPM) tại cột **[${initialColumn.title}]**.\n\nĐề xuất này đã được đính kèm vào thẻ phê duyệt trên màn hình. Bạn vui lòng kiểm tra lại thông tin và bấm nút **[Xác nhận thực thi]** để lưu công việc vào cơ sở dữ liệu.`,
          status: 'SUCCESS',
          summary: `Đề xuất tạo công việc: "${args.title.trim()}" (${storyPoint} SP, ${duration}d)`,
          actionProposal: proposal
        }
      }

      // 5. Thực thi Prisma Transaction tạo Task + Thứ tự hiển thị + Label

      const createdTask = await this.prisma.$transaction(async (tx) => {
        const newTask = await tx.task.create({
          data: {
            sprintId,
            boardColumnId,
            title: args.title.trim(),
            description: args.description?.trim() || null,
            storyPoint,
            duration,
            priority,
            type: 'TASK'
          }
        })

        await tx.boardColumnTaskOrder.create({
          data: {
            boardColumnId,
            taskId: newTask.id,
            sortOrder: nextSortOrder
          }
        })

        if (args.role) {
          await tx.taskLabel.create({
            data: {
              taskId: newTask.id,
              label: args.role
            }
          })
        }

        return newTask
      })

      const outputData = {
        taskId: createdTask.id,
        title: createdTask.title,
        sprintId: createdTask.sprintId,
        column: initialColumn.title,
        storyPoint: createdTask.storyPoint,
        duration: createdTask.duration,
        priority: createdTask.priority,
        role: args.role || 'Chưa gán'
      }

      return {
        output: JSON.stringify(outputData, null, 2),
        status: 'SUCCESS',
        summary: `Đã tạo task thành công: "${createdTask.title}" (${storyPoint} SP, ${duration} ngày thi công tại cột [${initialColumn.title}])`
      }
    } catch (err: any) {
      return {
        output: `Lỗi khi tạo công việc trong cơ sở dữ liệu: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Tạo công việc thất bại'
      }
    }
  }
}
