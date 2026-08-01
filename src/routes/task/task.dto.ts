import { createZodDto } from 'nestjs-zod'
import {
  AddTaskAttachmentBodySchema,
  AddTaskCommentBodySchema,
  CreateTaskBodySchema,
  GetBoardColumnParamSchema,
  GetListTaskResSchema,
  GetSprintParamSchema,
  GetTaskDetailResSchema,
  GetTaskParamSchema,
  TaskAttachmentSchema,
  TaskCommentSchema,
  UpdateTaskBodySchema,
  CreateTaskDependencyBodySchema,
  TaskDependencySchema,
  SprintNetworkDiagramResSchema,
  ReorderTasksBodySchema,
  MoveTaskBodySchema
} from './task.model'

export class GetTaskDetailResDTO extends createZodDto(GetTaskDetailResSchema) {}

export class GetListTaskResDTO extends createZodDto(GetListTaskResSchema) {}

export class CreateTaskBodyDTO extends createZodDto(CreateTaskBodySchema) {}

export class UpdateTaskBodyDTO extends createZodDto(UpdateTaskBodySchema) {}

export class GetTaskParamDTO extends createZodDto(GetTaskParamSchema) {}

export class GetSprintParamDTO extends createZodDto(GetSprintParamSchema) {}

export class GetBoardColumnParamDTO extends createZodDto(GetBoardColumnParamSchema) {}

export class AddTaskCommentBodyDTO extends createZodDto(AddTaskCommentBodySchema) {}

export class AddTaskAttachmentBodyDTO extends createZodDto(AddTaskAttachmentBodySchema) {}

export class TaskCommentResDTO extends createZodDto(TaskCommentSchema) {}

export class TaskAttachmentResDTO extends createZodDto(TaskAttachmentSchema) {}

export class CreateTaskDependencyBodyDTO extends createZodDto(CreateTaskDependencyBodySchema) {}

export class TaskDependencyResDTO extends createZodDto(TaskDependencySchema) {}

export class SprintNetworkDiagramResDTO extends createZodDto(SprintNetworkDiagramResSchema) {}

export class ReorderTasksBodyDTO extends createZodDto(ReorderTasksBodySchema) {}

export class MoveTaskBodyDTO extends createZodDto(MoveTaskBodySchema) {}

