import { Injectable } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { ReportService } from '~/routes/report/report.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

@Injectable()
export class ScheduleRiskTool implements IAgentTool {
  readonly name = 'diagnoseScheduleRisk'
  readonly description =
    'Chẩn đoán rủi ro tiến độ Sprint bằng cách kết hợp thuật toán đường găng CPM và chỉ số SPI (Schedule Performance Index = EV/PV). ' +
    'Phát hiện các task trên đường găng (float = 0) đang quá hạn, tính toán nguy cơ trễ hạn toàn bộ Sprint và đưa ra cảnh báo sớm cho PM/Scrum Master.'
  readonly category: ToolCategory = 'CPM'
  readonly riskLevel: ToolRiskLevel = 'READ'
  readonly level: ToolActionLevel = 'READ'
  readonly parameters = {
    type: 'object',
    properties: {
      sprintId: {
        type: 'string',
        description: 'ID của Sprint cần chẩn đoán rủi ro tiến độ (nếu bỏ trống, dùng Sprint đang Active)'
      }
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly reportService: ReportService
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

  async execute(args: { sprintId?: string }, context: AgentContext): Promise<ToolExecutionResult> {
    const targetSprintId = args.sprintId || context.activeSprintId
    if (!targetSprintId) {
      return {
        output: 'Không tìm thấy sprintId để chẩn đoán rủi ro tiến độ.',
        status: 'ERROR',
        summary: 'Thiếu ID Sprint'
      }
    }

    try {
      // 1. Lấy thông tin Sprint đầy đủ
      const sprint = await this.prisma.sprint.findUnique({
        where: { id: targetSprintId },
        include: {
          tasks: {
            where: { deletedAt: null },
            include: {
              assignees: {
                include: {
                  user: { select: { displayName: true, email: true } }
                }
              }
            }
          },
          boardColumns: true
        }
      })

      if (!sprint) {
        return {
          output: 'Không tìm thấy Sprint tương ứng.',
          status: 'ERROR',
          summary: 'Sprint không tồn tại'
        }
      }

      // 2. Tính toán tiến độ Story Points (SPI)
      const doneColIds = new Set(sprint.boardColumns.filter((c) => c.isDone).map((c) => c.id))
      let totalSP = 0
      let completedSP = 0

      for (const t of sprint.tasks) {
        totalSP += t.storyPoint || 0
        if (doneColIds.has(t.boardColumnId)) {
          completedSP += t.storyPoint || 0
        }
      }

      // 3. Tính thời gian và SPI
      const now = new Date()
      const startDate = new Date(sprint.startDate)
      const endDate = new Date(sprint.endDate)
      const totalSprintDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))
      const daysElapsed = Math.max(0, Math.min(totalSprintDays, Math.round((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))))
      const daysRemaining = Math.max(0, totalSprintDays - daysElapsed)

      // EV: Earned Value (% hoàn thành * tổng SP), PV: Planned Value (% thời gian đã trôi * tổng SP)
      const ev = totalSP > 0 ? completedSP / totalSP : 0
      const pv = totalSprintDays > 0 ? daysElapsed / totalSprintDays : 0
      const spi = pv > 0 ? Math.round((ev / pv) * 100) / 100 : 1.0

      // 4. Phân tích đường găng CPM
      const network = await this.reportService.getSprintNetworkDiagram(targetSprintId)

      const taskDetailsMap = new Map(sprint.tasks.map((t) => [t.id, t]))

      const criticalTasksPending = network.tasks
        .filter((t) => t.isCritical)
        .map((t) => {
          const fullTask = taskDetailsMap.get(t.id)
          const isDone = fullTask ? doneColIds.has(fullTask.boardColumnId) : false
          const assigneeNames =
            fullTask?.assignees?.map((a) => (a as any).user?.displayName || (a as any).user?.email?.split('@')[0] || 'Chưa gán').join(', ') ||
            'Chưa gán'
          return {
            id: t.id,
            title: t.title,
            duration: t.duration,
            float: t.float,
            isDone,
            assignees: assigneeNames
          }
        })
        .filter((t) => !t.isDone)

      // 5. Đánh giá mức rủi ro tổng thể
      const isCPMOverrun = network.criticalPathLength > totalSprintDays
      let overallRisk: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
      if (spi < 0.7 || (isCPMOverrun && network.criticalPathLength - totalSprintDays >= 3)) {
        overallRisk = 'CRITICAL'
      } else if (spi < 0.85 || (isCPMOverrun && network.criticalPathLength - totalSprintDays >= 1)) {
        overallRisk = 'HIGH'
      } else if (spi < 1.0 || isCPMOverrun) {
        overallRisk = 'MEDIUM'
      } else {
        overallRisk = 'LOW'
      }

      const output = JSON.stringify({
        sprintName: sprint.name,
        riskLevel: overallRisk,
        spi,
        ev: `${Math.round(ev * 100)}%`,
        pv: `${Math.round(pv * 100)}%`,
        totalSprintDays,
        daysElapsed,
        daysRemaining,
        criticalPathLength: network.criticalPathLength,
        isCriticalPathOverrun: isCPMOverrun,
        criticalPathOverrunDays: isCPMOverrun ? network.criticalPathLength - totalSprintDays : 0,
        totalStoryPoints: totalSP,
        completedStoryPoints: completedSP,
        criticalTasksPendingCount: criticalTasksPending.length,
        criticalTasksPending: criticalTasksPending.slice(0, 8)
      })

      return {
        output,
        status: 'SUCCESS',
        summary: `Rủi ro tiến độ: ${overallRisk} | SPI=${spi} | CPM=${network.criticalPathLength} ngày/${totalSprintDays} ngày | ${criticalTasksPending.length} task găng đang tồn đọng`
      }
    } catch (err: any) {
      return {
        output: `Lỗi khi chẩn đoán rủi ro tiến độ: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Lỗi phân tích rủi ro CPM'
      }
    }
  }
}
