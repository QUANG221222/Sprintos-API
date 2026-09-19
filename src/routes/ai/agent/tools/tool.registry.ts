import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { AgentContext } from '../agent.types'
import { IAgentTool, ToolExecutionResult } from './tool.interface'
import { SprintSummaryTool } from './sprint/sprint-summary.tool'
import { CpmReportTool } from './cpm/cpm-report.tool'
import { RagKnowledgeTool } from './knowledge/rag-knowledge.tool'

@Injectable()
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name)
  private readonly tools = new Map<string, IAgentTool>()

  constructor(
    private readonly sprintSummaryTool: SprintSummaryTool,
    private readonly cpmReportTool: CpmReportTool,
    private readonly ragKnowledgeTool: RagKnowledgeTool
  ) {
    this.registerTool(this.sprintSummaryTool)
    this.registerTool(this.cpmReportTool)
    this.registerTool(this.ragKnowledgeTool)
  }

  registerTool(tool: IAgentTool): void {
    this.tools.set(tool.name, tool)
    this.logger.log(`🔧 Đã đăng ký tool: [${tool.level}] ${tool.name}`)
  }

  getTool(name: string): IAgentTool | undefined {
    return this.tools.get(name)
  }

  getAllTools(): IAgentTool[] {
    return Array.from(this.tools.values())
  }

  getOpenAiTools(): OpenAI.Chat.ChatCompletionTool[] {
    return this.getAllTools().map((t) => t.toOpenAiTool())
  }

  async executeTool(name: string, args: any, context: AgentContext): Promise<ToolExecutionResult> {
    const tool = this.getTool(name)
    if (!tool) {
      this.logger.warn(`Không tìm thấy công cụ: ${name}`)
      return {
        output: `Công cụ "${name}" không được hỗ trợ hoặc chưa đăng ký trong hệ thống.`,
        status: 'ERROR',
        summary: `Công cụ không xác định: ${name}`
      }
    }

    this.logger.log(`⚙️ Kích hoạt tool: ${name} với tham số:`, args)
    return tool.execute(args, context)
  }
}
