import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

export type AnomalySeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export interface StaleTaskItem {
  id: string
  title: string
  columnName: string
  isWip: boolean
  isDone: boolean
  assignees: string[]
  storyPoint: number
  duration: number
  dueDate: string | null
  lastUpdatedDaysAgo: number
  isStale: boolean
  isOverdue: boolean
  isUnassigned: boolean
  isMissingStoryPoint: boolean
  isMissingDuration: boolean
  hasDependentSuccessors: boolean
  successorCount: number
  severity: AnomalySeverity
  reasons: string[]
}

@Injectable()
export class DetectStaleTasksTool implements IAgentTool {
  private readonly logger = new Logger(DetectStaleTasksTool.name)

  readonly name = 'detectStaleTasks'
  readonly description =
    'Giám sát Sức khỏe Sprint & Phát hiện Bất thường: Quét toàn bộ công việc trong Sprint để tìm các task bị "đóng băng" ' +
    '(stale tasks) ở cột Đang làm / Review không có cập nhật trong quá N ngày (mặc định 3 ngày), các task đã quá hạn chót (dueDate), ' +
    'và các task bị khiếm khuyết thông tin cốt lõi (thiếu người phụ trách, thiếu storyPoint làm gãy Burndown, thiếu duration làm sập thuật toán CPM/Gantt). ' +
    'Tính toán Sprint Health Score (0-100) và đưa ra cảnh báo sớm.'

  readonly category: ToolCategory = 'SPRINT'
  readonly riskLevel: ToolRiskLevel = 'READ'
  readonly level: ToolActionLevel = 'READ'

  readonly parameters = {
    type: 'object',
    properties: {
      sprintId: {
        type: 'string',
        description: 'ID của Sprint cần quét (nếu bỏ trống, hệ thống tự động chọn Sprint ACTIVE hiện tại)'
      },
      staleDaysThreshold: {
        type: 'number',
        description: 'Ngưỡng số ngày không có hoạt động để xem là task bị ứ đọng (mặc định: 3 ngày)'
      },
      includeCompleted: {
        type: 'boolean',
        description: 'Có quét cả các task trong cột Đã hoàn thành (Done) hay không (mặc định: false)'
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
      staleDaysThreshold?: number
      includeCompleted?: boolean
    },
    context: AgentContext
  ): Promise<ToolExecutionResult> {
    const { staleDaysThreshold = 3, includeCompleted = false } = args
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
          output: 'Không tìm thấy Sprint phù hợp để quét sức khỏe và phát hiện task bất thường.',
          status: 'ERROR',
          summary: 'Không tìm thấy Sprint'
        }
      }

      // 2. Truy vấn chi tiết Sprint và toàn bộ tasks
      const sprint = await this.prisma.sprint.findUnique({
        where: { id: sprintId, deletedAt: null },
        include: {
          project: { select: { id: true, name: true } },
          tasks: {
            where: { deletedAt: null },
            include: {
              boardColumn: true,
              assignees: {
                include: {
                  user: { select: { id: true, displayName: true, email: true } }
                }
              },
              successors: {
                select: { id: true, successorId: true }
              }
            },
            orderBy: { updatedAt: 'asc' }
          }
        }
      })

      if (!sprint) {
        return {
          output: `Không tìm thấy thông tin Sprint với ID "${sprintId}".`,
          status: 'ERROR',
          summary: 'Sprint không tồn tại'
        }
      }

      const now = new Date()
      const nowMs = now.getTime()

      // 3. Phân tích từng task
      const analyzedTasks: StaleTaskItem[] = []
      let staleCount = 0
      let overdueCount = 0
      let unassignedCount = 0
      let missingSpCount = 0
      let missingDurationCount = 0
      let criticalCount = 0
      let highCount = 0
      let mediumCount = 0

      const candidateTasks = includeCompleted ? sprint.tasks : sprint.tasks.filter((t) => !t.boardColumn.isDone)

      for (const t of candidateTasks) {
        const updatedTime = t.updatedAt ? new Date(t.updatedAt).getTime() : new Date(t.createdAt).getTime()
        const diffDays = Math.max(0, Math.floor((nowMs - updatedTime) / (1000 * 60 * 60 * 24)))

        const isWipOrReview = t.boardColumn.isWip || !t.boardColumn.isDone
        const isStale = diffDays >= staleDaysThreshold && isWipOrReview
        const isOverdue = Boolean(t.dueDate && new Date(t.dueDate).getTime() < nowMs && !t.boardColumn.isDone)
        const isUnassigned = t.assignees.length === 0
        const isMissingSP = !t.storyPoint || t.storyPoint === 0
        const isMissingDuration = !t.duration || t.duration === 0
        const hasDependentSuccessors = t.successors.length > 0

        const reasons: string[] = []
        if (isOverdue) reasons.push(`⚠️ Quá hạn chót (dueDate: ${new Date(t.dueDate!).toLocaleDateString('vi-VN')})`)
        if (isStale) reasons.push(`⏳ Không có hoạt động trong ${diffDays} ngày (ngưỡng: ${staleDaysThreshold} ngày)`)
        if (isUnassigned) reasons.push(`👤 Chưa có người phụ trách (Unassigned)`)
        if (isMissingSP) reasons.push(`🎯 Thiếu Story Point (= 0) làm gãy Burndown Chart`)
        if (isMissingDuration) reasons.push(`⏱️ Thiếu Duration làm sập thuật toán CPM/Gantt`)
        if (hasDependentSuccessors && (isStale || isOverdue)) {
          reasons.push(`🚨 Đang chặn ${t.successors.length} công việc phụ thuộc kế tiếp trên đường găng`)
        }

        // Đánh giá mức độ nghiêm trọng
        let severity: AnomalySeverity = 'LOW'
        if (isOverdue || (isStale && hasDependentSuccessors) || (diffDays >= 7 && isWipOrReview)) {
          severity = 'CRITICAL'
          criticalCount++
        } else if (isStale || (isMissingSP && isMissingDuration)) {
          severity = 'HIGH'
          highCount++
        } else if (isUnassigned || isMissingSP || isMissingDuration) {
          severity = 'MEDIUM'
          mediumCount++
        }

        if (isStale) staleCount++
        if (isOverdue) overdueCount++
        if (isUnassigned) unassignedCount++
        if (isMissingSP) missingSpCount++
        if (isMissingDuration) missingDurationCount++

        analyzedTasks.push({
          id: t.id,
          title: t.title,
          columnName: t.boardColumn.title,
          isWip: t.boardColumn.isWip,
          isDone: t.boardColumn.isDone,
          assignees: t.assignees.map((a) => a.user.displayName),
          storyPoint: t.storyPoint || 0,
          duration: t.duration || 0,
          dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
          lastUpdatedDaysAgo: diffDays,
          isStale,
          isOverdue,
          isUnassigned,
          isMissingStoryPoint: isMissingSP,
          isMissingDuration: isMissingDuration,
          hasDependentSuccessors,
          successorCount: t.successors.length,
          severity,
          reasons
        })
      }

      // Sắp xếp tasks theo mức độ nghiêm trọng giảm dần (CRITICAL -> HIGH -> MEDIUM -> LOW)
      const severityWeight: Record<AnomalySeverity, number> = {
        CRITICAL: 4,
        HIGH: 3,
        MEDIUM: 2,
        LOW: 1
      }
      analyzedTasks.sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity])

      // 4. Tính toán Sprint Health Score (0 - 100)
      // Công thức: 100 - (critical * 15 + high * 8 + medium * 3 + overdue * 10)
      const penalty = criticalCount * 15 + overdueCount * 10 + highCount * 8 + mediumCount * 3
      const healthScore = Math.max(0, Math.min(100, Math.round(100 - penalty / Math.max(1, candidateTasks.length * 0.2))))

      // 5. Khuyến nghị hành động
      const recommendations: string[] = []
      if (criticalCount > 0 || overdueCount > 0) {
        recommendations.push(
          `🔴 **Khẩn cấp:** Có ${overdueCount} task quá hạn và ${criticalCount} task mức CRITICAL. Scrum Master cần họp nhanh Standup gỡ nghẽn ngay hôm nay.`
        )
      }
      if (staleCount > 0) {
        recommendations.push(
          `⏳ **Task ứ đọng:** Có ${staleCount} task đang làm bị dừng trên ${staleDaysThreshold} ngày. Kiểm tra xem thành viên có gặp khó khăn kỹ thuật (blocker) hoặc quên cập nhật bảng không.`
        )
      }
      if (missingDurationCount > 0 || missingSpCount > 0) {
        recommendations.push(
          `📊 **Chuẩn hóa dữ liệu:** Phát hiện ${missingDurationCount} task thiếu duration và ${missingSpCount} task thiếu Story Point. Hãy bổ sung ngay để thuật toán đường găng CPM và biểu đồ Burndown hoạt động chính xác.`
        )
      }
      if (unassignedCount > 0) {
        recommendations.push(
          `👤 **Phân công:** Có ${unassignedCount} task chưa gán người phụ trách. Cần gán việc để đảm bảo trách nhiệm bàn giao.`
        )
      }
      if (recommendations.length === 0) {
        recommendations.push(`🟢 Sprint đang duy trì nhịp độ làm việc rất tốt, không phát hiện công việc ứ đọng bất thường!`)
      }

      // 6. Định dạng Markdown trực quan
      const markdown = this.formatReportMarkdown(
        sprint,
        candidateTasks.length,
        healthScore,
        staleCount,
        overdueCount,
        unassignedCount,
        missingSpCount,
        missingDurationCount,
        analyzedTasks,
        recommendations
      )

      const payload = {
        sprintId: sprint.id,
        sprintName: sprint.name,
        healthScore,
        totalAnalyzed: candidateTasks.length,
        summaryCounts: {
          staleCount,
          overdueCount,
          unassignedCount,
          missingStoryPointCount: missingSpCount,
          missingDurationCount: missingDurationCount,
          criticalCount,
          highCount,
          mediumCount
        },
        recommendations,
        anomalies: analyzedTasks.filter((t) => t.severity !== 'LOW')
      }

      return {
        output: `${markdown}\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        status: 'SUCCESS',
        summary: `Sức khỏe Sprint "${sprint.name}": Điểm ${healthScore}/100 · ${staleCount} task ứ đọng · ${overdueCount} task quá hạn · ${criticalCount} cảnh báo đỏ CRITICAL`
      }
    } catch (err: any) {
      this.logger.error(`DetectStaleTasksTool error: ${err?.message}`, err?.stack)
      return {
        output: `Lỗi khi quét công việc ứ đọng trong Sprint: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Lỗi quét task ứ đọng'
      }
    }
  }

  private formatReportMarkdown(
    sprint: any,
    totalTasks: number,
    healthScore: number,
    staleCount: number,
    overdueCount: number,
    unassignedCount: number,
    missingSpCount: number,
    missingDurationCount: number,
    tasks: StaleTaskItem[],
    recommendations: string[]
  ): string {
    const healthBadge =
      healthScore >= 80 ? '🟢 **TỐT**' : healthScore >= 50 ? '🟡 **CẢNH BÁO**' : '🔴 **NGUY HIỂM**'

    let md = `### 🩺 Báo Cáo Sức Khỏe Sprint & Phát Hiện Task Bất Thường\n\n`
    md += `* **Sprint:** **${sprint.name}** (Trạng thái: \`${sprint.status}\`)\n`
    md += `* **Dự án:** ${sprint.project?.name || 'N/A'}\n`
    md += `* **Điểm Sức Khỏe Tổng Thể:** **${healthScore} / 100** — ${healthBadge}\n`
    md += `* **Tổng số task đang theo dõi:** ${totalTasks} công việc\n\n`

    md += `#### 📊 Ma Trận Chỉ Số Rủi Ro\n`
    md += `| Chỉ số kiểm tra | Số lượng phát hiện | Trạng thái |\n`
    md += `| :--- | :---: | :--- |\n`
    md += `| 🚨 Task Quá hạn chót (\`dueDate < now\`) | **${overdueCount}** | ${overdueCount > 0 ? '🔴 Nguy hiểm' : '🟢 Ổn định'} |\n`
    md += `| ⏳ Task ứ đọng không nhúc nhích (\`stale\`) | **${staleCount}** | ${staleCount > 0 ? '🟠 Cần can thiệp' : '🟢 Tốt'} |\n`
    md += `| 👤 Task chưa có người phụ trách (\`unassigned\`) | **${unassignedCount}** | ${unassignedCount > 0 ? '🟡 Cần phân công' : '🟢 Đã gán'} |\n`
    md += `| 🎯 Thiếu Story Point (\`SP = 0\`) | **${missingSpCount}** | ${missingSpCount > 0 ? '🟡 Gãy Burndown' : '🟢 Đầy đủ'} |\n`
    md += `| ⏱️ Thiếu Thời gian thi công (\`duration = 0\`) | **${missingDurationCount}** | ${missingDurationCount > 0 ? '🟡 Sập CPM Engine' : '🟢 Đầy đủ'} |\n\n`

    const abnormalTasks = tasks.filter((t) => t.severity !== 'LOW')
    if (abnormalTasks.length > 0) {
      md += `#### 📋 Danh Sách Công Việc Có Dấu Hiệu Bất Thường (Ưu tiên xử lý)\n`
      md += `| Mức độ | Task | Cột | Người làm | Không nhúc nhích | Lý do cảnh báo |\n`
      md += `| :---: | :--- | :---: | :---: | :---: | :--- |\n`

      abnormalTasks.slice(0, 10).forEach((t) => {
        const sevBadge =
          t.severity === 'CRITICAL'
            ? '🔴 **CRITICAL**'
            : t.severity === 'HIGH'
              ? '🟠 **HIGH**'
              : '🟡 **MEDIUM**'
        const assigneesStr = t.assignees.length > 0 ? t.assignees.join(', ') : '_Chưa gán_'
        const reasonsStr = t.reasons.join('<br>')

        md += `| ${sevBadge} | **${t.title}** | \`${t.columnName}\` | ${assigneesStr} | ${t.lastUpdatedDaysAgo} ngày trước | ${reasonsStr} |\n`
      })

      if (abnormalTasks.length > 10) {
        md += `\n_...và ${abnormalTasks.length - 10} công việc khác cần chú ý._\n`
      }
    } else {
      md += `> ✅ **Tuyệt vời!** Không có công việc nào bị ứ đọng hoặc có khiếm khuyết trong Sprint này.\n`
    }

    md += `\n#### 💡 Khuyến Nghị Hành Động Cho Scrum Master / Tech Lead\n`
    recommendations.forEach((rec) => {
      md += `* ${rec}\n`
    })

    return md
  }
}
