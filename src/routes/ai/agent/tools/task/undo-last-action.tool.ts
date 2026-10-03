import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolCategory, ToolRiskLevel, ToolActionLevel, ToolExecutionResult } from '../tool.interface'
import { AgentTelemetryService } from '../../telemetry/agent-telemetry.service'

@Injectable()
export class UndoLastActionTool implements IAgentTool {
  private readonly logger = new Logger(UndoLastActionTool.name)

  readonly name = 'undoLastAction'
  readonly description =
    'Hoàn tác (Rollback / Undo) hành động vừa thực hiện trong vòng 10 phút gần nhất ' +
    '(ví dụ: phục hồi task vừa bị chuyển nhầm cột Kanban, hoặc hoàn tác việc cập nhật nhầm thông tin task).'
  readonly category: ToolCategory = 'TASK'
  readonly riskLevel: ToolRiskLevel = 'WRITE'
  readonly level: ToolActionLevel = 'WRITE'

  readonly parameters = {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'Mã dự án (nếu để trống sẽ tự lấy từ ngữ cảnh hiện tại)'
      },
      undoId: {
        type: 'string',
        description: 'Mã hoàn tác cụ thể (nếu có)'
      }
    }
  }

  constructor(private readonly telemetryService: AgentTelemetryService) {}

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
    args: { projectId?: string; undoId?: string },
    context: AgentContext
  ): Promise<ToolExecutionResult> {
    const targetProjectId = args.projectId || context.targetProjectId
    const userId = context.userId || 'system'

    if (!targetProjectId) {
      return {
        output: '❌ Không xác định được dự án để thực hiện hoàn tác.',
        status: 'ERROR',
        summary: 'Thiếu projectId cho hoàn tác'
      }
    }

    const result = await this.telemetryService.executeUndo(targetProjectId, userId, args.undoId)

    if (!result.success) {
      return {
        output: `⚠️ **Không thể hoàn tác:** ${result.message}`,
        status: 'ERROR',
        summary: result.message
      }
    }

    return {
      output: `### ⏪ Hoàn tác thành công\n\n${result.message}\n\n*Hành động đã được khôi phục về trạng thái trước đó.*`,
      status: 'SUCCESS',
      summary: result.message,
      diff: result.details
    }
  }
}
