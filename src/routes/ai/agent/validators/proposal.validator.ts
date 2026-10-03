import { BadRequestException } from '@nestjs/common'
import { z } from 'zod'

export const CreateTaskProposalPayloadSchema = z.object({
  title: z.string().min(3, 'Tiêu đề task phải có ít nhất 3 ký tự'),
  description: z.string().nullable().optional(),
  storyPoint: z.number().int().min(0).default(1),
  duration: z.number().int().min(1, 'Thời gian thi công (duration) cho CPM tối thiểu là 1 ngày').default(1),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  role: z.enum(['FRONTEND', 'BACKEND', 'DEVOPS', 'QA', 'FULLSTACK']).optional(),
  sprintId: z.string().optional(),
  boardColumnId: z.string().optional(),
  columnTitle: z.string().optional()
})

export const UpdateTaskProposalPayloadSchema = z.object({
  taskId: z.string().min(1, 'taskId là bắt buộc'),
  title: z.string().min(3).optional(),
  description: z.string().nullable().optional(),
  storyPoint: z.number().int().min(0).optional(),
  duration: z.number().int().min(1).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  targetColumnName: z.string().optional(),
  targetColumnId: z.string().optional()
})

export const CreateSprintProposalPayloadSchema = z.object({
  name: z.string().min(1, 'Tên Sprint không được để trống'),
  goal: z.string().nullable().optional(),
  startDate: z.string().min(1, 'startDate là bắt buộc'),
  endDate: z.string().min(1, 'endDate là bắt buộc'),
  maxStoryPoint: z.number().int().min(1).default(40),
  copyColumnsFromSprintId: z.string().optional(),
  projectId: z.string().optional()
})

export const AssignTaskProposalPayloadSchema = z.object({
  taskId: z.string().min(1, 'taskId là bắt buộc'),
  taskTitle: z.string().optional(),
  targetUserId: z.string().optional(),
  targetUserName: z.string().optional(),
  assigneeEmail: z.string().optional(),
  assigneeName: z.string().optional(),
  replaceExisting: z.boolean().default(false)
}).refine((data) => data.targetUserId || data.assigneeEmail || data.assigneeName, {
  message: 'Phải chỉ định ít nhất targetUserId, assigneeEmail hoặc assigneeName'
})

export const MoveTaskProposalPayloadSchema = z.object({
  taskId: z.string().min(1, 'taskId là bắt buộc'),
  taskTitle: z.string().optional(),
  targetColumnId: z.string().optional(),
  targetColumnName: z.string().optional(),
  position: z.enum(['TOP', 'BOTTOM']).default('BOTTOM')
}).refine((data) => data.targetColumnId || data.targetColumnName, {
  message: 'Phải cung cấp targetColumnId hoặc targetColumnName'
})

export const DeleteTaskProposalPayloadSchema = z.object({
  taskId: z.string().min(1, 'taskId là bắt buộc'),
  taskTitle: z.string().optional(),
  deleteSubtasks: z.boolean().default(true),
  confirm: z.boolean().default(true)
})

export const DeleteSprintProposalPayloadSchema = z.object({
  sprintId: z.string().min(1, 'sprintId là bắt buộc'),
  sprintName: z.string().optional(),
  moveToBacklog: z.boolean().default(true),
  confirm: z.boolean().default(true)
})

export class ProposalValidator {
  /**
   * Kiểm tra tính hợp lệ của ActionProposal payload trước khi thực thi
   */
  static validatePayload(type: string, payload: any): any {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Payload của đề xuất không hợp lệ (phải là object).')
    }

    try {
      switch (type) {
        case 'CREATE_TASK':
          return CreateTaskProposalPayloadSchema.parse(payload)

        case 'UPDATE_TASK':
          return UpdateTaskProposalPayloadSchema.parse(payload)

        case 'CREATE_SPRINT':
          return CreateSprintProposalPayloadSchema.parse(payload)

        case 'ASSIGN_TASK':
          return AssignTaskProposalPayloadSchema.parse(payload)

        case 'MOVE_TASK':
          return MoveTaskProposalPayloadSchema.parse(payload)

        case 'DELETE_TASK':
          return DeleteTaskProposalPayloadSchema.parse(payload)

        case 'DELETE_SPRINT':
          return DeleteSprintProposalPayloadSchema.parse(payload)

        default:
          return payload
      }
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        const issues = (err as any).issues || (err as any).errors || []
        const errorMessages = issues.length > 0
          ? issues.map((e: any) => `${e.path?.join('.') || 'root'}: ${e.message}`).join(', ')
          : err.message
        throw new BadRequestException(`Dữ liệu đề xuất ${type} không hợp lệ: ${errorMessages}`)
      }
      throw new BadRequestException(`Lỗi kiểm định đề xuất: ${err?.message || err}`)
    }

  }
}
