export interface AgentChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  images?: string[]
}

export interface ToolExecutionDetail {
  name: string
  args: any
  summary?: string
  status: 'SUCCESS' | 'ERROR' | 'RUNNING'
  outputSnippet?: string
  durationMs?: number
}

export interface AgentChatResponse {
  reply: string
  thinking?: string
  toolsUsed: ToolExecutionDetail[]
}

export interface AgentContext {
  targetProjectId: string
  activeSprintId?: string
}

export type AgentStreamEvent =
  | { type: 'status'; data: { stage: string; message: string } }
  | { type: 'thinking'; data: { chunk: string } }
  | { type: 'tool_start'; data: { name: string; args: any } }
  | { type: 'tool_end'; data: ToolExecutionDetail }
  | { type: 'text'; data: { chunk: string } }
  | { type: 'done'; data: AgentChatResponse }
  | { type: 'error'; data: { message: string } }
