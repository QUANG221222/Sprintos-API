import { ActionProposal, AgentChatMessage, AgentContext, AgentStreamEvent, ToolExecutionDetail } from '../agent.types'

export type HarnessStatus =
  | 'RUNNING'
  | 'COMPLETED'
  | 'MAX_ITERATIONS_REACHED'
  | 'TIMED_OUT'
  | 'ABORTED'
  | 'FAILED'

export interface HarnessOptions {
  maxIterations?: number
  timeoutMs?: number
  signal?: AbortSignal
}

export interface HarnessState {
  iteration: number
  maxIterations: number
  startTime: number
  timeoutMs: number
  status: HarnessStatus
  toolsUsed: ToolExecutionDetail[]
  accumulatedThinking: string
  finalReply: string
  actionProposal?: ActionProposal | null
  actionProposals?: ActionProposal[]
}

export interface HarnessResult {
  reply: string
  thinking?: string
  toolsUsed: ToolExecutionDetail[]
  iterationsCount: number
  durationMs: number
  status: HarnessStatus
  actionProposal?: ActionProposal | null
  actionProposals?: ActionProposal[]
}

export type HarnessStreamCallback = (event: AgentStreamEvent) => void

