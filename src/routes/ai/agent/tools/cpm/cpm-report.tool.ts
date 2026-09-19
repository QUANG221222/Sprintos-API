import { Injectable } from '@nestjs/common'
import OpenAI from 'openai'
import { ReportService } from '~/routes/report/report.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

@Injectable()
export class CpmReportTool implements IAgentTool {
  readonly name = 'getCriticalPathReport'
  readonly description =
    'Lấy báo cáo Đường găng CPM (Critical Path Method) của Sprint: độ dài đường găng, các task găng có float = 0 có nguy cơ làm trễ dự án, và các quan hệ phụ thuộc.'
  readonly level: ToolActionLevel = 'READ'
  readonly parameters = {
    type: 'object',
    properties: {
      sprintId: { type: 'string', description: 'ID của Sprint cần tra cứu đường găng' }
    },
    required: ['sprintId']
  }

  constructor(private readonly reportService: ReportService) {}

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
        output: 'Không tìm thấy sprintId để phân tích đường găng.',
        status: 'ERROR',
        summary: 'Thiếu ID Sprint'
      }
    }

    try {
      const network = await this.reportService.getSprintNetworkDiagram(targetSprintId)
      const criticalTasks = network.tasks
        .filter((t) => t.isCritical)
        .map((t) => ({
          id: t.id,
          title: t.title,
          duration: t.duration,
          float: t.float,
          storyPoint: t.storyPoint
        }))

      const output = JSON.stringify({
        criticalPathLengthDays: network.criticalPathLength,
        totalCriticalTasks: criticalTasks.length,
        criticalTasks
      })

      return {
        output,
        status: 'SUCCESS',
        summary: `Đã phân tích Đường găng CPM (${network.criticalPathLength} ngày, ${criticalTasks.length} tasks găng)`
      }
    } catch (e: any) {
      return {
        output: `Lỗi khi phân tích đường găng: ${e?.message || e}`,
        status: 'ERROR',
        summary: 'Lỗi thuật toán CPM'
      }
    }
  }
}
