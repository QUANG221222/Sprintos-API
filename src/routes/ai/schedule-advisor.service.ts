import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ReportService } from '~/routes/report/report.service'
import { OpenRouterService } from '~/shared/services/openrouter.service'
import { PrismaService } from '~/shared/services/prisma.service'

export interface ScheduleDiagnosisResult {
  overallRisk: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  riskScore: number
  spi: number
  criticalPathLength: number
  totalSprintDays: number
  executiveSummary: string
  criticalBottlenecks: Array<{
    taskId: string
    taskTitle: string
    assigneeName: string
    impactDays: number
    reason: string
  }>
  mitigationStrategies: Array<{
    type: 'CRASHING' | 'FAST_TRACKING' | 'SCOPE_ADJUSTMENT'
    title: string
    description: string
    suggestedAction: string
  }>
}

@Injectable()
export class ScheduleAdvisorService {
  private readonly logger = new Logger(ScheduleAdvisorService.name)

  constructor(
    private readonly reportService: ReportService,
    private readonly openRouterService: OpenRouterService,
    private readonly prisma: PrismaService
  ) {}

  /**
   * Chẩn đoán rủi ro tiến độ dựa trên thuật toán CPM và chỉ số SPI
   */
  async diagnoseSprint(sprintId: string): Promise<ScheduleDiagnosisResult> {
    const sprint = await this.prisma.sprint.findUnique({
      where: { id: sprintId },
      include: {
        project: true,
        tasks: {
          where: { deletedAt: null },
          include: { assignees: { include: { user: true } } }
        },
        boardColumns: true
      }
    })

    if (!sprint) {
      throw new NotFoundException('Không tìm thấy Sprint để chẩn đoán')
    }

    // 1. Thu thập dữ liệu CPM từ Network Diagram
    const network = await this.reportService.getSprintNetworkDiagram(sprintId)

    // 2. Tính toán tiến độ thực tế từ Sprint Tasks
    let totalStoryPoints = 0
    let completedStoryPoints = 0
    let completedTasks = 0
    const doneColIds = new Set(sprint.boardColumns.filter((c) => c.isDone).map((c) => c.id))

    for (const t of sprint.tasks) {
      totalStoryPoints += t.storyPoint || 0
      if (doneColIds.has(t.boardColumnId)) {
        completedTasks += 1
        completedStoryPoints += t.storyPoint || 0
      }
    }

    const completionRate = totalStoryPoints > 0 ? Math.round((completedStoryPoints / totalStoryPoints) * 100) : 0

    // 3. Tính toán các chỉ số thời gian vật lý & SPI
    const startDate = new Date(sprint.startDate)
    const endDate = new Date(sprint.endDate)
    const now = new Date()

    const totalSprintDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))
    const daysElapsed = Math.max(0, Math.min(totalSprintDays, Math.round((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))))
    const daysRemaining = Math.max(0, totalSprintDays - daysElapsed)

    // SPI = (Actual Progress SP / Planned Progress SP)
    const plannedProgressRatio = daysElapsed / totalSprintDays
    const actualProgressRatio = totalStoryPoints > 0 ? completedStoryPoints / totalStoryPoints : 0

    let spi = 1.0
    if (plannedProgressRatio > 0) {
      spi = Math.round((actualProgressRatio / plannedProgressRatio) * 100) / 100
    }

    // 4. Lọc các tasks nguy cơ cao trên đường găng (chưa hoàn thành)
    const criticalTaskMap = new Map(sprint.tasks.map((t) => [t.id, t]))
    const criticalTasksPending = network.tasks
      .filter((t) => t.isCritical)
      .map((t) => {
        const fullTask = criticalTaskMap.get(t.id)
        const isDone = fullTask ? doneColIds.has(fullTask.boardColumnId) : false
        return {
          id: t.id,
          title: t.title,
          duration: t.duration,
          float: t.float,
          isDone,
          assignees: fullTask?.assignees?.map((a) => (a as any).user?.displayName || (a as any).user?.email?.split('@')[0] || 'Chưa gán').join(', ') || 'Chưa gán'
        }
      })
      .filter((t) => !t.isDone)

    // 5. Chuẩn bị Prompt cho AI PM Expert
    const isCriticalPathOverrun = network.criticalPathLength > totalSprintDays

    const promptData = {
      sprintName: sprint.name,
      projectName: sprint.project?.name,
      totalSprintDays,
      daysElapsed,
      daysRemaining,
      totalStoryPoints,
      completedStoryPoints,
      completionRate: `${completionRate}%`,
      spi,
      criticalPathLength: network.criticalPathLength,
      isCriticalPathOverrun,
      totalCriticalTasksPending: criticalTasksPending.length,
      criticalTasksPending: criticalTasksPending.slice(0, 8)
    }

    const systemPrompt = `
Bạn là Trưởng ban Cố vấn Quản lý Dự án & Chuyên gia CPM (Critical Path Method) cấp cao trong nền tảng Sprintos.
Nhiệm vụ của bạn là nhận dữ liệu đo lường kỹ thuật chính xác từ Sprint (tiến độ, đường găng CPM, chỉ số SPI) và đưa ra chẩn đoán rủi ro cùng các giải pháp giảm thiểu (Mitigation Strategies) chuẩn Agile/PMP.

CÁC TIÊU CHÍ ĐÁNH GIÁ:
- SPI >= 1.0 và CPM <= Tổng thời lượng: LOW risk.
- SPI 0.85 - 0.99 hoặc CPM ngấp nghé tổng thời lượng: MEDIUM risk.
- SPI 0.70 - 0.84 hoặc CPM vượt tổng thời lượng 1-2 ngày: HIGH risk.
- SPI < 0.70 hoặc CPM vượt tổng thời lượng >= 3 ngày: CRITICAL risk.

CÁC CHIẾN LƯỢC HÀNH ĐỘNG CẦN GỢI Ý:
1. "CRASHING": Bổ sung hoặc tái phân bổ nhân lực tập trung dứt điểm các task trên đường găng đang bị tồn đọng.
2. "FAST_TRACKING": Thực hiện song song các task phụ thuộc (chuyển Finish-to-Start thành Start-to-Start) nếu điều kiện kỹ thuật cho phép.
3. "SCOPE_ADJUSTMENT": Đề xuất chuyển các task thứ yếu (không nằm trên đường găng) sang Sprint tiếp theo để bảo toàn Sprint Goal.

BẮT BUỘC TRẢ VỀ ĐỊNH DẠNG JSON TUÂN THỦ SCHEMA SAU:
{
  "overallRisk": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "riskScore": number (từ 0 đến 100, 100 là rủi ro cực đại),
  "executiveSummary": "Tóm tắt ngắn gọn 2-3 câu về tình trạng và nguy cơ trễ hạn",
  "criticalBottlenecks": [
    {
      "taskId": "id task",
      "taskTitle": "tiêu đề task",
      "assigneeName": "người phụ trách",
      "impactDays": 2,
      "reason": "Nguyên nhân vì sao task này gây tắc nghẽn đường găng"
    }
  ],
  "mitigationStrategies": [
    {
      "type": "CRASHING" | "FAST_TRACKING" | "SCOPE_ADJUSTMENT",
      "title": "Tiêu đề giải pháp ngắn gọn",
      "description": "Giải thích chi tiết giải pháp",
      "suggestedAction": "Hành động cụ thể PM/Scrum Master cần làm ngay"
    }
  ]
}`

    const userPrompt = `Dữ liệu đo lường kỹ thuật của Sprint:\n${JSON.stringify(promptData, null, 2)}`

    try {
      const aiResult = await this.openRouterService.generateJson<any>(userPrompt, systemPrompt)

      return {
        overallRisk: aiResult.overallRisk || (isCriticalPathOverrun ? 'HIGH' : spi >= 1 ? 'LOW' : 'MEDIUM'),
        riskScore: typeof aiResult.riskScore === 'number' ? aiResult.riskScore : (isCriticalPathOverrun ? 75 : 40),
        spi,
        criticalPathLength: network.criticalPathLength,
        totalSprintDays,
        executiveSummary: aiResult.executiveSummary || `Sprint đang đạt chỉ số SPI = ${spi}. Độ dài đường găng là ${network.criticalPathLength} ngày so với thời lượng ${totalSprintDays} ngày.`,
        criticalBottlenecks: Array.isArray(aiResult.criticalBottlenecks) ? aiResult.criticalBottlenecks : [],
        mitigationStrategies: Array.isArray(aiResult.mitigationStrategies) ? aiResult.mitigationStrategies : []
      }
    } catch (err: any) {
      this.logger.error('Lỗi khi phân tích rủi ro tiến độ:', err)
      const riskLevel = isCriticalPathOverrun ? 'HIGH' : (spi < 0.85 ? 'HIGH' : spi >= 1 ? 'LOW' : 'MEDIUM')
      return {
        overallRisk: riskLevel,
        riskScore: isCriticalPathOverrun ? 80 : (spi < 0.85 ? 65 : 25),
        spi,
        criticalPathLength: network.criticalPathLength,
        totalSprintDays,
        executiveSummary: `Dự án có chỉ số hiệu suất SPI = ${spi}. ${isCriticalPathOverrun ? 'Độ dài đường găng CPM đã vượt quá tổng thời lượng Sprint.' : 'Đường găng CPM vẫn nằm trong giới hạn cho phép.'}`,
        criticalBottlenecks: criticalTasksPending.slice(0, 3).map((t) => ({
          taskId: t.id,
          taskTitle: t.title,
          assigneeName: t.assignees,
          impactDays: t.duration,
          reason: 'Task nằm trên đường găng (float = 0) và chưa hoàn thành'
        })),
        mitigationStrategies: [
          {
            type: 'CRASHING',
            title: 'Tăng cường nguồn lực cho Task găng',
            description: 'Phân bổ thêm nhân sự có chuyên môn để hỗ trợ hoàn thành các task trên đường găng.',
            suggestedAction: 'Họp ngắn với người phụ trách các task găng để tháo gỡ vướng mắc kỹ thuật.'
          }
        ]
      }
    }
  }
}
