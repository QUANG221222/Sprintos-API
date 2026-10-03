import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

export interface GherkinScenario {
  scenarioTitle: string
  scenarioType: 'HAPPY_PATH' | 'VALIDATION_ERROR' | 'EDGE_CASE' | 'NON_FUNCTIONAL'
  given: string[]
  when: string[]
  then: string[]
}

@Injectable()
export class AcceptanceCriteriaTool implements IAgentTool {
  private readonly logger = new Logger(AcceptanceCriteriaTool.name)

  readonly name = 'suggestAcceptanceCriteria'
  readonly description =
    'Tự động phân tích yêu cầu công việc / User Story và sinh bộ Tiêu Chí Nghiệm Thu chuẩn quốc tế Gherkin syntax ' +
    '("Given - When - Then") bao gồm 4 kịch bản: Happy Path (thành công), Validation & Error Handling (dữ liệu sai), ' +
    'Edge Cases & Ràng buộc phân quyền RBAC, và Non-Functional Requirements (Hiệu năng < 500ms, Bảo mật). ' +
    'Hỗ trợ tùy chọn tự động cập nhật trực tiếp vào trường description của task trong cơ sở dữ liệu (updateTaskDescription: true).'

  readonly category: ToolCategory = 'TASK'
  readonly riskLevel: ToolRiskLevel = 'SUGGEST'
  readonly level: ToolActionLevel = 'SUGGEST'

  readonly parameters = {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'ID của task cần sinh bộ tiêu chuẩn nghiệm thu (tùy chọn nếu đã cung cấp title)'
      },
      title: {
        type: 'string',
        description: 'Tiêu đề công việc (tùy chọn nếu đã cung cấp taskId)'
      },
      description: {
        type: 'string',
        description: 'Mô tả chi tiết hoặc bối cảnh bổ sung của công việc'
      },
      updateTaskDescription: {
        type: 'boolean',
        description:
          'Mặc định false: Nếu true và có taskId, hệ thống tự động lưu nối bộ Acceptance Criteria này vào trường description của task trong database.'
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

  async execute(
    args: {
      taskId?: string
      title?: string
      description?: string
      updateTaskDescription?: boolean
    },
    context: AgentContext
  ): Promise<ToolExecutionResult> {
    const { taskId, updateTaskDescription = false } = args
    let taskTitle = args.title?.trim() || ''
    let taskDescription = args.description?.trim() || ''
    let existingTask: any = null

    try {
      // 1. Nếu có taskId, truy vấn thông tin chi tiết từ Prisma
      if (taskId) {
        existingTask = await this.prisma.task.findUnique({
          where: { id: taskId, deletedAt: null },
          include: {
            sprint: { select: { id: true, name: true, projectId: true } },
            labels: true
          }
        })

        if (!existingTask) {
          return {
            output: `Không tìm thấy task với ID "${taskId}" trong cơ sở dữ liệu.`,
            status: 'ERROR',
            summary: 'Task không tồn tại'
          }
        }

        taskTitle = existingTask.title
        taskDescription = existingTask.description || taskDescription
      }

      if (!taskTitle) {
        return {
          output: 'Vui lòng cung cấp ít nhất một trong hai tham số: "taskId" hoặc "title" của công việc.',
          status: 'ERROR',
          summary: 'Thiếu thông tin công việc'
        }
      }

      // 2. Sinh bộ kịch bản Gherkin chuẩn mực theo ngữ cảnh nghiệp vụ
      const scenarios = this.generateGherkinScenarios(taskTitle, taskDescription)

      // 3. Định dạng Markdown hoàn chỉnh
      const markdownOutput = this.formatGherkinMarkdown(taskTitle, scenarios, existingTask)

      // 4. Nếu có yêu cầu updateTaskDescription và có taskId
      let dbUpdated = false
      if (updateTaskDescription && existingTask) {
        const currentDesc = existingTask.description ? `${existingTask.description}\n\n` : ''
        const updatedDescription = `${currentDesc}${markdownOutput}`

        await this.prisma.task.update({
          where: { id: existingTask.id },
          data: {
            description: updatedDescription
          }
        })
        dbUpdated = true
        this.logger.log(`✅ Đã cập nhật Acceptance Criteria vào task description cho task ID: ${existingTask.id}`)
      }

      const resultPayload = {
        taskId: existingTask?.id || null,
        title: taskTitle,
        scenariosCount: scenarios.length,
        dbUpdated,
        scenarios
      }

      return {
        output: `${markdownOutput}\n\n\`\`\`json\n${JSON.stringify(resultPayload, null, 2)}\n\`\`\``,
        status: 'SUCCESS',
        summary: `Đã sinh ${scenarios.length} kịch bản Acceptance Criteria chuẩn Gherkin cho "${taskTitle}"${dbUpdated ? ' (Đã lưu vào DB)' : ''}`
      }
    } catch (err: any) {
      this.logger.error(`AcceptanceCriteriaTool error: ${err?.message}`, err?.stack)
      return {
        output: `Lỗi khi sinh Acceptance Criteria: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Lỗi sinh Acceptance Criteria'
      }
    }
  }

  /**
   * Bộ sinh kịch bản Gherkin theo ngữ cảnh kỹ thuật & domain nghiệp vụ
   */
  private generateGherkinScenarios(title: string, description: string): GherkinScenario[] {
    const text = `${title} ${description}`.toLowerCase()

    const isAuth = /auth|login|đăng nhập|register|đăng ký|jwt|oauth|2fa|totp|token|password|mật khẩu/.test(text)
    const isPayment = /payment|thanh toán|checkout|vnpay|momo|stripe|invoice|hóa đơn|nạp tiền|rút tiền|order/.test(text)
    const isRealtime = /chat|tin nhắn|realtime|socket|websocket|thông báo|notification|alert|presence/.test(text)
    const isUpload = /upload|s3|image|ảnh|avatar|tải lên|file|attachment|media|video/.test(text)
    const isFilterSearch = /search|tìm kiếm|filter|lọc|pagination|phân trang|sort|sắp xếp/.test(text)

    if (isAuth) {
      return [
        {
          scenarioTitle: `Đăng nhập thành công với thông tin xác thực hợp lệ`,
          scenarioType: 'HAPPY_PATH',
          given: [
            `Người dùng đã có tài khoản đã kích hoạt với email "user@example.com" và mật khẩu chính xác`,
            `Hệ thống đang hoạt động và cơ sở dữ liệu sẵn sàng tiếp nhận kết nối`
          ],
          when: [
            `Người dùng điền email và mật khẩu hợp lệ vào biểu mẫu đăng nhập`,
            `Nhấn nút "Đăng nhập" để gửi yêu cầu`
          ],
          then: [
            `Hệ thống phản hồi mã trạng thái HTTP 200 OK kèm thông tin hồ sơ người dùng`,
            `Cấp phát cặp JWT token an toàn: Access Token trong header/payload và Refresh Token trong HTTP-only Cookie`,
            `Điều hướng người dùng đến màn hình Dashboard chính trong vòng dưới 1 giây`
          ]
        },
        {
          scenarioTitle: `Từ chối đăng nhập khi sai mật khẩu hoặc tài khoản chưa kích hoạt`,
          scenarioType: 'VALIDATION_ERROR',
          given: [
            `Người dùng nhập email tồn tại nhưng mật khẩu không khớp hoặc tài khoản đang ở trạng thái INACTIVE`
          ],
          when: [`Người dùng nhấn nút "Đăng nhập"`],
          then: [
            `Hệ thống trả về mã lỗi HTTP 401 Unauthorized hoặc 403 Forbidden`,
            `Hiển thị thông báo Toast cảnh báo: "Email hoặc mật khẩu không chính xác" (không để lộ email có tồn tại hay không)`,
            `Không cấp phát bất kỳ JWT token nào và ghi log số lần thất bại để phòng chống brute-force`
          ]
        },
        {
          scenarioTitle: `Bảo vệ xác thực 2 lớp TOTP khi tài khoản đã bật 2FA`,
          scenarioType: 'EDGE_CASE',
          given: [
            `Tài khoản đã kích hoạt tính năng bảo mật hai lớp TOTP`,
            `Người dùng đã vượt qua bước kiểm tra email và mật khẩu`
          ],
          when: [`Người dùng nhận yêu cầu nhập mã xác thực OTP 6 chữ số từ ứng dụng Authenticator`],
          then: [
            `Chỉ cấp quyền phiên đầy đủ sau khi mã OTP 6 chữ số được giải mã và khớp với thời gian thực`,
            `Nếu nhập sai quá 5 lần liên tiếp, khóa tạm thời yêu cầu xác thực trong 15 phút`
          ]
        },
        {
          scenarioTitle: `Tiêu chuẩn phi chức năng về mã hóa và bảo vệ Token`,
          scenarioType: 'NON_FUNCTIONAL',
          given: [`Toàn bộ kết nối được thực hiện qua giao thức mã hóa HTTPS/TLS`],
          when: [`Token hết hạn (sau 15 phút với Access Token)`],
          then: [
            `Client tự động kích hoạt luồng Token Rotation âm thầm (Silent Refresh) với HTTP-only Cookie`,
            `Mật khẩu người dùng luôn được băm bằng thuật toán bcrypt với salt rounds tối thiểu là 10`,
            `Thời gian phản hồi API xác thực trung bình dưới 400ms`
          ]
        }
      ]
    }

    if (isPayment) {
      return [
        {
          scenarioTitle: `Tạo giao dịch thanh toán thành công và chuyển hướng tới cổng thanh toán`,
          scenarioType: 'HAPPY_PATH',
          given: [
            `Người dùng đã đăng nhập và có đơn hàng hợp lệ với tổng số tiền > 0 VNĐ`,
            `Cổng thanh toán trực tuyến đang hoạt động bình thường`
          ],
          when: [
            `Người dùng chọn phương thức thanh toán VNPay / MoMo và nhấn nút "Thanh toán ngay"`
          ],
          then: [
            `Hệ thống tạo bản ghi giao dịch trong cơ sở dữ liệu với trạng thái "PENDING"`,
            `Ký chữ ký điện tử HMAC-SHA512 an toàn và chuyển hướng trình duyệt tới URL cổng thanh toán đối tác`
          ]
        },
        {
          scenarioTitle: `Xử lý Webhook IPN đối soát giao dịch thành công (Idempotency)`,
          scenarioType: 'HAPPY_PATH',
          given: [
            `Giao dịch thanh toán đã được người dùng hoàn tất tại cổng đối tác`,
            `Cổng thanh toán gửi Webhook IPN callback tới máy chủ Sprintos`
          ],
          when: [`Máy chủ nhận được Webhook request kèm chữ ký số hợp lệ`],
          then: [
            `Xác thực chữ ký số thành công và cập nhật trạng thái đơn hàng sang "SUCCESS"`,
            `Cộng điểm/dịch vụ tương ứng cho tài khoản người dùng ngay lập tức`,
            `Phản hồi HTTP 200 {"RspCode": "00", "Message": "Confirm Success"} cho đối tác`,
            `Đảm bảo tính Idempotency: nếu Webhook gửi lại lần 2, hệ thống không cộng dồn tiền 2 lần`
          ]
        },
        {
          scenarioTitle: `Từ chối Webhook bị giả mạo chữ ký hoặc số tiền không khớp`,
          scenarioType: 'EDGE_CASE',
          given: [`Yêu cầu Webhook có chữ ký Checksum sai lệch hoặc số tiền không trùng khớp với hóa đơn gốc`],
          when: [`Hệ thống tiến hành xác thực dữ liệu callback`],
          then: [
            `Từ chối xử lý, giữ nguyên trạng thái đơn hàng và trả về mã lỗi bảo mật`,
            `Ghi lại log cảnh báo an ninh với đầy đủ IP, Header và Payload của kẻ tấn công`
          ]
        },
        {
          scenarioTitle: `Tiêu chuẩn hiệu năng và khôi phục giao dịch timeout`,
          scenarioType: 'NON_FUNCTIONAL',
          given: [`Người dùng đã thanh toán nhưng mạng bị gián đoạn trước khi quay lại trang cảm ơn`],
          when: [`Quá 15 phút chưa nhận được phản hồi IPN`],
          then: [
            `Tác vụ nền tự động gọi API Query Transaction sang cổng đối tác để chủ động đối soát`,
            `Đảm bảo không xảy ra hiện tượng trừ tiền khách hàng mà dịch vụ không được kích hoạt`
          ]
        }
      ]
    }

    if (isRealtime) {
      return [
        {
          scenarioTitle: `Gửi và nhận tin nhắn theo thời gian thực trong phòng chat dự án`,
          scenarioType: 'HAPPY_PATH',
          given: [
            `Hai thành viên A và B đều là Project Member và đang mở phòng chat của dự án`,
            `Kết nối Socket.io giữa máy khách và máy chủ đã được xác thực thành công`
          ],
          when: [`Thành viên A nhập tin nhắn "Tiến độ Sprint đang rất tốt" và nhấn Gửi`],
          then: [
            `Tin nhắn được lưu vào cơ sở dữ liệu với thời gian chính xác`,
            `Máy chủ phát tán sự kiện "new_message" tới kênh riêng của dự án`,
            `Thành viên B nhìn thấy tin nhắn xuất hiện trên màn hình trong vòng dưới 200ms mà không cần tải lại trang`
          ]
        },
        {
          scenarioTitle: `Xử lý tự động kết nối lại khi mạng bị ngắt quãng`,
          scenarioType: 'EDGE_CASE',
          given: [`Người dùng đang trò chuyện nhưng bị mất kết nối Wi-Fi trong 10 giây`],
          when: [`Kết nối Internet được khôi phục`],
          then: [
            `Client tự động thực hiện Reconnect với Socket Gateway mà không cần người dùng can thiệp`,
            `Tự động truy vấn và bù đắp các tin nhắn bị bỏ lỡ trong khoảng thời gian offline`,
            `Không hiển thị tin nhắn bị trùng lặp trên giao diện người dùng`
          ]
        },
        {
          scenarioTitle: `Kiểm tra giới hạn ký tự và chống Spam tin nhắn`,
          scenarioType: 'VALIDATION_ERROR',
          given: [`Người dùng nhập tin nhắn rỗng chỉ có khoảng trắng hoặc vượt quá 2000 ký tự`],
          when: [`Nhấn phím Enter hoặc nút Gửi`],
          then: [
            `Nút Gửi bị vô hiệu hóa hoặc hệ thống hiển thị cảnh báo lỗi dữ liệu`,
            `Không gửi bất kỳ sự kiện nào qua Socket và không tốn tài nguyên server`
          ]
        },
        {
          scenarioTitle: `Tiêu chuẩn phi chức năng về tải kết nối đồng thời`,
          scenarioType: 'NON_FUNCTIONAL',
          given: [`Hệ thống có hàng trăm người dùng hoạt động đồng thời`],
          when: [`Có nhiều sự kiện nhắn tin và thông báo cùng lúc`],
          then: [
            `Socket Gateway duy trì độ trễ phát tán (broadcast latency) < 300ms`,
            `Tiêu hao RAM và CPU trên máy chủ NestJS duy trì ở mức ổn định dưới 70%`
          ]
        }
      ]
    }

    if (isUpload) {
      return [
        {
          scenarioTitle: `Tải lên tệp ảnh hợp lệ lên S3 qua Presigned URL thành công`,
          scenarioType: 'HAPPY_PATH',
          given: [
            `Người dùng chọn một tệp hình ảnh định dạng PNG/JPEG dung lượng 2.5MB (< 25MB giới hạn)`,
            `Hệ thống S3 Storage đang hoạt động bình thường`
          ],
          when: [`Người dùng kéo thả ảnh vào khu vực đính kèm của Task`],
          then: [
            `Frontend gọi API xin Presigned PUT URL và nhận được đường dẫn tải lên trong vòng 150ms`,
            `Tải tệp trực tiếp lên S3 với thanh tiến độ hiển thị từ 0% đến 100% mượt mà`,
            `Lưu metadata tệp vào database và hiển thị bản xem trước (thumbnail) ngay lập tức`
          ]
        },
        {
          scenarioTitle: `Chặn tải lên tệp có phần mở rộng nguy hiểm hoặc dung lượng vượt ngưỡng`,
          scenarioType: 'VALIDATION_ERROR',
          given: [`Người dùng chọn tệp thực thi độc hại (.exe, .sh, .bat) hoặc tệp lớn hơn 25MB`],
          when: [`Tiến hành tải lên`],
          then: [
            `Hệ thống từ chối cấp Presigned URL và trả về lỗi HTTP 400 Bad Request`,
            `Hiển thị thông báo Toast: "Định dạng tệp không được hỗ trợ hoặc vượt quá giới hạn 25MB"`,
            `Ngăn chặn nguy cơ mã độc xâm nhập vào máy chủ lưu trữ`
          ]
        },
        {
          scenarioTitle: `Bảo vệ liên kết tải xuống riêng tư qua Presigned GET URL`,
          scenarioType: 'EDGE_CASE',
          given: [`Tệp tài liệu đính kèm thuộc dự án riêng tư`],
          when: [`Thành viên dự án nhấn vào liên kết tải xuống`],
          then: [
            `Hệ thống sinh Presigned GET URL có thời hạn hợp lệ 7 ngày`,
            `Người ngoài dự án không có quyền truy cập trực tiếp vào bucket S3`
          ]
        },
        {
          scenarioTitle: `Tiêu chuẩn tải lên không gây nghẽn máy chủ ứng dụng`,
          scenarioType: 'NON_FUNCTIONAL',
          given: [`Nhiều thành viên cùng tải lên tài liệu dung lượng lớn`],
          when: [`Các tiến trình upload diễn ra đồng thời`],
          then: [
            `Dữ liệu file truyền trực tiếp từ trình duyệt Client tới AWS S3, không đi qua RAM của Backend`,
            `Backend NestJS không bị chậm hay treo khi có file tải lên dung lượng lớn`
          ]
        }
      ]
    }

    // Mặc định: Phân tích nghiệp vụ Feature tiêu chuẩn
    return [
      {
        scenarioTitle: `Thực thi thành công tính năng "${title}" với dữ liệu đầu vào hợp lệ (Happy Path)`,
        scenarioType: 'HAPPY_PATH',
        given: [
          `Người dùng đã đăng nhập với vai trò có đủ quyền hạn trong dự án`,
          `Các dữ liệu đầu vào cần thiết đã được điền đầy đủ và đúng định dạng`
        ],
        when: [`Người dùng nhấn nút xác nhận thực hiện hành động`],
        then: [
          `Hệ thống xử lý thành công, cập nhật trạng thái dữ liệu trong cơ sở dữ liệu`,
          `Hiển thị thông báo Toast phản hồi thành công trực quan trên giao diện`,
          `Thời gian phản hồi nghiệp vụ kết thúc trong vòng dưới 500ms`
        ]
      },
      {
        scenarioTitle: `Kiểm tra tính hợp lệ của dữ liệu đầu vào và thông báo lỗi (Validation)`,
        scenarioType: 'VALIDATION_ERROR',
        given: [`Người dùng để trống trường bắt buộc hoặc nhập định dạng không hợp lệ`],
        when: [`Nhấn nút gửi yêu cầu`],
        then: [
          `CustomZodValidationPipe chặn yêu cầu và trả về danh sách chi tiết các trường bị lỗi`,
          `Giao diện hiển thị viền đỏ và thông điệp hướng dẫn sửa lỗi ngay tại ô nhập liệu tương ứng`,
          `Không có bất kỳ dữ liệu rác nào được lưu vào cơ sở dữ liệu`
        ]
      },
      {
        scenarioTitle: `Kiểm soát quyền hạn phân quyền (RBAC) và xung đột đồng thời (Edge Cases)`,
        scenarioType: 'EDGE_CASE',
        given: [`Người dùng có vai trò VIEWER hoặc không thuộc thành viên của dự án`],
        when: [`Cố tình gửi yêu cầu thao tác qua API hoặc giao diện`],
        then: [
          `Hệ thống chặn truy cập với mã trạng thái HTTP 403 Forbidden`,
          `Ghi nhật ký bảo mật Audit Log và thông báo cho người dùng liên hệ Quản trị viên`
        ]
      },
      {
        scenarioTitle: `Tiêu chuẩn chất lượng, tính khả dụng và phản hồi giao diện (Non-Functional)`,
        scenarioType: 'NON_FUNCTIONAL',
        given: [`Giao diện hoạt động trên cả trình duyệt Desktop và thiết bị di động (Responsive)`],
        when: [`Người dùng tương tác với các thành phần của tính năng`],
        then: [
          `Giao diện duy trì độ mượt mà 60fps, tương thích chế độ Dark/Light mode chuẩn Tailwind`,
          `Các thao tác thay đổi dữ liệu kích hoạt invalidate React Query keys để cập nhật dữ liệu tự động`
        ]
      }
    ]
  }

  /**
   * Định dạng Markdown chuẩn Gherkin quốc tế
   */
  private formatGherkinMarkdown(title: string, scenarios: GherkinScenario[], existingTask?: any): string {
    let md = `## 🎯 Tiêu Chí Nghiệm Thu (Acceptance Criteria - Gherkin)\n\n`
    md += `**Công việc:** \`${title}\`${existingTask ? ` (Task ID: \`${existingTask.id}\`)` : ''}\n`
    md += `**Chuẩn định dạng:** International Gherkin Syntax (\`Feature\` - \`Scenario\` - \`Given\` - \`When\` - \`Then\`)\n\n`

    scenarios.forEach((sc, index) => {
      const typeBadge =
        sc.scenarioType === 'HAPPY_PATH'
          ? '🟢 **[Happy Path]**'
          : sc.scenarioType === 'VALIDATION_ERROR'
            ? '🟠 **[Validation & Error]**'
            : sc.scenarioType === 'EDGE_CASE'
              ? '🟣 **[Edge Case & RBAC]**'
              : '🔵 **[Non-Functional & Security]**'

      md += `### Kịch bản ${index + 1}: ${sc.scenarioTitle}\n`
      md += `${typeBadge}\n\n`
      md += `\`\`\`gherkin\n`
      md += `Scenario: ${sc.scenarioTitle}\n`

      sc.given.forEach((g, gIdx) => {
        md += `  ${gIdx === 0 ? 'Given' : '  And'} ${g}\n`
      })

      sc.when.forEach((w, wIdx) => {
        md += `  ${wIdx === 0 ? 'When' : '  And'} ${w}\n`
      })

      sc.then.forEach((t, tIdx) => {
        md += `  ${tIdx === 0 ? 'Then' : '  And'} ${t}\n`
      })

      md += `\`\`\`\n\n`
    })

    return md
  }
}
