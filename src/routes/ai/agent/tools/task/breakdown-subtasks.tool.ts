import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

export type SubtaskRole = 'BACKEND' | 'FRONTEND' | 'QA_TEST' | 'DEVOPS' | 'FULLSTACK'
export type TaskPriorityType = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface ProposedSubtask {
  title: string
  description: string
  technicalRole: SubtaskRole
  storyPoint: number
  duration: number
  priority: TaskPriorityType
}

@Injectable()
export class BreakdownSubtasksTool implements IAgentTool {
  private readonly logger = new Logger(BreakdownSubtasksTool.name)

  readonly name = 'breakdownSubtasks'
  readonly description =
    'Trợ lý Kỹ sư trưởng (Tech Lead): Bóc tách một User Story hoặc Task lớn thành danh sách 4-6 subtasks kỹ thuật chi tiết ' +
    '(Database Schema, Backend API & Controller, Frontend UI & State, Webhook/Integration callback, và QA Testing). ' +
    'Hỗ trợ chế độ xem trước (dryRun: true, mặc định) hoặc tạo trực tiếp các subtasks vào database liên kết với parent task (dryRun: false).'

  readonly category: ToolCategory = 'TASK'
  readonly riskLevel: ToolRiskLevel = 'WRITE'
  readonly level: ToolActionLevel = 'WRITE'

  readonly parameters = {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'ID của User Story hoặc Task cha cần bóc tách kỹ thuật (bắt buộc)'
      },
      dryRun: {
        type: 'boolean',
        description: 'Mặc định true: Chỉ sinh danh sách gợi ý subtasks để xem trước mà không ghi DB. Nếu false: Tạo thật các subtasks trong DB.'
      },
      focusAreas: {
        type: 'array',
        items: { type: 'string' },
        description: 'Các mảng kỹ thuật trọng tâm cần phân tách: DATABASE, BACKEND_API, FRONTEND_UI, INTEGRATION, TESTING'
      },
      customSubtasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Tiêu đề subtask' },
            description: { type: 'string', description: 'Mô tả chi tiết subtask' },
            technicalRole: {
              type: 'string',
              enum: ['BACKEND', 'FRONTEND', 'QA_TEST', 'DEVOPS', 'FULLSTACK'],
              description: 'Vai trò kỹ thuật chính'
            },
            storyPoint: { type: 'number', description: 'Độ phức tạp Fibonacci (1, 2, 3, 5)' },
            duration: { type: 'number', description: 'Thời gian thi công thực tế (số ngày cho CPM)' },
            priority: {
              type: 'string',
              enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
              description: 'Độ ưu tiên của subtask'
            }
          },
          required: ['title']
        },
        description: 'Danh sách subtasks cụ thể do người dùng hoặc AI chỉ định ghi đè'
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
      dryRun?: boolean
      focusAreas?: string[]
      customSubtasks?: Partial<ProposedSubtask>[]
    },
    context: AgentContext
  ): Promise<ToolExecutionResult> {
    const { taskId, dryRun = true, customSubtasks, focusAreas } = args

    if (!taskId) {
      return {
        output: 'Thiếu taskId của User Story / Task cha cần bóc tách.',
        status: 'ERROR',
        summary: 'Thiếu tham số taskId'
      }
    }

    try {
      // 1. Truy vấn parent task từ Prisma
      const parentTask = await this.prisma.task.findUnique({
        where: { id: taskId, deletedAt: null },
        include: {
          sprint: { select: { id: true, name: true, projectId: true, status: true } },
          boardColumn: { select: { id: true, title: true, isDone: true } },
          subTasks: {
            where: { deletedAt: null },
            select: { id: true, title: true, storyPoint: true, duration: true, priority: true }
          },
          labels: true,
          assignees: {
            include: {
              user: { select: { id: true, displayName: true, email: true } }
            }
          }
        }
      })

      if (!parentTask) {
        return {
          output: `Không tìm thấy task với ID "${taskId}" hoặc task đã bị xóa.`,
          status: 'ERROR',
          summary: 'Task không tồn tại'
        }
      }

      // 2. Sinh danh sách subtasks đề xuất
      let subtasks: ProposedSubtask[] = []

      if (customSubtasks && customSubtasks.length > 0) {
        subtasks = customSubtasks.map((st, index) => ({
          title: st.title || `Subtask #${index + 1}`,
          description: st.description || `Chi tiết kỹ thuật cho: ${st.title}`,
          technicalRole: st.technicalRole || 'BACKEND',
          storyPoint: st.storyPoint ? Math.max(1, Math.round(st.storyPoint)) : 1,
          duration: st.duration ? Math.max(1, Math.round(st.duration)) : 1,
          priority: st.priority || parentTask.priority || 'MEDIUM'
        }))
      } else {
        subtasks = this.generateTechnicalSubtasks(parentTask.title, parentTask.description || '', focusAreas)
      }

      const totalSubtaskSP = subtasks.reduce((sum, st) => sum + st.storyPoint, 0)
      const totalSubtaskDuration = subtasks.reduce((sum, st) => sum + st.duration, 0)

      // 3. Nếu là dryRun (Xem trước gợi ý)
      if (dryRun) {
        const previewMarkdown = this.formatBreakdownMarkdown(parentTask, subtasks, true)
        const resultPayload = {
          taskId: parentTask.id,
          taskTitle: parentTask.title,
          parentStoryPoint: parentTask.storyPoint,
          parentDuration: parentTask.duration,
          existingSubtasksCount: parentTask.subTasks.length,
          proposedSubtasksCount: subtasks.length,
          totalProposedSP: totalSubtaskSP,
          totalProposedDuration: totalSubtaskDuration,
          dryRun: true,
          subtasks
        }

        return {
          output: `${previewMarkdown}\n\n\`\`\`json\n${JSON.stringify(resultPayload, null, 2)}\n\`\`\``,
          status: 'SUCCESS',
          summary: `Đề xuất bóc tách "${parentTask.title}" thành ${subtasks.length} subtasks kỹ thuật (${totalSubtaskSP} SP, ${totalSubtaskDuration} ngày thi công) [Xem trước]`
        }
      }

      // 4. Nếu dryRun === false: Tiến hành ghi vào database
      // Xác định cột Kanban đích: dùng cột của parent task, nếu parent task ở Done thì lấy cột đầu tiên chưa Done
      let targetColumnId = parentTask.boardColumnId
      if (parentTask.boardColumn.isDone) {
        const firstAvailableCol = await this.prisma.boardColumn.findFirst({
          where: { sprintId: parentTask.sprintId, isDone: false, deletedAt: null },
          orderBy: { createdAt: 'asc' }
        })
        if (firstAvailableCol) {
          targetColumnId = firstAvailableCol.id
        }
      }

      // Lấy sortOrder lớn nhất hiện tại trong cột
      const lastTaskOrder = await this.prisma.boardColumnTaskOrder.findFirst({
        where: { boardColumnId: targetColumnId },
        orderBy: { sortOrder: 'desc' }
      })
      let currentSortOrder = lastTaskOrder?.sortOrder ?? 0

      const createdSubtasks = await this.prisma.$transaction(async (tx) => {
        const createdList: any[] = []

        for (const st of subtasks) {
          currentSortOrder += 1

          const newTask = await tx.task.create({
            data: {
              sprintId: parentTask.sprintId,
              boardColumnId: targetColumnId,
              parentId: parentTask.id,
              title: st.title.trim(),
              description: st.description?.trim() || null,
              storyPoint: st.storyPoint,
              duration: st.duration,
              priority: st.priority,
              type: 'TASK'
            }
          })

          await tx.boardColumnTaskOrder.create({
            data: {
              boardColumnId: targetColumnId,
              taskId: newTask.id,
              sortOrder: currentSortOrder
            }
          })

          if (st.technicalRole) {
            await tx.taskLabel.create({
              data: {
                taskId: newTask.id,
                label: st.technicalRole
              }
            })
          }

          createdList.push({
            id: newTask.id,
            title: newTask.title,
            role: st.technicalRole,
            storyPoint: newTask.storyPoint,
            duration: newTask.duration,
            priority: newTask.priority
          })
        }

        return createdList
      })

      const executedMarkdown = this.formatBreakdownMarkdown(parentTask, subtasks, false, createdSubtasks)

      return {
        output: `${executedMarkdown}\n\n\`\`\`json\n${JSON.stringify({ createdCount: createdSubtasks.length, createdSubtasks }, null, 2)}\n\`\`\``,
        status: 'SUCCESS',
        summary: `Đã tạo thành công ${createdSubtasks.length} subtasks kỹ thuật cho "${parentTask.title}" (${totalSubtaskSP} SP, ${totalSubtaskDuration} ngày thi công)`
      }
    } catch (err: any) {
      this.logger.error(`BreakdownSubtasksTool error: ${err?.message}`, err?.stack)
      return {
        output: `Lỗi khi bóc tách subtasks cho task ${taskId}: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Lỗi bóc tách subtasks'
      }
    }
  }

  /**
   * Thuật toán bóc tách User Story thành 4-6 subtasks kỹ thuật chuẩn Tech Lead
   */
  private generateTechnicalSubtasks(title: string, description: string, focusAreas?: string[]): ProposedSubtask[] {
    const text = `${title} ${description}`.toLowerCase()

    // 1. Nhận diện Domain nghiệp vụ
    const isAuth = /auth|login|đăng nhập|register|đăng ký|jwt|oauth|2fa|totp|token|password|mật khẩu/.test(text)
    const isPayment = /payment|thanh toán|checkout|vnpay|momo|stripe|invoice|hóa đơn|nạp tiền|rút tiền|order/.test(text)
    const isRealtime = /chat|tin nhắn|realtime|socket|websocket|thông báo|notification|alert|presence/.test(text)
    const isMedia = /upload|s3|image|ảnh|avatar|tải lên|file|attachment|media|video/.test(text)
    const isReport = /report|báo cáo|export|xuất excel|pdf|thống kê|chart|biểu đồ|cpm|gantt|burndown/.test(text)

    const subtasks: ProposedSubtask[] = []

    if (isAuth) {
      subtasks.push(
        {
          title: `[DB] Thiết kế Migration & Schema thực thể Người dùng & Phiên bảo mật`,
          description: `Cập nhật Prisma Schema: bảng User, Device, RefreshToken, 2FA secret và định nghĩa indexes bảo mật`,
          technicalRole: 'BACKEND',
          storyPoint: 2,
          duration: 1,
          priority: 'HIGH'
        },
        {
          title: `[BE] Triển khai Core Service & REST Controller cho luồng xác thực`,
          description: `Xây dựng Endpoint xác thực, Hash bcrypt mật khẩu, cấp phát Access/Refresh JWT Token & CustomZodValidationPipe`,
          technicalRole: 'BACKEND',
          storyPoint: 3,
          duration: 2,
          priority: 'HIGH'
        },
        {
          title: `[FE] Xây dựng UI Form Xác thực, Toast thông báo & Hook quản lý Auth`,
          description: `Xây dựng giao diện Form tương tác (Tailwind CSS, Radix UI), tích hợp hook useAuth, xử lý token cookie & refresh tự động`,
          technicalRole: 'FRONTEND',
          storyPoint: 3,
          duration: 2,
          priority: 'MEDIUM'
        },
        {
          title: `[BE/Sec] Tích hợp Middleware bảo vệ RBAC, Rate-limiting & Token Rotation`,
          description: `Cấu hình AccessTokenGuard, Dynamic Permission RBAC và cơ chế chống tấn công brute-force với Redis`,
          technicalRole: 'BACKEND',
          storyPoint: 2,
          duration: 1,
          priority: 'HIGH'
        },
        {
          title: `[QA] Viết Unit Tests & E2E Test kịch bản Happy Path & Security Edge Cases`,
          description: `Kiểm thử: Đăng nhập sai mật khẩu, Token hết hạn, Giả mạo JWT, Tấn công Replay & Xác thực 2FA`,
          technicalRole: 'QA_TEST',
          storyPoint: 2,
          duration: 1,
          priority: 'MEDIUM'
        }
      )
    } else if (isPayment) {
      subtasks.push(
        {
          title: `[DB] Khởi tạo Transaction & Payment Audit Schema`,
          description: `Tạo bảng PaymentTransaction, PaymentWebhookLog, định nghĩa Enum TransactionStatus (PENDING, SUCCESS, FAILED)`,
          technicalRole: 'BACKEND',
          storyPoint: 2,
          duration: 1,
          priority: 'HIGH'
        },
        {
          title: `[BE] Tích hợp SDK Cổng thanh toán & Endpoint tạo Payment URL`,
          description: `Ký mã checksum bảo mật HMAC-SHA512, sinh URL chuyển hướng tới cổng thanh toán đối tác`,
          technicalRole: 'BACKEND',
          storyPoint: 3,
          duration: 2,
          priority: 'CRITICAL'
        },
        {
          title: `[BE] Xây dựng IPN Webhook Receiver & Idempotency Lock`,
          description: `Xử lý callback bất đồng bộ từ cổng thanh toán, sử dụng Redis Distributed Lock chống xử lý trùng lặp giao dịch`,
          technicalRole: 'BACKEND',
          storyPoint: 3,
          duration: 2,
          priority: 'CRITICAL'
        },
        {
          title: `[FE] Xây dựng Giao diện Checkout, Bảng giá & Màn hình Kết quả thanh toán`,
          description: `Component chọn phương thức thanh toán, giao diện đếm ngược QR code, hiển thị trạng thái realtime khi IPN thành công`,
          technicalRole: 'FRONTEND',
          storyPoint: 3,
          duration: 2,
          priority: 'HIGH'
        },
        {
          title: `[QA] Kiểm thử toàn diện Idempotency, Network Timeout & Webhook Tampering`,
          description: `Giả lập Webhook giả mạo checksum, kiểm tra retry IPN, xử lý trường hợp user đóng trình duyệt trước khi redirect`,
          technicalRole: 'QA_TEST',
          storyPoint: 2,
          duration: 1,
          priority: 'HIGH'
        }
      )
    } else if (isRealtime) {
      subtasks.push(
        {
          title: `[DB] Thiết kế lược đồ lưu trữ Tin nhắn / Sự kiện Realtime`,
          description: `Tạo model lưu trữ nội dung tin nhắn, metadata đính kèm, senderId, room/projectId và indexes thời gian`,
          technicalRole: 'BACKEND',
          storyPoint: 1,
          duration: 1,
          priority: 'MEDIUM'
        },
        {
          title: `[BE] Cấu hình Socket.io Gateway, Xác thực kết nối & Room Channels`,
          description: `Triển khai WebSocket Gateway (@WebSocketGateway), bảo vệ kết nối bằng JWT Handshake, phân quyền vào room dự án`,
          technicalRole: 'BACKEND',
          storyPoint: 3,
          duration: 2,
          priority: 'HIGH'
        },
        {
          title: `[FE] Tích hợp Socket Client, Trình quản lý State Tin nhắn & Drawer UI`,
          description: `Xây dựng hook useSocket, đồng bộ danh sách tin nhắn, xử lý auto-scroll tin nhắn mới và badge thông báo chưa đọc`,
          technicalRole: 'FRONTEND',
          storyPoint: 3,
          duration: 2,
          priority: 'HIGH'
        },
        {
          title: `[BE/Worker] Xử lý Background Push Notification & Lưu vết tin nhắn`,
          description: `Hàng đợi BullMQ phân phối thông báo đẩy cho các thành viên đang offline, cập nhật trạng thái đọc`,
          technicalRole: 'BACKEND',
          storyPoint: 2,
          duration: 1,
          priority: 'MEDIUM'
        },
        {
          title: `[QA] Stress Test kết nối đồng thời & Kiểm tra mất mạng tự động Reconnect`,
          description: `Kiểm thử phục hồi khi rớt mạng Wi-Fi, kiểm tra không bị duplicate tin nhắn khi reconnect`,
          technicalRole: 'QA_TEST',
          storyPoint: 2,
          duration: 1,
          priority: 'MEDIUM'
        }
      )
    } else if (isMedia) {
      subtasks.push(
        {
          title: `[BE] Thiết lập S3 Bucket Client & Presigned PUT/GET URL Service`,
          description: `Tích hợp AWS S3 SDK, tạo API sinh Presigned URL tải lên trực tiếp và Presigned GET URL thời hạn 7 ngày`,
          technicalRole: 'BACKEND',
          storyPoint: 2,
          duration: 1,
          priority: 'HIGH'
        },
        {
          title: `[FE] Component Upload Tệp Trực Tiếp Lên S3 & Progress Bar`,
          description: `Xây dựng Hook useUpload, Drag & Drop zone, kiểm tra MIME type, dung lượng file và thanh tiến trình phần trăm tải lên`,
          technicalRole: 'FRONTEND',
          storyPoint: 2,
          duration: 1,
          priority: 'HIGH'
        },
        {
          title: `[BE] API Lưu Metadata File Đính Kèm & Quét Mã Độc / Validation`,
          description: `Lưu thông tin fileKey, fileName, fileSize vào bảng TaskAttachment, kiểm tra đuôi file nguy hiểm`,
          technicalRole: 'BACKEND',
          storyPoint: 2,
          duration: 1,
          priority: 'MEDIUM'
        },
        {
          title: `[QA] Kiểm thử Tải Lên Tệp Dung Lượng Lớn & Kiểm Soát Bảo Mật Presigned URL`,
          description: `Xác minh Presigned URL hết hạn sau 300s, không thể ghi đè file của user khác, thử nghiệm tải lên tệp 25MB`,
          technicalRole: 'QA_TEST',
          storyPoint: 1,
          duration: 1,
          priority: 'LOW'
        }
      )
    } else if (isReport) {
      subtasks.push(
        {
          title: `[BE] Xây dựng Thuật toán Tổng hợp Dữ liệu & Tính Toán Chỉ Số Báo Cáo`,
          description: `Truy vấn dữ liệu thời gian thực từ Prisma, tính toán các chỉ số thống kê, trung bình và công thức chuyên ngành`,
          technicalRole: 'BACKEND',
          storyPoint: 3,
          duration: 2,
          priority: 'HIGH'
        },
        {
          title: `[FE] Xây dựng Dashboard Biểu đồ Trực quan hóa (Recharts / SVG)`,
          description: `Thiết kế các biểu đồ hiển thị xu hướng, thanh tiến độ, phân bổ tỷ lệ và tooltip tương tác cao`,
          technicalRole: 'FRONTEND',
          storyPoint: 3,
          duration: 2,
          priority: 'HIGH'
        },
        {
          title: `[FE/BE] Tính năng Xuất Báo Cáo Ra Excel / PDF Bảng Tính`,
          description: `Tích hợp thư viện xuất bảng tính định dạng đẹp mắt, đầy đủ tiêu đề cột và định dạng số`,
          technicalRole: 'FULLSTACK',
          storyPoint: 2,
          duration: 1,
          priority: 'MEDIUM'
        },
        {
          title: `[QA] Kiểm thử Độ Chính Xác Số Liệu Báo Cáo & Hiệu Năng Truy Vấn Lớn`,
          description: `Xác minh số liệu khớp 100% với dữ liệu nguồn, kiểm tra thời gian phản hồi API khi dữ liệu lên tới hàng ngàn bản ghi`,
          technicalRole: 'QA_TEST',
          storyPoint: 1,
          duration: 1,
          priority: 'MEDIUM'
        }
      )
    } else {
      // Default: Clean Standard Feature Architecture
      subtasks.push(
        {
          title: `[DB] Thiết kế Lược đồ Dữ liệu & Prisma Migration cho tính năng "${title}"`,
          description: `Khởi tạo hoặc cập nhật model trong Prisma Schema, thiết lập các quan hệ khóa ngoại và indexes cần thiết`,
          technicalRole: 'BACKEND',
          storyPoint: 2,
          duration: 1,
          priority: 'HIGH'
        },
        {
          title: `[BE] Xây dựng REST API Endpoints, Service Nghiệp vụ & DTO Validation`,
          description: `Cung cấp đầy đủ Controller, Service, Zod schema validation pipe và phân quyền bảo vệ route`,
          technicalRole: 'BACKEND',
          storyPoint: 3,
          duration: 2,
          priority: 'HIGH'
        },
        {
          title: `[FE] Xây dựng Giao diện Người dùng & Tích hợp API State (React Query / Zustand)`,
          description: `Triển khai components giao diện theo thiết kế hệ thống, tối ưu responsive, dark/light mode và loading skeleton`,
          technicalRole: 'FRONTEND',
          storyPoint: 3,
          duration: 2,
          priority: 'HIGH'
        },
        {
          title: `[BE/FE] Xử lý Tình huống Ngoại lệ, Ràng buộc Biên & Thông báo Người dùng`,
          description: `Xử lý lỗi mạng, thông báo Toast trực quan, tối ưu hóa trải nghiệm tương tác Optimistic UI`,
          technicalRole: 'FULLSTACK',
          storyPoint: 2,
          duration: 1,
          priority: 'MEDIUM'
        },
        {
          title: `[QA] Viết Kịch bản Kiểm thử Tự động (Unit & Integration Tests)`,
          description: `Kiểm thử các kịch bản thành công (Happy path), dữ liệu không hợp lệ và kiểm tra hồi quy toàn hệ thống`,
          technicalRole: 'QA_TEST',
          storyPoint: 1,
          duration: 1,
          priority: 'MEDIUM'
        }
      )
    }

    return subtasks
  }

  /**
   * Định dạng kết quả Markdown chuẩn mực hiển thị cho người dùng và AI
   */
  private formatBreakdownMarkdown(
    parentTask: any,
    subtasks: ProposedSubtask[],
    isDryRun: boolean,
    createdSubtasks?: any[]
  ): string {
    const totalSP = subtasks.reduce((sum, st) => sum + st.storyPoint, 0)
    const totalDuration = subtasks.reduce((sum, st) => sum + st.duration, 0)

    let md = `### 🛠️ Phân Tách Subtask Kỹ Thuật (Tech Lead Breakdown)\n\n`
    md += `* **Task cha:** **${parentTask.title}** (ID: \`${parentTask.id}\`)\n`
    md += `* **Trạng thái Sprint:** ${parentTask.sprint?.name || 'Chưa gán'} (${parentTask.sprint?.status || 'N/A'})\n`
    md += `* **Độ phức tạp ban đầu:** ${parentTask.storyPoint || 0} SP · ${parentTask.duration || 0} ngày làm việc (duration)\n`
    md += `* **Tổng Subtasks đề xuất:** ${subtasks.length} công việc · **${totalSP} Story Points** · **${totalDuration} ngày thi công**\n`
    md += `* **Chế độ thực thi:** ${isDryRun ? '🔍 **Xem trước (dryRun = true)**' : '✅ **Đã ghi vào Database (dryRun = false)**'}\n\n`

    md += `| # | Subtask | Role | SP | Duration | Priority | ${isDryRun ? 'Mô tả tóm tắt' : 'ID Task tạo mới'} |\n`
    md += `| :---: | :--- | :---: | :---: | :---: | :---: | :--- |\n`

    subtasks.forEach((st, idx) => {
      const createdId = createdSubtasks && createdSubtasks[idx] ? `\`${createdSubtasks[idx].id}\`` : st.description
      md += `| ${idx + 1} | **${st.title}** | \`${st.technicalRole}\` | ${st.storyPoint} SP | ${st.duration}d | ${st.priority} | ${createdId} |\n`
    })

    if (isDryRun) {
      md += `\n> 💡 **Gợi ý:** Để tạo danh sách subtasks này trực tiếp vào hệ thống dưới dạng con của Task cha, hãy gọi lại tool \`breakdownSubtasks\` với tham số \`{ taskId: "${parentTask.id}", dryRun: false }\`.`
    }

    return md
  }
}
