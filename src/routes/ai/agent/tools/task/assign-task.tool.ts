import { Injectable } from '@nestjs/common'
import OpenAI from 'openai'
import { randomUUID } from 'crypto'
import { Prisma } from '~/generated/prisma/client'
import { PrismaService } from '~/shared/services/prisma.service'
import { ActionProposal, AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'


// Ngưỡng quá tải - ai đang quá tải thì không gán thêm
const OVERLOAD_THRESHOLD_SP = 15

@Injectable()
export class AssignTaskTool implements IAgentTool {
  readonly name = 'assignTask'
  readonly description =
    'Gán hoặc tái phân bổ một task cho thành viên dự án phù hợp. ' +
    'Tự động kiểm tra tải công việc hiện tại (Story Points đang assigned) của thành viên mục tiêu và cảnh báo nếu họ đang Overloaded (>15 SP chưa hoàn thành). ' +
    'Level 3: WRITE - Yêu cầu User duyệt trước khi ghi vào Database.'
  readonly category: ToolCategory = 'TASK'
  readonly riskLevel: ToolRiskLevel = 'WRITE'
  readonly level: ToolActionLevel = 'WRITE'
  readonly parameters = {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'ID của task cần gán người phụ trách (bắt buộc)'
      },
      assigneeEmail: {
        type: 'string',
        description: 'Email của thành viên cần gán (ưu tiên). Dùng email hoặc tên hiển thị.'
      },
      assigneeName: {
        type: 'string',
        description: 'Tên hiển thị (displayName) của thành viên cần gán (nếu không có email)'
      },
      replaceExisting: {
        type: 'boolean',
        description: 'true = Xóa tất cả assignees cũ và gán mới. false (mặc định) = Thêm vào danh sách assignees hiện có.'
      },
      dryRun: {
        type: 'boolean',
        description: 'Nếu true, chỉ tính toán tải và trả về bản xem trước (Preview Diff) mà KHÔNG cập nhật DB. Mặc định: false'
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
      assigneeEmail?: string
      assigneeName?: string
      replaceExisting?: boolean
    },
    context: AgentContext
  ): Promise<ToolExecutionResult> {
    if (!args.taskId) {
      return { output: 'Thiếu taskId để gán người phụ trách.', status: 'ERROR', summary: 'Thiếu ID Task' }
    }

    if (!args.assigneeEmail && !args.assigneeName) {
      return {
        output: 'Cần cung cấp ít nhất assigneeEmail hoặc assigneeName để tìm kiếm thành viên.',
        status: 'ERROR',
        summary: 'Thiếu thông tin người được gán'
      }
    }

    try {
      // 1. Kiểm tra task tồn tại
      const task = await this.prisma.task.findUnique({
        where: { id: args.taskId, deletedAt: null },
        include: {
          boardColumn: { select: { title: true } },
          assignees: { include: { user: { select: { displayName: true, email: true } } } }
        }
      })

      if (!task) {
        return { output: `Không tìm thấy task với ID: ${args.taskId}`, status: 'ERROR', summary: 'Task không tồn tại' }
      }

      // 2. Tìm user theo email hoặc tên
      const projectId = context.targetProjectId
      let targetUser: { id: string; displayName: string | null; email: string } | null = null

      if (projectId) {
        // Tìm trong danh sách thành viên dự án qua userId lookup
        const userWhereClauses: Prisma.UserWhereInput[] = []
        if (args.assigneeEmail) userWhereClauses.push({ email: { contains: args.assigneeEmail, mode: Prisma.QueryMode.insensitive } })
        if (args.assigneeName) userWhereClauses.push({ displayName: { contains: args.assigneeName, mode: Prisma.QueryMode.insensitive } })

        if (userWhereClauses.length > 0) {
          const matchedUser = await this.prisma.user.findFirst({
            where: { OR: userWhereClauses },
            select: { id: true, displayName: true, email: true }
          })

          if (matchedUser) {
            // Xác nhận user này là thành viên dự án
            const membership = await this.prisma.projectMember.findFirst({
              where: { projectId, memberId: matchedUser.id, status: 'ACTIVE' }
            })
            if (membership) {
              targetUser = matchedUser
            }
          }
        }
      }

      if (!targetUser) {
        // Fallback: tìm trực tiếp trong bảng User (nếu không tìm thấy trong project members)
        const userWhereClauses: Prisma.UserWhereInput[] = []
        if (args.assigneeEmail) userWhereClauses.push({ email: { contains: args.assigneeEmail, mode: Prisma.QueryMode.insensitive } })
        if (args.assigneeName) userWhereClauses.push({ displayName: { contains: args.assigneeName, mode: Prisma.QueryMode.insensitive } })

        if (userWhereClauses.length > 0) {
          targetUser = await this.prisma.user.findFirst({
            where: { OR: userWhereClauses },
            select: { id: true, displayName: true, email: true }
          })
        }
      }

      if (!targetUser) {
        return {
          output: `Không tìm thấy thành viên dự án với email "${args.assigneeEmail || ''}" hoặc tên "${args.assigneeName || ''}".`,
          status: 'ERROR',
          summary: 'Không tìm thấy thành viên'
        }
      }

      // 3. Kiểm tra tải công việc hiện tại của người được gán
      const sprintId = task.sprintId
      let userCurrentLoad = 0

      if (sprintId) {
        const userTasks = await this.prisma.task.findMany({
          where: {
            sprintId,
            deletedAt: null,
            assignees: { some: { userId: targetUser.id } },
            boardColumn: { isDone: false }
          },
          select: { storyPoint: true }
        })
        userCurrentLoad = userTasks.reduce((sum, t) => sum + (t.storyPoint || 0), 0)
      }

      const isOverloaded = userCurrentLoad > OVERLOAD_THRESHOLD_SP
      const taskSP = task.storyPoint || 0
      const projectedLoad = userCurrentLoad + taskSP

      // 4. Cảnh báo nếu quá tải nhưng vẫn cho phép gán (với cảnh báo rõ ràng)
      const overloadWarning =
        isOverloaded || projectedLoad > OVERLOAD_THRESHOLD_SP
          ? `⚠️ CẢNH BÁO TẢI: ${targetUser.displayName || targetUser.email} đang có ${userCurrentLoad} SP chưa hoàn thành. Sau khi gán thêm task "${task.title}" (${taskSP} SP), tổng tải sẽ là ${projectedLoad} SP (vượt ngưỡng Overloaded ${OVERLOAD_THRESHOLD_SP} SP).`
          : null

      // 5. Kiểm tra đã assigned chưa
      const alreadyAssigned = task.assignees.some((a: any) => a.userId === targetUser!.id || a.user?.id === targetUser!.id)

      if (alreadyAssigned && !args.replaceExisting) {
        return {
          output: JSON.stringify({
            message: `${targetUser.displayName || targetUser.email} đã được gán vào task này rồi.`,
            taskTitle: task.title,
            overloadWarning
          }),
          status: 'SUCCESS',
          summary: `${targetUser.displayName || targetUser.email} đã là assignee của task "${task.title}"`
        }
      }

      if ((args as any).dryRun || context.dryRun) {
        return {
          output: `### 🔍 [Xem Trước Mô Phỏng - Chưa Lưu DB] Phân Công Công Việc\n\n* **Công việc:** **${task.title}** (${taskSP} SP)\n* **Thành viên:** **${targetUser.displayName || targetUser.email}**\n* **Tải hiện tại:** ${userCurrentLoad} SP ➡️ **Sau khi gán: ${projectedLoad} SP**\n* **Chế độ:** ${args.replaceExisting ? 'Thay thế toàn bộ người phụ trách cũ' : 'Thêm vào người phụ trách hiện có'}\n\n${overloadWarning ? `> ${overloadWarning}\n\n` : ''}*⚠️ Thao tác đang chạy ở chế độ xem trước (Dry-Run). Cơ sở dữ liệu CHƯA thay đổi.*`,
          status: 'SUCCESS',
          summary: `[Mô phỏng] Dự kiến gán task "${task.title}" cho ${targetUser.displayName || targetUser.email}`,
          diff: {
            mode: 'DRY_RUN_PREVIEW',
            taskId: task.id,
            targetUserId: targetUser.id,
            targetUserName: targetUser.displayName || targetUser.email,
            userCurrentLoad,
            projectedLoad,
            overloadWarning
          }
        }
      }

      // Human-in-the-loop: Nếu chưa có sự phê duyệt, sinh ActionProposal
      if (!(args as any).isApproved) {
        const proposalId = (args as any).proposalId || randomUUID()
        const proposal: ActionProposal = {
          id: proposalId,
          type: 'ASSIGN_TASK',
          summary: `Gán công việc "${task.title}" (${taskSP} SP) cho ${targetUser.displayName || targetUser.email} (tổng tải: ${projectedLoad} SP)`,
          payload: {
            taskId: task.id,
            taskTitle: task.title,
            targetUserId: targetUser.id,
            targetUserName: targetUser.displayName || targetUser.email,
            assigneeEmail: targetUser.email,
            replaceExisting: Boolean(args.replaceExisting),
            overloadWarning
          },
          status: 'PENDING',
          createdAt: new Date().toISOString()
        }

        return {
          output: `Tôi đã lập đề xuất phân công công việc **"${task.title}"** (${taskSP} SP) cho thành viên **${targetUser.displayName || targetUser.email}** (tổng tải dự kiến: ${projectedLoad} SP).\n\n${overloadWarning ? `> ${overloadWarning}\n\n` : ''}Đề xuất này đã được đính kèm vào thẻ phê duyệt trên màn hình. Bạn vui lòng kiểm tra lại và bấm **[Xác nhận thực thi]** để hoàn tất phân công.`,
          status: 'SUCCESS',
          summary: `Đề xuất gán task "${task.title}" cho ${targetUser.displayName || targetUser.email}`,
          actionProposal: proposal
        }
      }

      // 6. Thực thi gán trong transaction

      await this.prisma.$transaction(async (tx) => {
        if (args.replaceExisting) {
          // Xóa tất cả assignees cũ
          await tx.taskAssignee.deleteMany({ where: { taskId: args.taskId } })
        }

        // Thêm assignee mới (upsert để tránh duplicate)
        await tx.taskAssignee.upsert({
          where: { taskId_userId: { taskId: args.taskId, userId: targetUser!.id } },
          create: { taskId: args.taskId, userId: targetUser!.id },
          update: {}
        })
      })

      const outputData = {
        taskId: task.id,
        taskTitle: task.title,
        taskStoryPoints: taskSP,
        assignedTo: {
          id: targetUser.id,
          name: targetUser.displayName || targetUser.email,
          email: targetUser.email
        },
        replacedPreviousAssignees: args.replaceExisting || false,
        workloadAfterAssignment: projectedLoad,
        overloadWarning
      }

      return {
        output: JSON.stringify(outputData, null, 2),
        status: 'SUCCESS',
        summary: `Đã gán task "${task.title}" (${taskSP} SP) cho ${targetUser.displayName || targetUser.email}${isOverloaded ? ' ⚠️ CẢNH BÁO QUÁ TẢI' : ''}`
      }
    } catch (err: any) {
      return {
        output: `Lỗi khi gán thành viên cho task: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Gán task thất bại'
      }
    }
  }
}
