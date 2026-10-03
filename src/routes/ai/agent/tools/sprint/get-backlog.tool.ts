import { Injectable } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

@Injectable()
export class GetBacklogTool implements IAgentTool {
  readonly name = 'getBacklog'
  readonly description =
    'Truy vấn trực tiếp từ cơ sở dữ liệu danh sách các công việc trong Backlog (các Sprint ở trạng thái PLANNED hoặc các task chưa hoàn thành trong dự án): tiêu đề, story points, thời lượng ngày, độ ưu tiên, người phụ trách.'
  readonly category: ToolCategory = 'SPRINT'
  readonly riskLevel: ToolRiskLevel = 'READ'
  readonly level: ToolActionLevel = 'READ'
  readonly parameters = {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Số lượng task tối đa muốn lấy (mặc định: 30)' }
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

  async execute(args: { limit?: number }, context: AgentContext): Promise<ToolExecutionResult> {
    const targetProjectId = context.targetProjectId
    if (!targetProjectId) {
      return {
        output: 'Không xác định được projectId trong ngữ cảnh hiện tại để truy vấn Backlog.',
        status: 'ERROR',
        summary: 'Thiếu ID Dự án'
      }
    }

    const limit = Math.min(Math.max(args.limit || 30, 1), 100)

    try {
      // 1. Tìm các Sprint PLANNED (Backlog Sprints) của dự án
      const plannedSprints = await this.prisma.sprint.findMany({
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
              assignees: {
                include: {
                  user: { select: { id: true, displayName: true, email: true } }
                }
              },
              labels: true
            },
            take: limit
          }
        },
        orderBy: { createdAt: 'asc' }
      })

      const allPlannedTasks: any[] = []
      for (const sp of plannedSprints) {
        for (const t of sp.tasks) {
          allPlannedTasks.push({
            id: t.id,
            title: t.title,
            description: t.description || undefined,
            sprintName: sp.name,
            sprintId: sp.id,
            column: t.boardColumn?.title || 'Backlog',
            storyPoint: t.storyPoint,
            duration: t.duration || 1,
            priority: t.priority,
            labels: t.labels?.map((l) => l.label) || [],
            assignees: t.assignees?.map((a) => a.user?.displayName || a.user?.email).filter(Boolean) || []
          })
        }
      }

      // 2. Nếu không có task nào trong PLANNED sprints, tìm các task chưa hoàn thành trong Sprint hiện tại (To Do / WIP)
      let activeUnfinishedTasks: any[] = []
      if (allPlannedTasks.length === 0 && context.activeSprintId) {
        const activeTasks = await this.prisma.task.findMany({
          where: {
            sprintId: context.activeSprintId,
            deletedAt: null,
            boardColumn: { isDone: false }
          },
          include: {
            boardColumn: true,
            assignees: {
              include: { user: { select: { id: true, displayName: true, email: true } } }
            },
            labels: true
          },
          take: limit
        })

        activeUnfinishedTasks = activeTasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description || undefined,
          column: t.boardColumn?.title || 'To Do',
          storyPoint: t.storyPoint,
          duration: t.duration || 1,
          priority: t.priority,
          labels: t.labels?.map((l) => l.label) || [],
          assignees: t.assignees?.map((a) => a.user?.displayName || a.user?.email).filter(Boolean) || []
        }))
      }

      const tasksToReturn = allPlannedTasks.length > 0 ? allPlannedTasks : activeUnfinishedTasks
      const totalStoryPoints = tasksToReturn.reduce((sum, t) => sum + (t.storyPoint || 0), 0)

      const outputData = {
        totalTasks: tasksToReturn.length,
        totalStoryPoints,
        source: allPlannedTasks.length > 0 ? 'PLANNED_SPRINTS' : 'ACTIVE_SPRINT_UNFINISHED',
        tasks: tasksToReturn
      }

      return {
        output: JSON.stringify(outputData, null, 2),
        status: 'SUCCESS',
        summary: `Tìm thấy ${tasksToReturn.length} tasks trong Backlog (Tổng ${totalStoryPoints} Story Points)`
      }
    } catch (err: any) {
      return {
        output: `Lỗi khi truy vấn Backlog từ cơ sở dữ liệu: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Truy vấn Backlog thất bại'
      }
    }
  }
}
