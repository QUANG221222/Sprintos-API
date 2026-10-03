import { Injectable } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

@Injectable()
export class SuggestSprintTool implements IAgentTool {
  readonly name = 'suggestSprint'
  readonly description =
    'Đề xuất phạm vi (scope) và danh sách công việc cho Sprint tiếp theo dựa trên Velocity lịch sử của team và các task đang chờ trong Backlog.'
  readonly category: ToolCategory = 'SPRINT'
  readonly riskLevel: ToolRiskLevel = 'SUGGEST'
  readonly level: ToolActionLevel = 'SUGGEST'
  readonly parameters = {
    type: 'object',
    properties: {
      targetCapacity: {
        type: 'number',
        description: 'Dung lượng Story Point mong muốn cho Sprint mới (nếu bỏ trống, hệ thống tự động tính theo Velocity trung bình)'
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

  async execute(args: { targetCapacity?: number }, context: AgentContext): Promise<ToolExecutionResult> {
    const targetProjectId = context.targetProjectId
    if (!targetProjectId) {
      return {
        output: 'Không xác định được projectId để tính toán đề xuất Sprint.',
        status: 'ERROR',
        summary: 'Thiếu ID Dự án'
      }
    }

    try {
      // 1. Tính toán Velocity trung bình từ các Sprint COMPLETED
      const completedSprints = await this.prisma.sprint.findMany({
        where: {
          projectId: targetProjectId,
          status: 'COMPLETED',
          deletedAt: null
        },
        include: {
          tasks: {
            where: {
              deletedAt: null,
              boardColumn: { isDone: true }
            }
          }
        },
        orderBy: { endDate: 'desc' },
        take: 5
      })

      let avgVelocity = 20 // Giá trị mặc định nếu chưa có sprint nào hoàn thành
      if (completedSprints.length > 0) {
        const totalDonePoints = completedSprints.reduce((sum, sp) => {
          const spDone = sp.tasks.reduce((tSum, t) => tSum + (t.storyPoint || 0), 0)
          return sum + spDone
        }, 0)
        avgVelocity = Math.round(totalDonePoints / completedSprints.length) || 15
      }

      const capacityLimit = args.targetCapacity && args.targetCapacity > 0 ? args.targetCapacity : avgVelocity

      // 2. Lấy danh sách task từ Backlog (PLANNED Sprints)
      const candidateSprints = await this.prisma.sprint.findMany({
        where: {
          projectId: targetProjectId,
          status: 'PLANNED',
          deletedAt: null
        },
        include: {
          tasks: {
            where: { deletedAt: null },
            include: {
              boardColumn: true,
              assignees: { include: { user: { select: { displayName: true, email: true } } } },
              labels: true
            }
          }
        },
        orderBy: { createdAt: 'asc' }
      })

      const candidateTasks: any[] = []
      for (const sp of candidateSprints) {
        for (const t of sp.tasks) {
          candidateTasks.push({
            id: t.id,
            title: t.title,
            priority: t.priority || 'MEDIUM',
            storyPoint: t.storyPoint || 1,
            duration: t.duration || 1,
            labels: t.labels?.map((l) => l.label) || [],
            assignees: t.assignees?.map((a) => a.user?.displayName || a.user?.email).filter(Boolean) || []
          })
        }
      }

      // 3. Sắp xếp theo thứ tự ưu tiên: CRITICAL -> HIGH -> MEDIUM -> LOW
      const priorityOrder: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
      candidateTasks.sort((a, b) => (priorityOrder[b.priority] || 2) - (priorityOrder[a.priority] || 2))

      // 4. Lựa chọn các task vừa vặn với capacityLimit
      let accumulatedPoints = 0
      const recommendedTasks: any[] = []
      const remainingTasks: any[] = []

      for (const t of candidateTasks) {
        if (accumulatedPoints + t.storyPoint <= capacityLimit + 2) {
          accumulatedPoints += t.storyPoint
          recommendedTasks.push(t)
        } else {
          remainingTasks.push(t)
        }
      }

      const outputData = {
        historicalVelocityAvg: avgVelocity,
        targetCapacity: capacityLimit,
        totalSelectedPoints: accumulatedPoints,
        selectedTasksCount: recommendedTasks.length,
        recommendedTasks,
        backlogRemainingCount: remainingTasks.length,
        recommendationSummary: `Đề xuất chọn ${recommendedTasks.length} tasks với tổng ${accumulatedPoints} Story Points (phù hợp với Velocity trung bình ${capacityLimit} SP của team).`
      }

      return {
        output: JSON.stringify(outputData, null, 2),
        status: 'SUCCESS',
        summary: `Đề xuất ${recommendedTasks.length} tasks cho Sprint (${accumulatedPoints}/${capacityLimit} SP)`
      }
    } catch (err: any) {
      return {
        output: `Lỗi khi tính toán đề xuất Sprint: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Đề xuất Sprint thất bại'
      }
    }
  }
}
