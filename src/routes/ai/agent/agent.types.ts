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

export interface ActionProposal {
  id: string
  type:
    | 'CREATE_TASK'
    | 'UPDATE_TASK'
    | 'CREATE_SPRINT'
    | 'ASSIGN_TASK'
    | 'MOVE_TASK'
    | 'DELETE_TASK'
    | 'DELETE_SPRINT'
    | string
  summary: string
  payload: any
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  createdAt?: string
}

export interface AgentChatResponse {
  reply: string
  thinking?: string
  toolsUsed: ToolExecutionDetail[]
  actionProposal?: ActionProposal | null
  actionProposals?: ActionProposal[]
}

export type UserProjectRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'
export type ScreenContext =
  | 'KANBAN'
  | 'ROADMAP'
  | 'BACKLOG'
  | 'CHAT'
  | 'OVERVIEW'
  | 'SETTINGS'
  | 'ALL'
  | string

export interface AgentContext {
  targetProjectId: string
  activeSprintId?: string
  userId?: string
  userRole?: UserProjectRole
  currentScreen?: ScreenContext
  dryRun?: boolean
  webSearchMode?: 'auto' | 'always' | 'disabled'
  hasImages?: boolean
}

export type AgentStreamEvent =
  | { type: 'status'; data: { stage: string; message: string } }
  | { type: 'thinking'; data: { chunk: string } }
  | { type: 'proposal'; data: ActionProposal }
  | { type: 'tool_start'; data: { name: string; args: any } }
  | { type: 'tool_end'; data: ToolExecutionDetail }
  | { type: 'text'; data: { chunk: string } }
  | { type: 'done'; data: AgentChatResponse }
  | { type: 'error'; data: { message: string } }

