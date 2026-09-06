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

// DTOs cho Controller
export class ParseExcelResDTO extends createZodDto(ParseExcelResSchema) {}
export class CommitExcelImportBodyDTO extends createZodDto(CommitExcelImportBodySchema) {}
export class CommitExcelImportResDTO extends createZodDto(CommitExcelImportResSchema) {}
export class EnrichTaskBodyDTO extends createZodDto(EnrichTaskBodySchema) {}
export class EnrichTaskResDTO extends createZodDto(EnrichTaskResSchema) {}
export class AiHealthResDTO extends createZodDto(AiHealthResSchema) {}
