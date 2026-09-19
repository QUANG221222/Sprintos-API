import OpenAI from 'openai'
import { AgentContext } from '../agent.types'

export type ToolActionLevel = 'READ' | 'SUGGEST' | 'WRITE' | 'DANGEROUS'

export interface ToolExecutionResult {
  output: string
  status: 'SUCCESS' | 'ERROR'
  summary: string
}

export interface IAgentTool {
  readonly name: string
  readonly description: string
  readonly level: ToolActionLevel
  readonly parameters: Record<string, any>

  toOpenAiTool(): OpenAI.Chat.ChatCompletionTool
  execute(args: any, context: AgentContext): Promise<ToolExecutionResult>
}
