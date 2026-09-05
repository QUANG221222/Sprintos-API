import z from 'zod'
import { GetUserProfileResSchema } from '~/shared/models/shared-user.model'

export const TaskPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])

export const DependencyTypeSchema = z.enum(['FS', 'SS', 'FF', 'SF'])

export const TaskTypeEnumSchema = z.enum(['STORY', 'TASK', 'BUG', 'TECH_DEBT', 'EPIC'])

export const TaskSchema = z
  .object({
    id: z.string(),
    sprintId: z.string(),
    boardColumnId: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    type: TaskTypeEnumSchema.default('TASK'),
    priority: TaskPrioritySchema.nullable(),
    storyPoint: z.number().int(),
    dueDate: z.date().nullable(),
    startDate: z.date().nullable(),
    duration: z.number().int().nullable(),
    parentId: z.string().nullable(),
    createdById: z.string().nullable(),
    updatedById: z.string().nullable(),
    deletedById: z.string().nullable(),
    createdAt: z.date(),
    updatedAt: z.date().nullable(),
    deletedAt: z.date().nullable()
  })
  .strict()

export const TaskDependencySchema = z
  .object({
    id: z.string(),
    predecessorId: z.string(),
    successorId: z.string(),
    type: DependencyTypeSchema,
    lag: z.number().int(),
    createdAt: z.date(),
    updatedAt: z.date().nullable(),
    predecessor: z.object({ id: z.string(), title: z.string() }).optional(),
    successor: z.object({ id: z.string(), title: z.string() }).optional()
  })
  .strict()

export const TaskAssigneeSchema = z
  .object({
    id: z.string(),
    taskId: z.string(),
    userId: z.string(),
    user: GetUserProfileResSchema,
    createdById: z.string().nullable().optional(),
    updatedById: z.string().nullable().optional(),
    deletedById: z.string().nullable().optional(),
    createdAt: z.date().optional(),
    updatedAt: z.date().nullable().optional(),
    deletedAt: z.date().nullable().optional()
  })
  .strict()


export const TaskDetailSchema = TaskSchema.extend({
  assignees: z.array(TaskAssigneeSchema).optional(),
  parent: TaskSchema.nullable().optional(),
  subTasks: z.array(TaskSchema).optional(),
  predecessors: z.array(TaskDependencySchema).optional(),
  successors: z.array(TaskDependencySchema).optional()
}).strict()

export const TaskCommentSchema = z
  .object({
    id: z.string(),
    taskId: z.string(),
    memberId: z.string(),
    memberDisplayName: z.string(),
    memberAvatar: z.string().nullable(),
    content: z.string(),
    createdAt: z.date(),
    updatedAt: z.date().nullable(),
    deletedAt: z.date().nullable()
  })
  .strict()

export const TaskAttachmentSchema = z
  .object({
    id: z.string(),
    taskId: z.string(),
    fileName: z.string(),
    fileType: z.string(),
    fileUrl: z.string(),
    createdAt: z.date(),
    updatedAt: z.date().nullable(),
    deletedAt: z.date().nullable()
  })
  .strict()

export const GetTaskParamSchema = z
  .object({
    taskId: z.string()
  })
  .strict()

export const GetSprintParamSchema = z
  .object({
    sprintId: z.string()
  })
  .strict()

export const GetBoardColumnParamSchema = z
  .object({
    boardColumnId: z.string()
  })
  .strict()

export const GetTaskDetailResSchema = TaskDetailSchema

export const GetListTaskResSchema = z
  .object({
    data: z.array(TaskSchema),
    totalItems: z.number().nonnegative(),
    page: z.number().positive(),
    limit: z.number().positive(),
    totalPages: z.number().nonnegative()
  })
  .strict()

export const CreateTaskBodySchema = z
  .object({
    sprintId: z.string(),
    boardColumnId: z.string().optional(),
    title: z.string(),
    description: z.string().nullable().optional(),
    type: TaskTypeEnumSchema.optional(),
    priority: TaskPrioritySchema.nullable().optional(),
    storyPoint: z.number().int().nonnegative().optional(),
    dueDate: z.coerce.date().nullable().optional(),
    startDate: z.coerce.date().nullable().optional(),
    duration: z.number().int().nonnegative().optional(),
    parentId: z.string().nullable().optional(),
    assigneeIds: z.array(z.string()).optional()
  })
  .strip()

export const UpdateTaskBodySchema = CreateTaskBodySchema.partial().strip()

export const AddTaskCommentBodySchema = z
  .object({
    memberDisplayName: z.string(),
    memberAvatar: z.string().nullable().optional(),
    content: z.string().min(1)
  })
  .strict()

export const AddTaskAttachmentBodySchema = z
  .object({
    fileName: z.string(),
    fileType: z.string(),
    fileUrl: z.string()
  })
  .strict()

export const CreateTaskDependencyBodySchema = z
  .object({
    predecessorId: z.string(),
    successorId: z.string(),
    type: DependencyTypeSchema.optional(),
    lag: z.number().int().nonnegative().optional()
  })
  .strict()

export const SprintNetworkDiagramResSchema = z
  .object({
    tasks: z.array(
      TaskSchema.extend({
        assignees: z.array(TaskAssigneeSchema).optional(),
        parentId: z.string().nullable().optional()
      })
    ),
    dependencies: z.array(TaskDependencySchema)
  })
  .strict()

export const ReorderTasksBodySchema = z
  .object({
    taskOrderIds: z.array(z.string())
  })
  .strict()

export const MoveTaskBodySchema = z
  .object({
    targetColumnId: z.string(),
    newIndex: z.number().int().min(0)
  })
  .strict()

export type TaskType = z.infer<typeof TaskSchema>
export type TaskDetailType = z.infer<typeof TaskDetailSchema>
export type TaskDependencyType = z.infer<typeof TaskDependencySchema>
export type TaskAssigneeType = z.infer<typeof TaskAssigneeSchema>
export type TaskCommentType = z.infer<typeof TaskCommentSchema>
export type TaskAttachmentType = z.infer<typeof TaskAttachmentSchema>
export type GetTaskParamType = z.infer<typeof GetTaskParamSchema>
export type GetSprintParamType = z.infer<typeof GetSprintParamSchema>
export type GetBoardColumnParamType = z.infer<typeof GetBoardColumnParamSchema>
export type GetTaskDetailResType = z.infer<typeof GetTaskDetailResSchema>
export type GetListTaskResType = z.infer<typeof GetListTaskResSchema>
export type CreateTaskBodyType = z.infer<typeof CreateTaskBodySchema>
export type UpdateTaskBodyType = z.infer<typeof UpdateTaskBodySchema>
export type AddTaskCommentBodyType = z.infer<typeof AddTaskCommentBodySchema>
export type AddTaskAttachmentBodyType = z.infer<typeof AddTaskAttachmentBodySchema>
export type CreateTaskDependencyBodyType = z.infer<typeof CreateTaskDependencyBodySchema>
export type SprintNetworkDiagramResType = z.infer<typeof SprintNetworkDiagramResSchema>
export type ReorderTasksBodyType = z.infer<typeof ReorderTasksBodySchema>
export type MoveTaskBodyType = z.infer<typeof MoveTaskBodySchema>

