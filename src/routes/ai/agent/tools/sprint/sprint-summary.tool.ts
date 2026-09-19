import { Injectable } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

@Injectable()
export class SprintSummaryTool implements IAgentTool {
  readonly name = 'getSprintSummary'
  readonly description =
    'Lấy thông tin tổng quan tiến độ của Sprint: số lượng task hoàn thành, tổng Story Points, tỷ lệ % hoàn thành và phân bổ theo các cột Kanban.'
  readonly level: ToolActionLevel = 'READ'
  readonly parameters = {
    type: 'object',
    properties: {
      sprintId: { type: 'string', description: 'ID của Sprint cần xem tiến độ' }
    },
    required: ['sprintId']
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

  async execute(args: { sprintId?: string }, context: AgentContext): Promise<ToolExecutionResult> {
    const targetSprintId = args.sprintId || context.activeSprintId
    if (!targetSprintId) {
      return {
        output: 'Không tìm thấy sprintId để tra cứu tiến độ.',
        status: 'ERROR',
        summary: 'Thiếu ID Sprint'
      }
    }

    try {
      const sprint = await this.prisma.sprint.findUnique({
        where: { id: targetSprintId },
        include: {
          tasks: { where: { deletedAt: null } },
          boardColumns: true
        }
      })

      if (!sprint) {
        return {
          output: 'Không tìm thấy thông tin Sprint tương ứng.',
          status: 'ERROR',
          summary: 'Không tìm thấy Sprint'
        }
      }

      const totalTasks = sprint.tasks.length
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

      const completionRate =
        totalStoryPoints > 0 ? Math.round((completedStoryPoints / totalStoryPoints) * 100) : 0

      const output = JSON.stringify({
        sprintName: sprint.name,
        totalTasks,
        completedTasks,
        completionRate: `${completionRate}%`,
        totalStoryPoints,
        completedStoryPoints,
        columns: sprint.boardColumns.map((c) => ({
          name: c.title,
          taskCount: sprint.tasks.filter((t) => t.boardColumnId === c.id).length
        }))
      })

      return {
        output,
        status: 'SUCCESS',
        summary: `Đã tra cứu tiến độ Sprint "${sprint.name}" (${completionRate}%)`
      }
    } catch (e: any) {
      return {
        output: `Lỗi khi lấy tiến độ Sprint: ${e?.message || e}`,
        status: 'ERROR',
        summary: 'Lỗi truy vấn Sprint'
      }
    }
  }
}
