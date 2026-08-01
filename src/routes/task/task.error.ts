import { HttpStatus, UnprocessableEntityException } from '@nestjs/common'

export const TaskNotFoundError = new UnprocessableEntityException({
  message: 'Task not found',
  path: 'taskId',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const TaskDependencyExistsError = new UnprocessableEntityException({
  message: 'Dependency already exists between these tasks',
  path: 'dependency',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const TaskCyclicDependencyError = new UnprocessableEntityException({
  message: 'Cyclic dependency detected. You cannot create a dependency that forms a cycle.',
  path: 'dependency',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const TaskDependencyNotFoundError = new UnprocessableEntityException({
  message: 'Task dependency not found',
  path: 'dependencyId',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const TaskErrorConstraintViolation = new UnprocessableEntityException({
  message: 'Task constraint violation',
  path: 'task',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const AssigneesNotMembersError = new UnprocessableEntityException({
  message: 'One or more assignees are not active members of the project',
  path: 'assigneeIds',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const InvalidTasksCountError = new UnprocessableEntityException({
  message: 'The number of task IDs provided does not match the active tasks in this column',
  path: 'taskOrderIds',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const DuplicateTaskIdsError = new UnprocessableEntityException({
  message: 'Duplicate task IDs are not allowed in reordering',
  path: 'taskOrderIds',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const TaskNotBelongToColumnError = (taskId: string | number) =>
  new UnprocessableEntityException({
    message: `Task with ID ${taskId} does not exist in this column or has been deleted`,
    path: 'taskOrderIds',
    statusCode: HttpStatus.UNPROCESSABLE_ENTITY
  })

export const ParentTaskNotFoundError = new UnprocessableEntityException({
  message: 'Parent task not found',
  path: 'parentId',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const CannotNestSubtasksError = new UnprocessableEntityException({
  message: 'Cannot create a subtask under another subtask',
  path: 'parentId',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const SprintMismatchError = new UnprocessableEntityException({
  message: 'Subtask must belong to the same sprint as the parent task',
  path: 'sprintId',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const CannotBeParentOfSelfError = new UnprocessableEntityException({
  message: 'A task cannot be a parent of itself',
  path: 'parentId',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const TaskHasSubtasksError = new UnprocessableEntityException({
  message: 'A task that has subtasks cannot be converted into a subtask',
  path: 'parentId',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const ColumnNotBelongToSprintError = new UnprocessableEntityException({
  message: 'Board column does not belong to the task sprint',
  path: 'boardColumnId',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})




