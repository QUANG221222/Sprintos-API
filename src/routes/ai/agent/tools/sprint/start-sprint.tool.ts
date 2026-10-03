import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

@Injectable()
export class StartSprintTool implements IAgentTool {
  private readonly logger = new Logger(StartSprintTool.name)

  readonly name = 'startSprint'
  readonly description =
    'Chuyển trạng thái Sprint từ PLANNED sang ACTIVE để chính thức bắt đầu chu kỳ Agile. ' +
    'Kiểm tra nguyên tắc Scrum (chỉ 1 Sprint ACTIVE đồng thời trong cùng dự án). ' +
    'Tự động tổng hợp danh sách công việc, tính toán tổng Story Points cam kết, ' +
    'và khởi tạo bản ghi tiến độ ngày đầu tiên (SprintDailySnapshot) phục vụ vẽ biểu đồ Burndown Chart.'

  readonly category: ToolCategory = 'SPRINT'
  readonly riskLevel: ToolRiskLevel = 'WRITE'
  readonly level: ToolActionLevel = 'WRITE'

  readonly parameters = {
    type: 'object',
    properties: {
      sprintId: {
        type: 'string',
        description: 'ID của Sprint cần bắt đầu (nếu để trống sẽ tự lấy từ ngữ cảnh hiện tại)'
      },
      projectId: {
        type: 'string',
        description: 'ID dự án (nếu để trống sẽ tự lấy từ ngữ cảnh hiện tại)'
      },
      autoCompleteActiveSprint: {
        type: 'boolean',
        description: 'Nếu true và dự án đang có một Sprint khác ACTIVE, hệ thống sẽ tự động hoàn thành Sprint cũ để nhường chỗ cho Sprint mới (mặc định: false)'
      },
      dryRun: {
        type: 'boolean',
        description: 'Nếu true, chỉ xem trước báo cáo kiểm tra phạm vi và cam kết Sprint mà chưa chuyển trạng thái thật (mặc định: false)'
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
        output: '❌ **Lỗi:** Không xác định được `sprintId`. Vui lòng cung cấp ID của Sprint cần bắt đầu.',
        status: 'ERROR',
        summary: 'Thiếu sprintId để bắt đầu Sprint'
      }
    }

    const dryRun = Boolean(args.dryRun)
    const autoCompleteActiveSprint = Boolean(args.autoCompleteActiveSprint)

    try {
      // 1. Truy vấn thông tin Sprint và các công việc kèm theo
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

      // 2. Kiểm tra trạng thái hiện tại
      if (sprint.status === 'ACTIVE') {
        return {
          output: `ℹ️ **Thông báo:** Sprint **"${sprint.name}"** hiện tại đã ở trạng thái **ACTIVE** (đang chạy). Không cần thao tác lại.`,
          status: 'SUCCESS',
          summary: `Sprint ${sprint.name} đã ở trạng thái ACTIVE`
        }
      }

      if (sprint.status === 'COMPLETED') {
        return {
          output: `⚠️ **Không thể bắt đầu:** Sprint **"${sprint.name}"** đã hoàn thành (\`COMPLETED\`) trước đó. Không thể mở lại Sprint đã kết thúc. Vui lòng tạo Sprint mới.`,
          status: 'ERROR',
          summary: `Không thể kích hoạt Sprint đã hoàn thành`
        }
      }

      // 3. Kiểm tra xem dự án có Sprint nào khác đang ACTIVE không (Scrum Invariant: 1 Active Sprint per Project)
      const currentActiveSprint = await this.prisma.sprint.findFirst({
        where: {
          projectId: sprint.projectId,
          id: { not: sprint.id },
          status: 'ACTIVE',
          deletedAt: null
        },
        select: { id: true, name: true, startDate: true, endDate: true }
      })

      if (currentActiveSprint && !autoCompleteActiveSprint) {
        return {
          output:
            `⚠️ **Xung đột quy trình Scrum (Active Sprint Conflict):**\n\n` +
            `Dự án **${sprint.project.name}** hiện đang có một Sprint đang chạy: **"${currentActiveSprint.name}"** (ID: \`${currentActiveSprint.id}\`).\n\n` +
            `Theo nguyên tắc Scrum tiêu chuẩn, một dự án chỉ nên có **duy nhất 1 Sprint ở trạng thái ACTIVE** tại cùng một thời điểm.\n\n` +
            `**Các lựa chọn xử lý:**\n` +
            `1. Hoàn thành Sprint cũ trước bằng công cụ \`completeSprint\` (ID: \`${currentActiveSprint.id}\`).\n` +
            `2. Gọi lại công cụ này với tham số \`autoCompleteActiveSprint: true\` để hệ thống tự động hoàn thành Sprint cũ và bắt đầu Sprint **"${sprint.name}"** ngay lập tức.`,
          status: 'ERROR',
          summary: `Đã có Sprint "${currentActiveSprint.name}" đang ACTIVE`
        }
      }

      // 4. Thống kê quy mô công việc và Story Points cam kết
      const tasks = sprint.tasks || []
      const totalTasks = tasks.length
      const totalStoryPoints = tasks.reduce((sum, t) => sum + (t.storyPoint || 0), 0)
      const completedTasks = tasks.filter((t) => t.boardColumn?.isDone)
      const completedStoryPoints = completedTasks.reduce((sum, t) => sum + (t.storyPoint || 0), 0)
      const remainingStoryPoints = totalStoryPoints - completedStoryPoints

      const unassignedTasks = tasks.filter((t) => !t.assignees || t.assignees.length === 0)
      const missingSPTasks = tasks.filter((t) => !t.storyPoint || t.storyPoint === 0)

      // 5. Nếu dryRun = true: Trả về bản xem trước cam kết Sprint
      if (dryRun) {
        let md = `🧪 **CHẾ ĐỘ XEM TRƯỚC (DRY-RUN): KHỞI ĐỘNG SPRINT "${sprint.name}"**\n\n`
        md += `* **Dự án:** ${sprint.project.name}\n`
        md += `* **Thời gian dự kiến:** ${sprint.startDate.toISOString().slice(0, 10)} ➡️ ${sprint.endDate.toISOString().slice(0, 10)}\n`
        md += `* **Mục tiêu (Goal):** ${sprint.goal || '*(Chưa thiết lập)*'}\n`
        md += `* **Tổng số công việc:** ${totalTasks} tasks\n`
        md += `* **Tổng Story Points cam kết:** ${totalStoryPoints} SP (Còn lại: ${remainingStoryPoints} SP)\n`
        md += `* **Trần năng lực (Max SP):** ${sprint.maxStoryPoint || 40} SP\n`

        if (currentActiveSprint) {
          md += `\n⚠️ **Lưu ý:** Sprint cũ **"${currentActiveSprint.name}"** sẽ được tự động đóng (\`COMPLETED\`) nếu chạy thật với \`autoCompleteActiveSprint: true\`.\n`
        }

        if (missingSPTasks.length > 0) {
          md += `\n⚠️ **Cảnh báo chất lượng:** Có **${missingSPTasks.length} task** chưa được ước lượng Story Point (SP = 0). Điều này có thể làm sai lệch đồ thị Burndown Chart.\n`
        }

        if (unassignedTasks.length > 0) {
          md += `\n⚠️ **Cảnh báo phân công:** Có **${unassignedTasks.length} task** chưa được phân công người thực hiện.\n`
        }

        md += `\n> 💡 *Để kích hoạt thật và chụp Snapshot ngày 1, hãy gọi lại công cụ với \`dryRun: false\`.*`

        return {
          output: md,
          status: 'SUCCESS',
          summary: `[Xem trước] Bắt đầu Sprint ${sprint.name} (${totalTasks} tasks, ${totalStoryPoints} SP)`
        }
      }

      // 6. Kích hoạt Sprint thật vào DB bằng Transaction
      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)

      await this.prisma.$transaction(async (tx) => {
        // 6.1. Nếu có Sprint đang active và người dùng cho phép auto-complete, hoàn thành sprint đó
        if (currentActiveSprint && autoCompleteActiveSprint) {
          await tx.sprint.update({
            where: { id: currentActiveSprint.id },
            data: {
              status: 'COMPLETED',
              endDate: new Date(),
              updatedAt: new Date()
            }
          })
        }

        // 6.2. Cập nhật Sprint hiện tại sang ACTIVE
        await tx.sprint.update({
          where: { id: sprint.id },
          data: {
            status: 'ACTIVE',
            startDate: new Date(),
            updatedAt: new Date()
          }
        })

        // 6.3. Khởi tạo bản ghi tiến độ ngày đầu tiên (SprintDailySnapshot)
        await tx.sprintDailySnapshot.upsert({
          where: {
            sprintId_date: {
              sprintId: sprint.id,
              date: today
            }
          },
          update: {
            totalStoryPoints,
            completedStoryPoints,
            remainingStoryPoints
          },
          create: {
            sprintId: sprint.id,
            date: today,
            totalStoryPoints,
            completedStoryPoints,
            remainingStoryPoints
          }
        })
      })

      // 7. Định dạng kết quả thành công
      let outputMd = `### 🚀 Sprint Đã Được Kích Hoạt Thành Công!\n\n`
      outputMd += `Sprint **${sprint.name}** đã chính thức chuyển sang trạng thái **ACTIVE**.\n\n`
      outputMd += `| Chỉ số theo dõi | Chi tiết |\n`
      outputMd += `| :--- | :--- |\n`
      outputMd += `| **Dự án** | ${sprint.project.name} |\n`
      outputMd += `| **Sprint ID** | \`${sprint.id}\` |\n`
      outputMd += `| **Trạng thái** | 🟢 **ACTIVE** (Đang tiến hành) |\n`
      outputMd += `| **Ngày bắt đầu thực tế** | ${new Date().toISOString().slice(0, 10)} |\n`
      outputMd += `| **Hạn chót dự kiến** | ${sprint.endDate.toISOString().slice(0, 10)} |\n`
      outputMd += `| **Tổng số công việc** | **${totalTasks}** tasks |\n`
      outputMd += `| **Tổng Story Points cam kết** | **${totalStoryPoints}** SP |\n`
      outputMd += `| **Snapshot ngày 1** | ${remainingStoryPoints} SP còn lại (Đã lưu vào Burndown Engine) |\n\n`

      if (currentActiveSprint && autoCompleteActiveSprint) {
        outputMd += `> ℹ️ *Sprint tiền nhiệm **"${currentActiveSprint.name}"** đã được tự động hoàn tất và lưu trữ an toàn.*\n\n`
      }

      if (missingSPTasks.length > 0) {
        outputMd += `> ⚠️ **Lưu ý:** Có ${missingSPTasks.length} task chưa có Story Point. Khuyến nghị dùng \`analyzeBacklogTasks\` để bổ sung ước lượng.\n\n`
      }

      outputMd += `🎯 **Mục tiêu Sprint (Goal):** ${sprint.goal || '*(Chưa ghi nhận mục tiêu cụ thể)*'}\n\n`
      outputMd += `Chúc toàn bộ đội ngũ có một chu kỳ làm việc hiệu quả và đạt 100% mục tiêu Sprint!`

      return {
        output: outputMd,
        status: 'SUCCESS',
        summary: `Đã kích hoạt Sprint "${sprint.name}" (${totalTasks} tasks, ${totalStoryPoints} SP)`
      }
    } catch (err: any) {
      this.logger.error(`StartSprintTool error: ${err?.message}`, err?.stack)
      return {
        output: `❌ **Lỗi khi kích hoạt Sprint:** ${err?.message || err}`,
        status: 'ERROR',
        summary: `Lỗi kích hoạt Sprint ${targetSprintId}`
      }
    }
  }
}
