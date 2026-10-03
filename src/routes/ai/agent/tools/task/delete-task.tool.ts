import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { randomUUID } from 'crypto'
import { PrismaService } from '~/shared/services/prisma.service'
import { ActionProposal, AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'


@Injectable()
export class DeleteTaskTool implements IAgentTool {
  private readonly logger = new Logger(DeleteTaskTool.name)

  readonly name = 'deleteTask'
  readonly description =
    'Xóa một công việc (Task). ' +
    '⚠️ ĐÂY LÀ THAO TÁC NGUY HIỂM (LEVEL 4: DANGEROUS) VÀ BẮT BUỘC XÁC NHẬN BẰNG THAM SỐ "confirm: true". ' +
    'Hệ thống tự động kiểm tra tác động đến sơ đồ tiến độ CPM (các task kế thừa phụ thuộc), ' +
    'các subtasks con kèm theo, và tự động dọn dẹp các liên kết liên quan (TaskDependency, BoardColumnTaskOrder, TaskAssignee).'

  readonly category: ToolCategory = 'TASK'
  readonly riskLevel: ToolRiskLevel = 'DANGEROUS'
  readonly level: ToolActionLevel = 'DANGEROUS'

  readonly parameters = {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'ID của công việc cần xóa (bắt buộc)'
      },
      confirm: {
        type: 'boolean',
        description: 'Xác nhận xóa: BẮT BUỘC phải là true để tiến hành xóa dữ liệu. Nếu false, hệ thống chỉ hiển thị hộp thoại cảnh báo nguy cơ và tác động.'
      },
      dryRun: {
        type: 'boolean',
        description: 'Nếu true, chỉ tính toán và trả về bản xem trước (Preview Diff) các ràng buộc sẽ bị xóa mà KHÔNG xóa thật khỏi DB. Mặc định: false'
      },
      deleteSubtasks: {
        type: 'boolean',
        description: 'Nếu true, tự động xóa luôn các công việc con (Subtasks) thuộc công việc này (mặc định: true)'
      },
      isHardDelete: {
        type: 'boolean',
        description: 'Nếu true, xóa vĩnh viễn khỏi DB (Hard delete). Nếu false, xóa mềm (Soft delete với deletedAt) để có thể khôi phục (mặc định: false)'
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

  async execute(args: any, context: AgentContext): Promise<ToolExecutionResult> {
    const taskId = args.taskId
    if (!taskId) {
      return {
        output: '❌ **Lỗi:** Không tìm thấy `taskId`. Vui lòng chỉ định ID của task cần xóa.',
        status: 'ERROR',
        summary: 'Thiếu taskId để xóa task'
      }
    }

    const confirm = args.confirm === true
    const deleteSubtasks = args.deleteSubtasks !== false
    const isHardDelete = Boolean(args.isHardDelete)

    try {
      // 1. Truy vấn thông tin task và các liên kết phụ thuộc
      const task = await this.prisma.task.findFirst({
        where: { id: taskId, deletedAt: null },
        include: {
          sprint: { select: { id: true, name: true, projectId: true } },
          boardColumn: { select: { id: true, title: true } },
          assignees: { include: { user: { select: { displayName: true } } } },
          subTasks: {
            where: { deletedAt: null },
            select: { id: true, title: true, storyPoint: true }
          },
          predecessors: {
            include: { predecessor: { select: { id: true, title: true } } }
          },
          successors: {
            include: { successor: { select: { id: true, title: true } } }
          }
        }
      })

      if (!task) {
        return {
          output: `❌ **Lỗi:** Không tìm thấy công việc với ID "${taskId}" hoặc công việc này đã bị xóa trước đó.`,
          status: 'ERROR',
          summary: `Task không tồn tại: ${taskId}`
        }
      }

      // 2. NẾU CHƯA XÁC NHẬN (confirm !== true) HOẶC ĐANG DRY-RUN ➡️ HIỂN THỊ HỘP THOẠI CẢNH BÁO NGUY HIỂM 2 BƯỚC
      if (!confirm || args.dryRun || context.dryRun) {
        let warningMd = `### ⚠️ HỘP THOẠI XÁC NHẬN XÓA CÔNG VIỆC (LEVEL 4: DANGEROUS)\n\n`
        warningMd += `Bạn đang yêu cầu **xóa công việc** sau đây khỏi hệ thống:\n\n`
        warningMd += `* **Tiêu đề:** **${task.title}**\n`
        warningMd += `* **Mã ID:** \`${task.id}\`\n`
        warningMd += `* **Sprint:** ${task.sprint?.name || 'Backlog'}\n`
        warningMd += `* **Cột hiện tại:** ${task.boardColumn?.title || 'Unknown'}\n`
        warningMd += `* **Ước lượng:** ${task.storyPoint} SP | Thời lượng: ${task.duration || 0} ngày\n`
        warningMd += `* **Người phụ trách:** ${task.assignees.map((a) => a.user.displayName).join(', ') || 'Chưa gán'}\n\n`

        // Phân tích tác động phụ thuộc CPM
        if (task.successors.length > 0) {
          warningMd += `#### 🚨 Tác động nghiêm trọng đến sơ đồ tiến độ CPM:\n`
          warningMd += `Công việc này đang là **tiền nhiệm (Predecessor)** trực tiếp của **${task.successors.length} công việc** khác:\n`
          task.successors.forEach((s) => {
            warningMd += `- ⏳ **${s.successor.title}** (\`${s.successor.id}\`) — Ràng buộc: ${s.type} (Lag: ${s.lag}d)\n`
          })
          warningMd += `> *Nếu xóa task này, các ràng buộc trên sẽ bị gỡ bỏ, làm thay đổi toàn bộ đường găng Critical Path của dự án!*\n\n`
        }

        // Phân tích tác động subtasks
        if (task.subTasks.length > 0) {
          warningMd += `#### 📂 Các công việc con (Subtasks) bị ảnh hưởng:\n`
          warningMd += `Task này đang chứa **${task.subTasks.length} subtasks**:\n`
          task.subTasks.forEach((st) => {
            warningMd += `- 📌 **${st.title}** (${st.storyPoint} SP)\n`
          })
          warningMd += `> *Chế độ xóa subtask: ${deleteSubtasks ? '**Sẽ xóa toàn bộ subtasks con**' : '**Giữ lại subtasks nhưng gỡ quan hệ cha**'}.*\n\n`
        }

        warningMd += `🔴 **Chế độ xóa:** ${isHardDelete ? '**XÓA VĨNH VIỄN KHỎI CƠ SỞ DỮ LIỆU (KHÔNG THỂ PHỤC HỒI)**' : '**Xóa mềm (Soft Delete - có thể khôi phục nếu cần)**'}\n\n`
        warningMd += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
        warningMd += `👉 **Để xác nhận thực hiện xóa, vui lòng gọi lại công cụ này với tham số:**\n`
        warningMd += `\`\`\`json\n{\n  "taskId": "${task.id}",\n  "confirm": true\n}\n\`\`\``

        return {
          output: warningMd,
          status: 'SUCCESS',
          summary: `[Yêu cầu xác nhận] Cảnh báo xóa task "${task.title}"`
        }
      }

      // Human-in-the-loop: Nếu chưa có sự phê duyệt, sinh ActionProposal
      if (!(args as any).isApproved) {
        const proposalId = (args as any).proposalId || randomUUID()
        const proposal: ActionProposal = {
          id: proposalId,
          type: 'DELETE_TASK',
          summary: `Xóa task "${task.title}" (kèm ${task.subTasks.length} subtasks)`,
          payload: {
            taskId: task.id,
            taskTitle: task.title,
            deleteSubtasks,
            isHardDelete,
            confirm: true
          },
          status: 'PENDING',
          createdAt: new Date().toISOString()
        }

        return {
          output: `⚠️ **CẢNH BÁO NGUY HIỂM:** Bạn đang yêu cầu xóa công việc **"${task.title}"** (ID: \`${task.id}\`, ${task.storyPoint || 0} SP).\n\n* Thao tác này sẽ gỡ bỏ các liên kết phụ thuộc CPM và ${task.subTasks.length} subtasks liên quan.\n* Đề xuất xóa đã được chuyển lên thẻ phê duyệt (màu đỏ). Bạn vui lòng cân nhắc kỹ và bấm **[Xác nhận thực thi]** nếu thực sự muốn xóa.`,
          status: 'SUCCESS',
          summary: `Đề xuất xóa task "${task.title}"`,
          actionProposal: proposal
        }
      }

      // 3. KHI ĐÃ XÁC NHẬN (confirm === true) ➡️ TIẾN HÀNH DỌN DẸP VÀ XÓA DỮ LIỆU
      const subtaskIds = deleteSubtasks ? task.subTasks.map((st) => st.id) : []

      const allAffectedIds = [task.id, ...subtaskIds]

      await this.prisma.$transaction(async (tx) => {
        // 3.1. Dọn dẹp ràng buộc TaskDependency (cả hai chiều)
        await tx.taskDependency.deleteMany({
          where: {
            OR: [
              { predecessorId: { in: allAffectedIds } },
              { successorId: { in: allAffectedIds } }
            ]
          }
        })

        // 3.2. Dọn dẹp thứ tự thẻ BoardColumnTaskOrder
        await tx.boardColumnTaskOrder.deleteMany({
          where: { taskId: { in: allAffectedIds } }
        })

        // 3.3. Dọn dẹp phân công TaskAssignee
        await tx.taskAssignee.deleteMany({
          where: { taskId: { in: allAffectedIds } }
        })

        // 3.4. Xóa vĩnh viễn hoặc Xóa mềm
        if (isHardDelete) {
          // Xóa các bảng phụ thuộc nếu có
          await tx.taskComment.deleteMany({
            where: { taskId: { in: allAffectedIds } }
          })
          await tx.taskAttachment.deleteMany({
            where: { taskId: { in: allAffectedIds } }
          })
          await tx.taskDocumentEmbedding.deleteMany({
            where: { taskId: { in: allAffectedIds } }
          })

          if (subtaskIds.length > 0) {
            await tx.task.deleteMany({
              where: { id: { in: subtaskIds } }
            })
          }

          await tx.task.delete({
            where: { id: task.id }
          })
        } else {
          // Soft Delete
          const now = new Date()
          if (subtaskIds.length > 0) {
            await tx.task.updateMany({
              where: { id: { in: subtaskIds } },
              data: {
                deletedAt: now
              }
            })
          }

          await tx.task.update({
            where: { id: task.id },
            data: {
              deletedAt: now
            }
          })
        }
      })

      // 4. Định dạng kết quả xóa thành công
      let outputMd = `### 🗑️ Đã Xóa Công Việc Thành Công!\n\n`
      outputMd += `Công việc **"${task.title}"** (ID: \`${task.id}\`) đã được gỡ bỏ an toàn khỏi hệ thống.\n\n`
      outputMd += `| Thông tin chi tiết | Kết quả xử lý |\n`
      outputMd += `| :--- | :--- |\n`
      outputMd += `| **Tiêu đề công việc** | **${task.title}** |\n`
      outputMd += `| **Hình thức xóa** | ${isHardDelete ? 'Xóa vĩnh viễn (Hard Delete)' : 'Xóa mềm (Soft Delete)'} |\n`
      outputMd += `| **Subtasks đã dọn dẹp** | ${subtaskIds.length} subtasks |\n`
      outputMd += `| **Ràng buộc CPM đã gỡ** | ${task.predecessors.length + task.successors.length} liên kết phụ thuộc |\n`
      outputMd += `| **Vị trí bảng Kanban** | Đã xóa khỏi bảng thứ tự cột |\n\n`

      if (task.successors.length > 0) {
        outputMd += `> 💡 **Khuyến nghị:** Do task này từng là tiền nhiệm của ${task.successors.length} task khác, hãy chạy công cụ \`getCpmReport\` hoặc \`checkScheduleRisk\` để kiểm tra lại lịch trình đường găng mới của dự án.`
      }

      return {
        output: outputMd,
        status: 'SUCCESS',
        summary: `Đã xóa task "${task.title}" (${isHardDelete ? 'Hard Delete' : 'Soft Delete'})`
      }
    } catch (err: any) {
      this.logger.error(`DeleteTaskTool error: ${err?.message}`, err?.stack)
      return {
        output: `❌ **Lỗi khi xóa công việc:** ${err?.message || err}`,
        status: 'ERROR',
        summary: `Lỗi xóa task ${taskId}`
      }
    }
  }
}
