import OpenAI from 'openai'
import { ActionProposal, AgentContext } from '../agent.types'

export type ToolCategory = 'CPM' | 'SPRINT' | 'TASK' | 'KANBAN' | 'RAG' | 'COLLAB' | 'WEB'
export type ToolRiskLevel = 'READ' | 'SUGGEST' | 'WRITE' | 'DANGEROUS'
export type ToolActionLevel = ToolRiskLevel

declare global {
  type ToolCategory = 'CPM' | 'SPRINT' | 'TASK' | 'KANBAN' | 'RAG' | 'COLLAB' | 'WEB'
  type ToolRiskLevel = 'READ' | 'SUGGEST' | 'WRITE' | 'DANGEROUS'
}

export interface ToolUndoActionPayload {
  action: 'MOVE_TASK' | 'UPDATE_TASK' | 'REORDER_TASKS' | 'ASSIGN_TASK'
  taskId?: string
  taskTitle?: string
  previousState: any
  newState?: any
  summary: string
}

export interface ToolExecutionResult {
  output: string
  status: 'SUCCESS' | 'ERROR'
  summary: string
  diff?: any
  undoId?: string
  undoable?: boolean
  undoAction?: ToolUndoActionPayload
  actionProposal?: ActionProposal
}


export interface IAgentTool {
  readonly name: string
  readonly description: string
  readonly category?: ToolCategory
  readonly riskLevel?: ToolRiskLevel
  readonly level: ToolActionLevel
  readonly parameters: Record<string, any>
  readonly schema?: any

  toOpenAiTool(): OpenAI.Chat.ChatCompletionTool
  execute(args: any, context: AgentContext): Promise<ToolExecutionResult>
}

export type AgentTool = IAgentTool
