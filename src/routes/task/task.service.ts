import { Injectable } from '@nestjs/common'
import { TaskRepo } from './task.repo'
import { isForeignKeyConstraintPrismaError, isNotFoundPrismaError } from '~/shared/helpers'
import { DependencyType } from '~/generated/prisma/client'
import {
  TaskNotFoundError,
  TaskDependencyExistsError,
  TaskCyclicDependencyError,
  TaskDependencyNotFoundError,
  TaskErrorConstraintViolation,
  AssigneesNotMembersError,
  DuplicateTaskIdsError,
  InvalidTasksCountError,
  TaskNotBelongToColumnError,
  ParentTaskNotFoundError,
  CannotNestSubtasksError,
  SprintMismatchError,
  CannotBeParentOfSelfError,
  TaskHasSubtasksError,
  ColumnNotBelongToSprintError
} from './task.error'
import { SprintNotFoundError } from '../sprint/sprint.error'
import { BoardColumnNotFoundError } from '../board-column/board-column.error'
import {
  AddTaskAttachmentBodyType,
  AddTaskCommentBodyType,
  CreateTaskBodyType,
  GetSprintParamType,
  UpdateTaskBodyType,
  CreateTaskDependencyBodyType
} from './task.model'
import { SharedSprintRepo } from '~/shared/repositories/shared-sprint.repo'
import { QueueService } from '../queue/queue.service'
import { BoardGateway } from './board.gateway'

@Injectable()
export class TaskService {
  constructor(
    private readonly taskRepo: TaskRepo,
    private readonly sharedSprintRepo: SharedSprintRepo,
    private readonly boardGateway: BoardGateway,
    private readonly queueService: QueueService
  ) {}

  async findAllBySprintId(params: GetSprintParamType) {
    return await this.sharedSprintRepo.getSprintBoardDetail(params.sprintId)
  }

  async findById(id: string) {
    const task = await this.taskRepo.findById({ taskId: id })
    if (!task) {
      throw TaskNotFoundError
    }
    return task
  }

  async create(body: CreateTaskBodyType, userId: string) {
    if (body.boardColumnId) {
      const column = await this.taskRepo.findBoardColumnById(body.boardColumnId)
      if (!column) {
        throw BoardColumnNotFoundError
      }
      if (column.sprintId !== body.sprintId) {
        throw ColumnNotBelongToSprintError
      }
    }

    if (body.parentId) {
      const parentTask = await this.taskRepo.findById({ taskId: body.parentId })
      if (!parentTask) {
        throw ParentTaskNotFoundError
      }
      if (parentTask.parentId !== null) {
        throw CannotNestSubtasksError
      }
      if (body.sprintId !== parentTask.sprintId) {
        throw SprintMismatchError
      }
    }

    if (body.assigneeIds && body.assigneeIds.length > 0) {
      const projectId = await this.taskRepo.getProjectIdBySprintId(body.sprintId)
      if (!projectId) {
        throw SprintNotFoundError
      }
      const isValid = await this.taskRepo.validateProjectMembers(projectId, body.assigneeIds)
      if (!isValid) {
        throw AssigneesNotMembersError
      }
    }
    const newTask = await this.taskRepo.create(body, userId)
    this.boardGateway.emitTaskCreated(body.sprintId, newTask)

    // Gui thong bao cho tat ca assignees duoc gan
    if (body.assigneeIds && body.assigneeIds.length > 0) {
      for (const assigneeId of body.assigneeIds) {
        await this.queueService.createNotification({
          userId: assigneeId,
          taskId: newTask.id,
          type: 'task_assigned',
          title: 'Task Assigned',
          message: `You have been assigned to task "${newTask.title}"`
        })
      }
    }

    // Đẩy job sinh vector embedding ngầm trong background
    this.queueService.generateTaskEmbedding(newTask.id).catch(() => {})

    return newTask
  }

  async update({ id, body, userId }: { id: string; body: UpdateTaskBodyType; userId: string }) {
    if (body.parentId !== undefined || body.sprintId !== undefined || body.boardColumnId !== undefined) {
      const task = await this.taskRepo.findById({ taskId: id })
      if (!task) {
        throw TaskNotFoundError
      }

      const targetSprintId = body.sprintId !== undefined ? body.sprintId : task.sprintId

      if (body.boardColumnId !== undefined) {
        const column = await this.taskRepo.findBoardColumnById(body.boardColumnId)
        if (!column) {
          throw BoardColumnNotFoundError
        }
        if (column.sprintId !== targetSprintId) {
          throw ColumnNotBelongToSprintError
        }
      }

      if (body.parentId !== undefined && body.parentId !== null) {
        if (body.parentId === id) {
          throw CannotBeParentOfSelfError
        }
        if (task.subTasks && task.subTasks.length > 0) {
          throw TaskHasSubtasksError
        }
        const parentTask = await this.taskRepo.findById({ taskId: body.parentId })
        if (!parentTask) {
          throw ParentTaskNotFoundError
        }
        if (parentTask.parentId !== null) {
          throw CannotNestSubtasksError
        }
        if (targetSprintId !== parentTask.sprintId) {
          throw SprintMismatchError
        }
      }

      const currentParentId = body.parentId !== undefined ? body.parentId : task.parentId
      if (currentParentId !== null && currentParentId !== undefined && body.sprintId !== undefined) {
        const parentTask = await this.taskRepo.findById({ taskId: currentParentId })
        if (parentTask && body.sprintId !== parentTask.sprintId) {
          throw SprintMismatchError
        }
      }
    }

    let targetProjectId: string | null = null
    let validateIds: string[] | undefined = undefined

    if (body.sprintId !== undefined) {
      targetProjectId = await this.taskRepo.getProjectIdBySprintId(body.sprintId)
      if (!targetProjectId) {
        throw SprintNotFoundError
      }

      if (body.assigneeIds !== undefined) {
        validateIds = body.assigneeIds
      } else {
        const task = await this.taskRepo.findById({ taskId: id })
        if (!task) {
          throw TaskNotFoundError
        }
        validateIds = task.assignees?.map((a) => a.userId) || []
      }
    } else if (body.assigneeIds !== undefined) {
      targetProjectId = await this.taskRepo.getProjectIdByTaskId(id)
      if (!targetProjectId) {
        throw TaskNotFoundError
      }
      validateIds = body.assigneeIds
    }

    if (targetProjectId !== null && validateIds !== undefined && validateIds.length > 0) {
      const isValid = await this.taskRepo.validateProjectMembers(targetProjectId, validateIds)
      if (!isValid) {
        throw AssigneesNotMembersError
      }
    }

    const oldTask = await this.taskRepo.findById({ taskId: id })

    try {
      const updatedTask = await this.taskRepo.update({ id, body, userId })
      this.boardGateway.emitTaskUpdated(updatedTask.sprintId, updatedTask)

      // 1. Thong bao cho assignees moi duoc gan
      if (body.assigneeIds && body.assigneeIds.length > 0) {
        const oldAssigneeIds = oldTask?.assignees?.map((a) => a.userId) || []
        const newAssignees = body.assigneeIds.filter((aId) => !oldAssigneeIds.includes(aId))
        for (const newAssigneeId of newAssignees) {
          if (newAssigneeId !== userId) {
            await this.queueService.createNotification({
              userId: newAssigneeId,
              taskId: updatedTask.id,
              type: 'task_assigned',
              title: 'Task Assigned',
              message: `You have been assigned to task "${updatedTask.title}"`
            })
          }
        }
      }

      // 2. Thong bao khi doi trang thai cot BoardColumn
      if (body.boardColumnId && oldTask && body.boardColumnId !== oldTask.boardColumnId) {
        const newColumn = await this.taskRepo.findBoardColumnById(body.boardColumnId)
        const currentAssignees = body.assigneeIds || oldTask.assignees?.map((a) => a.userId) || []
        for (const aId of currentAssignees) {
          if (aId !== userId) {
            await this.queueService.createNotification({
              userId: aId,
              taskId: updatedTask.id,
              type: 'task_moved',
              title: 'Task Status Updated',
              message: `Task "${updatedTask.title}" was moved to "${newColumn?.title || 'new column'}"`
            })
          }
        }
      }

      // Đẩy job cập nhật vector embedding ngầm trong background
      this.queueService.generateTaskEmbedding(updatedTask.id).catch(() => {})

      return updatedTask
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw TaskNotFoundError
      }
      if (isForeignKeyConstraintPrismaError(error)) {
        throw TaskErrorConstraintViolation
      }
      throw error
    }
  }

  async delete({ id, userId }: { id: string; userId: string }, isHard?: boolean) {
    try {
        const deletedTask = await this.taskRepo.delete({ id, userId }, isHard)
    this.boardGateway.emitTaskDeleted(deletedTask.sprintId, id)
      return { message: 'Task deleted successfully' }
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw TaskNotFoundError
      }
      throw error
    }
  }

  async addComment({ taskId, memberId, body }: { taskId: string; memberId: string; body: AddTaskCommentBodyType }) {
    return await this.taskRepo.addComment(taskId, memberId, body)
  }

  async addAttachment({ taskId, body }: { taskId: string; body: AddTaskAttachmentBodyType }) {
    return await this.taskRepo.addAttachment(taskId, body)
  }

  // ===================
  // Dependency Management & AON/AOA Network Diagram
  // ===================

  async checkCycle(predecessorId: string, successorId: string): Promise<boolean> {
    if (predecessorId === successorId) return true

    const visited = new Set<string>()
    const queue = [successorId]

    while (queue.length > 0) {
      const curr = queue.shift()!
      if (curr === predecessorId) {
        return true
      }
      if (!visited.has(curr)) {
        visited.add(curr)
        const deps = await this.taskRepo.getDependenciesByPredecessorId(curr)
        for (const dep of deps) {
          if (!visited.has(dep.successorId)) {
            queue.push(dep.successorId)
          }
        }
      }
    }
    return false
  }

  async createDependency(body: CreateTaskDependencyBodyType) {
    const { predecessorId, successorId, type = DependencyType.FS, lag = 0 } = body

    // 1. Check if predecessor and successor exist
    const [pred, succ] = await Promise.all([
      this.taskRepo.findById({ taskId: predecessorId }),
      this.taskRepo.findById({ taskId: successorId })
    ])
    if (!pred || !succ) {
      throw TaskNotFoundError
    }

    // 2. Check if dependency already exists
    const existing = await this.taskRepo.findDependencyByTasks(predecessorId, successorId)
    if (existing) {
      throw TaskDependencyExistsError
    }

    // 3. Cycle Detection
    const hasCycle = await this.checkCycle(predecessorId, successorId)
    if (hasCycle) {
      throw TaskCyclicDependencyError
    }

    return await this.taskRepo.createDependency(predecessorId, successorId, type, lag)
  }

  async deleteDependency(dependencyId: string) {
    const dep = await this.taskRepo.findDependencyById(dependencyId)
    if (!dep) {
      throw TaskDependencyNotFoundError
    }
    await this.taskRepo.deleteDependency(dependencyId)
    return { message: 'Task dependency deleted successfully' }
  }

  async reorderTasks(boardColumnId: string, taskOrderIds: string[]) {
    const boardColumn = await this.taskRepo.findBoardColumnById(boardColumnId)
    if (!boardColumn) {
      throw BoardColumnNotFoundError
    }

    const activeTasks = await this.taskRepo.findActiveTasksByColumnId(boardColumnId)
    const activeTaskIds = activeTasks.map((t) => t.id)

    if (new Set(taskOrderIds).size !== taskOrderIds.length) {
      throw DuplicateTaskIdsError
    }

    if (taskOrderIds.length !== activeTaskIds.length) {
      throw InvalidTasksCountError
    }

    const activeSet = new Set(activeTaskIds)
    for (const id of taskOrderIds) {
      if (!activeSet.has(id)) {
        throw TaskNotBelongToColumnError(id)
      }
    }

     await this.taskRepo.reorderTasks(boardColumnId, taskOrderIds)
    const column = await this.taskRepo.findBoardColumnById(boardColumnId)
    if (column) {
      this.boardGateway.emitTaskMoved(column.sprintId, { boardColumnId, taskOrderIds })
    }
    return { message: 'Tasks reordered successfully' }

  }

  async moveTask(taskId: string, targetColumnId: string, newIndex: number) {
    const task = await this.taskRepo.findById({ taskId })
    if (!task) {
      throw TaskNotFoundError
    }

    const targetColumn = await this.taskRepo.findBoardColumnById(targetColumnId)
    if (!targetColumn) {
      throw BoardColumnNotFoundError
    }

    if (task.sprintId !== targetColumn.sprintId) {
      throw TaskErrorConstraintViolation
    }

    await this.taskRepo.moveTask(taskId, targetColumnId, newIndex)
    this.boardGateway.emitTaskMoved(task.sprintId, { taskId, targetColumnId, newIndex })

    // Gui thong bao cho tat ca assignees
    const assignees = task.assignees?.map((a) => a.userId) || []
    for (const aId of assignees) {
      await this.queueService.createNotification({
        userId: aId,
        taskId: task.id,
        type: 'task_moved',
        title: 'Task Status Updated',
        message: `Task "${task.title}" was moved to column "${targetColumn.title}"`
      })
    }

    return await this.sharedSprintRepo.getSprintBoardDetail(task.sprintId)
  }
}
