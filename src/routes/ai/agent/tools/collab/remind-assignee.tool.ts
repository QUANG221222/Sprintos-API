import { Injectable, Logger, Optional } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { NotificationGateway } from '~/routes/notification/notification.gateway'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

export type ReminderUrgency = 'NORMAL' | 'HIGH' | 'URGENT'

export interface RemindedMemberResult {
  userId: string
  displayName: string
  notificationId: string
  socketDelivered: boolean
}

@Injectable()
export class RemindAssigneeTool implements IAgentTool {
  private readonly logger = new Logger(RemindAssigneeTool.name)

  readonly name = 'remindAssignee'
  readonly description =
    'Gửi thông báo nhắc nhở cá nhân trực tiếp (Direct In-App & Socket Notification) cho các thành viên đang phụ trách công việc. ' +
    'Áp dụng khi task sắp đến hạn chót (dueDate < 24h), task quá hạn, hoặc task đang là tiền nhiệm (predecessor) chặn các công việc kế tiếp trên đường găng CPM. ' +
    'Tự động lưu vào bảng Notification và phát realtime qua NotificationGateway (notification:received).'

  readonly category: ToolCategory = 'COLLAB'
  readonly riskLevel: ToolRiskLevel = 'WRITE'
  readonly level: ToolActionLevel = 'WRITE'

  readonly parameters = {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'ID của công việc cần gửi thông báo nhắc nhở (bắt buộc)'
      },
      customMessage: {
        type: 'string',
        description: 'Lời nhắn cụ thể từ Tech Lead, PM hoặc AI gửi đến thành viên (tùy chọn)'
      },
      urgency: {
        type: 'string',
        enum: ['NORMAL', 'HIGH', 'URGENT'],
        description: 'Mức độ khẩn cấp của lời nhắc (mặc định: HIGH)'
      },
      dryRun: {
        type: 'boolean',
        description: 'Nếu true, chỉ xem trước thông báo gửi đi mà không tạo Notification trong DB hoặc gửi Socket. Mặc định: false'
      }
    },
    required: ['taskId']
  }

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificationGateway?: NotificationGateway
  ) {}

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
      customMessage?: string
      urgency?: ReminderUrgency
    },
    context: AgentContext
  ): Promise<ToolExecutionResult> {
    const { taskId, customMessage, urgency = 'HIGH' } = args

    if (!taskId) {
      return {
        output: 'Thiếu taskId của công việc cần gửi nhắc nhở.',
        status: 'ERROR',
        summary: 'Thiếu tham số taskId'
      }
    }

    try {
      // 1. Truy vấn thông tin Task, Assignees, Sprint và Dependencies
      const task = await this.prisma.task.findUnique({
        where: { id: taskId, deletedAt: null },
        include: {
          sprint: { select: { id: true, name: true, projectId: true } },
          boardColumn: { select: { id: true, title: true, isDone: true } },
          assignees: {
            include: {
              user: { select: { id: true, displayName: true, email: true } }
            }
          },
          successors: {
            select: { id: true, successorId: true }
          }
        }
      })

      if (!task) {
        return {
          output: `Không tìm thấy công việc với ID "${taskId}" hoặc task đã bị xóa.`,
          status: 'ERROR',
          summary: 'Task không tồn tại'
        }
      }

      if (task.assignees.length === 0) {
        return {
          output: `Công việc "${task.title}" hiện chưa có thành viên nào phụ trách để nhận thông báo. Vui lòng gán người phụ trách (assignTask) trước.`,
          status: 'ERROR',
          summary: 'Task chưa có người phụ trách'
        }
      }

      if (task.boardColumn.isDone) {
        return {
          output: `Công việc "${task.title}" đã hoàn thành (cột ${task.boardColumn.title}), không cần gửi thông báo nhắc việc.`,
          status: 'SUCCESS',
          summary: 'Task đã hoàn thành'
        }
      }

      // 2. Phân tích ngữ cảnh tiến độ của Task
      const now = new Date()
      const nowMs = now.getTime()
      const hasDueDate = Boolean(task.dueDate)
      const dueDateMs = task.dueDate ? new Date(task.dueDate).getTime() : 0
      const isOverdue = hasDueDate && dueDateMs < nowMs
      const isDueWithin24h = hasDueDate && !isOverdue && dueDateMs - nowMs <= 24 * 60 * 60 * 1000
      const hasBlockers = task.successors.length > 0

      const urgencyPrefix =
        urgency === 'URGENT' || isOverdue
          ? '🚨 [KHẨN CẤP]'
          : urgency === 'HIGH' || isDueWithin24h
            ? '⚠️ [CHÚ Ý]'
            : 'ℹ️ [NHẮC VIỆC]'

      const notificationTitle = `${urgencyPrefix} Tiến độ: ${task.title}`

      let autoReason = ''
      if (isOverdue) {
        autoReason = `Công việc đã quá hạn chót vào ngày ${new Date(task.dueDate!).toLocaleDateString('vi-VN')}. Vui lòng cập nhật tiến độ hoặc thông báo nếu gặp khó khăn.`
      } else if (isDueWithin24h) {
        autoReason = `Công việc sẽ đến hạn hoàn thành trong vòng 24 giờ tới (${new Date(task.dueDate!).toLocaleDateString('vi-VN')}).`
      } else if (hasBlockers) {
        autoReason = `Công việc này đang là tiền nhiệm chặn ${task.successors.length} công việc phụ thuộc kế tiếp trên đường găng CPM. Đội ngũ đang chờ bạn hoàn thành để tiếp tục.`
      } else {
        autoReason = `Nhắc nhở cập nhật trạng thái thực hiện cho công việc tại cột [${task.boardColumn.title}].`
      }

      const fullMessage = customMessage ? `${customMessage}\n\n(${autoReason})` : autoReason

      if ((args as any).dryRun || context.dryRun) {
        const previewMembers = task.assignees.map((a) => a.user.displayName).join(', ')
        return {
          output: `### 🔍 [Xem Trước Mô Phỏng - Chưa Gửi] Nhắc Nhở Công Việc\n\n* **Tiêu đề:** ${notificationTitle}\n* **Người nhận dự kiến:** ${previewMembers}\n* **Nội dung:** ${fullMessage}\n\n*⚠️ Thao tác đang chạy ở chế độ xem trước (Dry-Run). Thông báo chưa được gửi vào DB hay Socket.*`,
          status: 'SUCCESS',
          summary: `[Mô phỏng] Dự kiến gửi nhắc việc tới: ${previewMembers}`,
          diff: {
            mode: 'DRY_RUN_PREVIEW',
            taskId: task.id,
            notificationTitle,
            recipients: task.assignees.map((a) => ({ userId: a.userId, displayName: a.user.displayName })),
            fullMessage
          }
        }
      }

      // 3. Tạo bản ghi Notification và phát Socket cho từng Assignee
      const remindedList: RemindedMemberResult[] = []

      for (const a of task.assignees) {
        const createdNotification = await this.prisma.notification.create({
          data: {
            userId: a.userId,
            projectId: task.sprint.projectId,
            taskId: task.id,
            type: 'task_updated',
            title: notificationTitle,
            message: fullMessage,
            isRead: false
          }
        })

        let socketDelivered = false
        if (this.notificationGateway) {
          try {
            this.notificationGateway.sendToUser(a.userId, createdNotification)
            socketDelivered = true
          } catch (sockErr) {
            this.logger.warn(`Không thể phát socket tới user ${a.userId}:`, sockErr)
          }
        }

        remindedList.push({
          userId: a.userId,
          displayName: a.user.displayName,
          notificationId: createdNotification.id,
          socketDelivered
        })
      }

      // 4. Định dạng Markdown báo cáo trực quan
      let md = `### 🔔 Đã Gửi Thông Báo Nhắc Nhở Cá Nhân\n\n`
      md += `* **Công việc:** **${task.title}** (ID: \`${task.id}\`)\n`
      md += `* **Cột hiện tại:** \`${task.boardColumn.title}\` · **Sprint:** ${task.sprint.name}\n`
      md += `* **Mức độ khẩn cấp:** \`${urgency}\`\n`
      md += `* **Tiêu đề thông báo:** **${notificationTitle}**\n`
      md += `* **Nội dung nhắn gửi:**\n`
      md += `  > ${fullMessage.replace(/\n/g, '\n  > ')}\n\n`

      md += `#### 👥 Danh Sách Thành Viên Đã Nhận Thông Báo:\n`
      md += `| # | Thành viên | User ID | Socket Realtime | Trạng thái In-App |\n`
      md += `| :---: | :--- | :---: | :---: | :--- |\n`

      remindedList.forEach((r, idx) => {
        const socketStatus = r.socketDelivered ? '🟢 Đã phát sóng' : '⚪ Đã lưu hộp thư'
        md += `| ${idx + 1} | **${r.displayName}** | \`${r.userId}\` | ${socketStatus} | 📥 Đã lưu Notification |\n`
      })

      const payload = {
        taskId: task.id,
        taskTitle: task.title,
        urgency,
        notificationTitle,
        message: fullMessage,
        remindedMembersCount: remindedList.length,
        remindedMembers: remindedList
      }

      return {
        output: `${md}\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        status: 'SUCCESS',
        summary: `Đã gửi nhắc nhở cho ${remindedList.length} thành viên phụ trách task "${task.title}" (${remindedList.map((r) => r.displayName).join(', ')})`
      }
    } catch (err: any) {
      this.logger.error(`RemindAssigneeTool error: ${err?.message}`, err?.stack)
      return {
        output: `Lỗi khi gửi thông báo nhắc việc: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Lỗi gửi thông báo nhắc nhở'
      }
    }
  }
}
