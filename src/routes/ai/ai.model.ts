import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'

export const TaskPriorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
export const TaskTypeEnum = z.enum(['STORY', 'TASK', 'BUG', 'TECH_DEBT', 'EPIC'])

// Schema từng Subtask gợi ý
export const SuggestedSubtaskSchema = z.object({
  title: z.string().min(1),
  priority: TaskPriorityEnum.default('MEDIUM'),
  storyPoint: z.number().int().min(0).default(1)
})

// Schema từng Task draft khi parse Excel
export const TaskImportDraftSchema = z.object({
  tempId: z.string(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  type: TaskTypeEnum.default('TASK'),
  priority: TaskPriorityEnum.default('MEDIUM'),
  storyPoint: z.number().int().min(0).default(1),
  duration: z.number().int().min(0).default(1),
  subtasks: z.array(SuggestedSubtaskSchema).default([])
})

// Output của parse Excel
export const ParseExcelResSchema = z.object({
  tasks: z.array(TaskImportDraftSchema),
  totalParsed: z.number().int()
})

// Input của commit Excel
export const CommitExcelImportBodySchema = z.object({
  projectId: z.string().min(1),
  sprintId: z.string().min(1),
  boardColumnId: z.string().optional(),
  tasks: z.array(TaskImportDraftSchema).min(1, 'Phải có ít nhất 1 task để import')
})

// Output của commit Excel
export const CommitExcelImportResSchema = z.object({
  createdCount: z.number().int(),
  message: z.string()
})

// Input của Task Enrichment (AI Enhance)
export const EnrichTaskBodySchema = z.object({
  title: z.string().min(1, 'Tiêu đề không được để trống'),
  description: z.string().optional()
})

// Output của Task Enrichment
export const EnrichTaskResSchema = z.object({
  userStory: z.string(),
  acceptanceCriteria: z.array(z.string()),
  suggestedStoryPoint: z.number().int().min(0),
  suggestedDuration: z.number().int().min(0),
  suggestedSubtasks: z.array(SuggestedSubtaskSchema)
})

// Sức khỏe AI
export const AiHealthResSchema = z.object({
  ok: z.boolean(),
  model: z.string(),
  message: z.string()
})

// Input cho RAG Semantic Search
export const RagSearchBodySchema = z.object({
  projectId: z.string().min(1, 'projectId là bắt buộc'),
  query: z.string().min(1, 'Nội dung tìm kiếm không được để trống'),
  limit: z.number().int().min(1).max(20).optional().default(5)
})

// Input cho AI Agent Copilot
export const AgentChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  images: z.array(z.string()).optional()
})

export const AgentChatBodySchema = z.object({
  messages: z.array(AgentChatMessageSchema).min(1, 'Cần ít nhất 1 tin nhắn'),
  projectId: z.string().min(1, 'projectId là bắt buộc'),
  sprintId: z.string().optional(),
  webSearchMode: z.enum(['auto', 'always', 'disabled']).optional().default('auto'),
  currentScreen: z.enum(['KANBAN', 'ROADMAP', 'BACKLOG', 'CHAT', 'ALL']).optional().default('ALL'),
  dryRun: z.boolean().optional().default(false)
})

export const AgentUndoBodySchema = z.object({
  undoId: z.string().min(1, 'undoId là bắt buộc')
})

// Input cho AI Schedule Diagnosis
export const ScheduleDiagnosisBodySchema = z.object({
  sprintId: z.string().min(1, 'sprintId là bắt buộc')
})

export const SyncProjectEmbeddingsBodySchema = z.object({
  projectId: z.string().min(1, 'projectId là bắt buộc')
})

export const ActionProposalTypeEnum = z.enum([
  'CREATE_TASK',
  'UPDATE_TASK',
  'CREATE_SPRINT',
  'ASSIGN_TASK',
  'MOVE_TASK',
  'DELETE_TASK',
  'DELETE_SPRINT'
])

export const ActionProposalStatusEnum = z.enum(['PENDING', 'APPROVED', 'REJECTED'])

export const ActionProposalSchema = z.object({
  id: z.string(),
  type: ActionProposalTypeEnum,
  summary: z.string(),
  payload: z.record(z.string(), z.any()),
  status: ActionProposalStatusEnum.default('PENDING'),
  createdAt: z.string().optional()
})

export type ActionProposal = z.infer<typeof ActionProposalSchema>

// Input & Output cho Execute Proposal
export const ExecuteProposalBodySchema = z.object({
  proposalId: z.string().min(1, 'proposalId là bắt buộc'),
  type: ActionProposalTypeEnum,
  payload: z.record(z.string(), z.any()),
  projectId: z.string().min(1, 'projectId là bắt buộc'),
  sprintId: z.string().optional()
})


export const ExecuteProposalResSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  result: z.any().optional()
})

// DTOs cho Controller
export class ParseExcelResDTO extends createZodDto(ParseExcelResSchema) {}
export class CommitExcelImportBodyDTO extends createZodDto(CommitExcelImportBodySchema) {}
export class CommitExcelImportResDTO extends createZodDto(CommitExcelImportResSchema) {}
export class EnrichTaskBodyDTO extends createZodDto(EnrichTaskBodySchema) {}
export class EnrichTaskResDTO extends createZodDto(EnrichTaskResSchema) {}
export class AiHealthResDTO extends createZodDto(AiHealthResSchema) {}
export class RagSearchBodyDTO extends createZodDto(RagSearchBodySchema) {}
export class AgentChatBodyDTO extends createZodDto(AgentChatBodySchema) {}
export class AgentUndoBodyDTO extends createZodDto(AgentUndoBodySchema) {}
export class ExecuteProposalBodyDTO extends createZodDto(ExecuteProposalBodySchema) {}
export class ExecuteProposalResDTO extends createZodDto(ExecuteProposalResSchema) {}
export class ScheduleDiagnosisBodyDTO extends createZodDto(ScheduleDiagnosisBodySchema) {}
export class SyncProjectEmbeddingsBodyDTO extends createZodDto(SyncProjectEmbeddingsBodySchema) {}


