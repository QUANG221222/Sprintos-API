import { Injectable, Logger, Optional } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { ChatGateway } from '~/routes/chat/chat.gateway'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

export type AlertType = 'CRITICAL_CPM_DELAY' | 'SPRINT_RISK' | 'STANDUP_SUMMARY' | 'GENERAL_ALERT'

@Injectable()
export class BroadcastAlertTool implements IAgentTool {
  private readonly logger = new Logger(BroadcastAlertTool.name)

  readonly name = 'broadcastProjectAlert'
  readonly description =
    'Phát tin nhắn thông báo / cảnh báo thời gian thực từ AI Agent vào kênh chat nội bộ của dự án (Project Chat). ' +
    'Tự động lưu tin nhắn vào cơ sở dữ liệu (ProjectChatMessage) với định danh "Sprintos AI Assistant" ' +
    'và phát sóng WebSocket (chat:new_message) tức thì tới tất cả các thành viên đang online trong phòng chat dự án.'

  readonly category: ToolCategory = 'COLLAB'
  readonly riskLevel: ToolRiskLevel = 'WRITE'
  readonly level: ToolActionLevel = 'WRITE'

  readonly parameters = {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'ID của dự án cần gửi thông báo (nếu bỏ trống, dùng targetProjectId trong ngữ cảnh)'
      },
      alertType: {
        type: 'string',
        enum: ['CRITICAL_CPM_DELAY', 'SPRINT_RISK', 'STANDUP_SUMMARY', 'GENERAL_ALERT'],
        description:
          'Phân loại thông báo: CRITICAL_CPM_DELAY (Trễ hạn đường găng nghiêm trọng), SPRINT_RISK (Nguy cơ vỡ tiến độ Sprint), STANDUP_SUMMARY (Báo cáo Standup tóm tắt), GENERAL_ALERT (Thông báo chung)'
      },
      title: {
        type: 'string',
        description: 'Tiêu đề ngắn gọn của thông báo (bắt buộc)'
      },
      content: {
        type: 'string',
        description: 'Nội dung chi tiết của thông báo hoặc phân tích rủi ro kèm khuyến nghị hành động (bắt buộc)'
      },
      relatedTaskId: {
        type: 'string',
        description: 'ID của công việc có liên quan trực tiếp (tùy chọn)'
      },
      dryRun: {
        type: 'boolean',
        description: 'Nếu true, chỉ xem trước nội dung phát sóng mà không lưu vào DB hoặc gửi WebSocket. Mặc định: false'
      }
    },
    required: ['alertType', 'title', 'content']
  }

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly chatGateway?: ChatGateway
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
      projectId?: string
      alertType: AlertType
      title: string
      content: string
      relatedTaskId?: string
    },
    context: AgentContext
  ): Promise<ToolExecutionResult> {
    const { alertType, title, content, relatedTaskId } = args
    const targetProjectId = args.projectId || context.targetProjectId

    if (!targetProjectId) {
      return {
        output: 'Không tìm thấy ID dự án (projectId) để phát thông báo kênh chat.',
        status: 'ERROR',
        summary: 'Thiếu projectId'
      }
    }

    if (!title || !content) {
      return {
        output: 'Vui lòng cung cấp đầy đủ cả "title" và "content" cho thông báo.',
        status: 'ERROR',
        summary: 'Thiếu nội dung thông báo'
      }
    }

    try {
      // 1. Kiểm tra Dự án và lấy thông tin Project Owner
      const project = await this.prisma.project.findUnique({
        where: { id: targetProjectId, deletedAt: null },
        select: { id: true, name: true, ownerId: true }
      })

      if (!project) {
        return {
          output: `Không tìm thấy dự án với ID "${targetProjectId}".`,
          status: 'ERROR',
          summary: 'Dự án không tồn tại'
        }
      }

      // 2. Tìm hoặc khởi tạo ProjectChat cho dự án
      let projectChat = await this.prisma.projectChat.findFirst({
        where: { projectId: targetProjectId, deletedAt: null }
      })

      if (!projectChat) {
        projectChat = await this.prisma.projectChat.create({
          data: { projectId: targetProjectId }
        })
      }

      // 3. Chuẩn hóa nội dung tin nhắn Markdown
      const alertBadges: Record<AlertType, string> = {
        CRITICAL_CPM_DELAY: '🚨 [NGUY HIỂM ĐƯỜNG GĂNG CPM]',
        SPRINT_RISK: '🔥 [CẢNH BÁO TIẾN ĐỘ SPRINT]',
        STANDUP_SUMMARY: '📋 [TỔNG KẾT STANDUP AI]',
        GENERAL_ALERT: '📢 [THÔNG BÁO DỰ ÁN]'
      }

      const badge = alertBadges[alertType] || '📢 [THÔNG BÁO]'
      let fullMessage = `### 🤖 ${badge} ${title}\n\n${content}`

      if (relatedTaskId) {
        fullMessage += `\n\n📌 *Công việc liên quan: ID \`${relatedTaskId}\`*`
      }

      if ((args as any).dryRun || context.dryRun) {
        return {
          output: `### 🔍 [Xem Trước Mô Phỏng - Chưa Gửi] ${badge} ${title}\n\n${content}\n\n*⚠️ Tin nhắn chưa được lưu vào Chat hoặc broadcast qua WebSocket (chế độ Dry-Run).*`,
          status: 'SUCCESS',
          summary: `[Mô phỏng] Dự kiến phát cảnh báo [${badge}] tới kênh Chat`,
          diff: { mode: 'DRY_RUN_PREVIEW', alertType, title, content, targetProjectId }
        }
      }

      // 4. Lưu tin nhắn vào ProjectChatMessage với định danh AI
      const savedMessage = await this.prisma.projectChatMessage.create({
        data: {
          projectChatId: projectChat.id,
          senderId: project.ownerId, // Khóa ngoại bắt buộc đến bảng User
          senderName: 'Sprintos AI Copilot',
          senderRole: 'AI_ASSISTANT',
          senderAvatarUrl: '/ai-avatar.png',
          message: fullMessage
        }
      })

      // 5. Phát sóng sự kiện WebSocket qua ChatGateway
      let socketEmitted = false
      if (this.chatGateway && this.chatGateway.server) {
        const room = `project:${targetProjectId}`
        this.chatGateway.server.to(room).emit('chat:new_message', savedMessage)
        socketEmitted = true
        this.logger.log(`📢 Đã broadcast tin nhắn AI tới phòng chat "${room}"`)
      }

      // 6. Định dạng kết quả Markdown
      let md = `### 📡 Đã Phát Thông Báo Vào Kênh Chat Dự Án\n\n`
      md += `* **Dự án:** **${project.name}**\n`
      md += `* **Loại cảnh báo:** \`${alertType}\`\n`
      md += `* **Tiêu đề:** **${title}**\n`
      md += `* **Trạng thái Socket Realtime:** ${socketEmitted ? '🟢 **Đã phát sóng tới toàn bộ team**' : '🟡 **Đã lưu tin nhắn (Socket offline)**'}\n`
      md += `* **ID Tin nhắn:** \`${savedMessage.id}\`\n\n`
      md += `#### 💬 Bản Xem Trước Tin Nhắn Trong Kênh Chat:\n`
      md += `> ${fullMessage.replace(/\n/g, '\n> ')}\n`

      const payload = {
        messageId: savedMessage.id,
        projectId: targetProjectId,
        projectName: project.name,
        alertType,
        title,
        socketEmitted,
        createdAt: savedMessage.createdAt
      }

      return {
        output: `${md}\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        status: 'SUCCESS',
        summary: `Đã phát cảnh báo [${alertType}] vào kênh chat dự án "${project.name}"`
      }
    } catch (err: any) {
      this.logger.error(`BroadcastAlertTool error: ${err?.message}`, err?.stack)
      return {
        output: `Lỗi khi phát thông báo vào kênh chat: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Lỗi phát thông báo kênh chat'
      }
    }
  }
}
