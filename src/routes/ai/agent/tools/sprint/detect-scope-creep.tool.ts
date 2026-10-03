import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

export type ScopeCreepRiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'

export interface ScopeCreepTaskDetail {
  id: string
  title: string
  storyPoint: number
  duration: number
  priority: string
  columnName: string
  isDone: boolean
  creatorName: string
  assignees: string[]
  createdAt: string
  daysAfterStart: number
}

@Injectable()
export class DetectScopeCreepTool implements IAgentTool {
  private readonly logger = new Logger(DetectScopeCreepTool.name)

  readonly name = 'detectScopeCreep'
  readonly description =
    'Phân tích & Đo lường Biến Động Phạm Vi (Scope Creep) trong Sprint: So sánh phạm vi cam kết ban đầu (Baseline) ' +
    'với các công việc phát sinh thêm giữa chừng. Tính toán Chỉ số Scope Creep Index (% Story Points và % Tasks tăng thêm), ' +
    'đánh giá mức độ rủi ro vỡ kế hoạch cam kết, và gợi ý phương án điều chỉnh phạm vi (Trade-off) chuẩn Agile.'

  readonly category: ToolCategory = 'SPRINT'
  readonly riskLevel: ToolRiskLevel = 'READ'
  readonly level: ToolActionLevel = 'READ'

  readonly parameters = {
    type: 'object',
    properties: {
      sprintId: {
        type: 'string',
        description: 'ID của Sprint cần đo lường Scope Creep (nếu bỏ trống, dùng Sprint ACTIVE hiện tại)'
      },
      creepThresholdPercent: {
        type: 'number',
        description: 'Ngưỡng % Scope Creep cảnh báo nguy hiểm (mặc định: 15%)'
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
      sprintId?: string
      creepThresholdPercent?: number
    },
    context: AgentContext
  ): Promise<ToolExecutionResult> {
    const { creepThresholdPercent = 15 } = args
    const targetProjectId = context.targetProjectId

    try {
      // 1. Xác định Sprint mục tiêu
      let sprintId = args.sprintId || context.activeSprintId

      if (!sprintId && targetProjectId) {
        const activeSprint = await this.prisma.sprint.findFirst({
          where: { projectId: targetProjectId, status: 'ACTIVE', deletedAt: null },
          orderBy: { createdAt: 'desc' }
        })
        sprintId = activeSprint?.id
      }

      if (!sprintId && targetProjectId) {
        const anySprint = await this.prisma.sprint.findFirst({
          where: { projectId: targetProjectId, deletedAt: null },
          orderBy: { createdAt: 'desc' }
        })
        sprintId = anySprint?.id
      }

      if (!sprintId) {
        return {
          output: 'Không tìm thấy Sprint phù hợp để đo lường Scope Creep.',
          status: 'ERROR',
          summary: 'Thiếu Sprint ID'
        }
      }

      // 2. Truy vấn Sprint, Daily Snapshots và Tasks
      const sprint = await this.prisma.sprint.findUnique({
        where: { id: sprintId, deletedAt: null },
        include: {
          project: { select: { id: true, name: true } },
          dailySnapshots: {
            orderBy: { date: 'asc' }
          },
          tasks: {
            where: { deletedAt: null },
            include: {
              boardColumn: true,
              assignees: {
                include: {
                  user: { select: { displayName: true } }
                }
              },
              createdBy: {
                select: { displayName: true }
              }
            },
            orderBy: { createdAt: 'asc' }
          }
        }
      })

      if (!sprint) {
        return {
          output: `Không tìm thấy Sprint với ID "${sprintId}".`,
          status: 'ERROR',
          summary: 'Sprint không tồn tại'
        }
      }

      // 3. Xác định mốc thời gian Baseline (Ngày bắt đầu Sprint)
      // Cho phép buffer 24h từ lúc Sprint bắt đầu cho các điều chỉnh lập kế hoạch ban đầu
      let baselineDate: Date = sprint.startDate ? new Date(sprint.startDate) : new Date(sprint.createdAt)
      if (sprint.dailySnapshots.length > 0) {
        baselineDate = new Date(sprint.dailySnapshots[0].date)
      }
      const baselineCutoffMs = baselineDate.getTime() + 24 * 60 * 60 * 1000

      // 4. Phân loại Tasks: Committed (Cam kết ban đầu) vs Added (Phát sinh giữa chừng)
      const committedTasks: any[] = []
      const addedTasks: ScopeCreepTaskDetail[] = []

      let committedSP = 0
      let addedSP = 0
      let committedDoneSP = 0
      let addedDoneSP = 0

      for (const t of sprint.tasks) {
        const taskCreatedMs = new Date(t.createdAt).getTime()
        const sp = t.storyPoint || 0
        const isDone = t.boardColumn.isDone

        if (taskCreatedMs <= baselineCutoffMs) {
          committedTasks.push(t)
          committedSP += sp
          if (isDone) committedDoneSP += sp
        } else {
          addedSP += sp
          if (isDone) addedDoneSP += sp

          const diffDays = Math.max(1, Math.floor((taskCreatedMs - baselineDate.getTime()) / (1000 * 60 * 60 * 24)))

          addedTasks.push({
            id: t.id,
            title: t.title,
            storyPoint: sp,
            duration: t.duration || 0,
            priority: t.priority || 'MEDIUM',
            columnName: t.boardColumn.title,
            isDone,
            creatorName: t.createdBy?.displayName || 'Hệ thống',
            assignees: t.assignees.map((a) => a.user.displayName),
            createdAt: new Date(t.createdAt).toISOString(),
            daysAfterStart: diffDays
          })
        }
      }

      // 5. Tính toán các chỉ số Scope Creep
      const committedTasksCount = committedTasks.length
      const addedTasksCount = addedTasks.length
      const totalTasks = committedTasksCount + addedTasksCount
      const totalSP = committedSP + addedSP

      const scopeCreepSPPercent =
        committedSP > 0
          ? Math.round((addedSP / committedSP) * 100)
          : committedTasksCount > 0
            ? Math.round((addedTasksCount / committedTasksCount) * 100)
            : 0

      const scopeCreepTaskPercent =
        committedTasksCount > 0 ? Math.round((addedTasksCount / committedTasksCount) * 100) : 0

      // Đánh giá mức độ rủi ro Scope Creep
      let riskLevel: ScopeCreepRiskLevel = 'LOW'
      if (scopeCreepSPPercent > 30 || scopeCreepTaskPercent > 35) {
        riskLevel = 'CRITICAL'
      } else if (scopeCreepSPPercent > creepThresholdPercent) {
        riskLevel = 'HIGH'
      } else if (scopeCreepSPPercent >= 8) {
        riskLevel = 'MODERATE'
      }

      // 6. Gợi ý điều chỉnh phạm vi (Trade-off Recommendations)
      const recommendations: string[] = []
      if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
        recommendations.push(
          `🔴 **Cảnh báo đỏ:** Phạm vi Sprint đã tăng **${scopeCreepSPPercent}%** (${addedSP} SP mới). Nhóm cam kết hoàn thành Sprint có nguy cơ trễ hạn nghiêm trọng.`
        )
        recommendations.push(
          `⚖️ **Áp dụng Nguyên tắc Đổi Chỗ (Scope Trade-off):** Để duy trì chất lượng cam kết ban đầu, cần chuyển bớt ${addedSP} SP các task ưu tiên thấp hoặc các task chưa bắt đầu về Backlog hoặc Sprint tiếp theo.`
        )
      } else if (riskLevel === 'MODERATE') {
        recommendations.push(
          `🟡 **Lưu ý:** Phạm vi phát sinh thêm ${addedSP} SP (${scopeCreepSPPercent}%). Cần theo dõi sát sao biểu đồ Burndown để đảm bảo velocity đáp ứng kịp.`
        )
      } else {
        recommendations.push(
          `🟢 **Rất tốt:** Phạm vi Sprint ổn định (${scopeCreepSPPercent}% biến động), nằm trong ngưỡng an toàn Agile (< 10%).`
        )
      }

      const markdown = this.formatMarkdownReport(
        sprint,
        baselineDate,
        committedTasksCount,
        committedSP,
        committedDoneSP,
        addedTasksCount,
        addedSP,
        addedDoneSP,
        totalTasks,
        totalSP,
        scopeCreepSPPercent,
        scopeCreepTaskPercent,
        riskLevel,
        addedTasks,
        recommendations
      )

      const payload = {
        sprintId: sprint.id,
        sprintName: sprint.name,
        baselineStartDate: baselineDate.toISOString(),
        metrics: {
          committedTasksCount,
          committedStoryPoints: committedSP,
          committedDoneStoryPoints: committedDoneSP,
          addedTasksCount,
          addedStoryPoints: addedSP,
          addedDoneStoryPoints: addedDoneSP,
          totalCurrentTasks: totalTasks,
          totalCurrentStoryPoints: totalSP,
          scopeCreepStoryPointPercent: scopeCreepSPPercent,
          scopeCreepTaskPercent: scopeCreepTaskPercent,
          riskLevel
        },
        addedTasks,
        recommendations
      }

      return {
        output: `${markdown}\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        status: 'SUCCESS',
        summary: `Scope Creep Sprint "${sprint.name}": +${scopeCreepSPPercent}% SP (${addedSP} SP phát sinh) · Rủi ro: [${riskLevel}]`
      }
    } catch (err: any) {
      this.logger.error(`DetectScopeCreepTool error: ${err?.message}`, err?.stack)
      return {
        output: `Lỗi khi phân tích Scope Creep trong Sprint: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Lỗi phân tích Scope Creep'
      }
    }
  }

  private formatMarkdownReport(
    sprint: any,
    baselineDate: Date,
    committedCount: number,
    committedSP: number,
    committedDoneSP: number,
    addedCount: number,
    addedSP: number,
    addedDoneSP: number,
    totalCount: number,
    totalSP: number,
    creepSPPercent: number,
    creepTaskPercent: number,
    riskLevel: ScopeCreepRiskLevel,
    addedTasks: ScopeCreepTaskDetail[],
    recommendations: string[]
  ): string {
    const riskBadge =
      riskLevel === 'CRITICAL'
        ? '🔴 **RỦI RO BÁO ĐỘNG ĐỎ (CRITICAL)**'
        : riskLevel === 'HIGH'
          ? '🟠 **RỦI RO CAO (HIGH)**'
          : riskLevel === 'MODERATE'
            ? '🟡 **CẢNH BÁO (MODERATE)**'
            : '🟢 **AN TOÀN (LOW)**'

    let md = `### 📈 Báo Cáo Biến Động Phạm Vi Sprint (Scope Creep Analysis)\n\n`
    md += `* **Sprint:** **${sprint.name}** (Trạng thái: \`${sprint.status}\`)\n`
    md += `* **Ngày Baseline Khởi Động:** ${baselineDate.toLocaleDateString('vi-VN')}\n`
    md += `* **Đánh Giá Rủi Ro:** ${riskBadge}\n`
    md += `* **Chỉ số Biến Động SP (Scope Creep Index):** **+${creepSPPercent}%** (${addedSP} SP mới phát sinh)\n\n`

    md += `#### ⚖️ Bảng Đối Chiếu Cam Kết Ban Đầu vs Phát Sinh Thực Tế\n`
    md += `| Tiêu chí | Cam kết Ban đầu (Baseline) | Phát sinh Giữa chừng (Added) | Tổng Hiện tại | % Tăng trưởng |\n`
    md += `| :--- | :---: | :---: | :---: | :---: |\n`
    md += `| **Tổng Story Points** | **${committedSP} SP** | **+${addedSP} SP** | **${totalSP} SP** | **+${creepSPPercent}%** |\n`
    md += `| **Số lượng Công việc** | **${committedCount} tasks** | **+${addedCount} tasks** | **${totalCount} tasks** | **+${creepTaskPercent}%** |\n`
    md += `| **Tiến độ Hoàn thành SP** | ${committedDoneSP} / ${committedSP} SP | ${addedDoneSP} / ${addedSP} SP | ${committedDoneSP + addedDoneSP} / ${totalSP} SP | ${totalSP > 0 ? Math.round(((committedDoneSP + addedDoneSP) / totalSP) * 100) : 0}% |\n\n`

    if (addedTasks.length > 0) {
      md += `#### 🔍 Danh Sách Công Việc Được Thêm Giữa Chừng (Scope Creep Tasks)\n`
      md += `| # | Task phát sinh | SP | Cột hiện tại | Người tạo | Ngày thêm | Phụ trách |\n`
      md += `| :---: | :--- | :---: | :---: | :---: | :---: | :--- |\n`

      addedTasks.forEach((t, index) => {
        const assignees = t.assignees.length > 0 ? t.assignees.join(', ') : '_Chưa gán_'
        md += `| ${index + 1} | **${t.title}** | ${t.storyPoint} SP | \`${t.columnName}\` | ${t.creatorName} | Ngày thứ ${t.daysAfterStart} | ${assignees} |\n`
      })
    } else {
      md += `> ✅ **Không có công việc phát sinh:** Toàn bộ công việc trong Sprint đều nằm trong kế hoạch cam kết ban đầu.\n`
    }

    md += `\n#### 💡 Khuyến Nghị Kỹ Sư Trưởng / PM\n`
    recommendations.forEach((rec) => {
      md += `* ${rec}\n`
    })

    return md
  }
}
