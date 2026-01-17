import { Request } from 'express'
import { taskModel } from '~/models/task.model'
import { sprintModel } from '~/models/sprint.model'
import { boardColumnModel } from '~/models/boardColumn.model'
import { projectModel } from '~/models/project.model'
import { userModel } from '~/models/user.model'
import ApiError from '~/utils/ApiError'
import { StatusCodes } from 'http-status-codes'
import { pickTask } from '~/utils/formatter'

/**
 * Create a new task
 * @param req Task Data from request
 * @returns The created task document
 */
const createNew = async (req: Request): Promise<any> => {
  try {
    const {
      sprintId,
      boardColumnId,
      title,
      description,
      labels,
      priority,
      storyPoint,
      dueDate,
      assigneeIds
    } = req.body

    // Get user id from JWT
    const userId = req.jwtDecoded.id

    // Check if sprint exists
    const existingSprint = await sprintModel.findOneById(sprintId)
    if (!existingSprint) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Sprint not found')
    }

    // Check if user has access to the project
    const project = await projectModel.findOneById(
      existingSprint.projectId.toString()
    )
    if (!project) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Project not found')
    }

    // Check if user is a member of the project
    const isMember = project.members.some(
      (m) => m.memberId.toString() === userId && m.status === 'active'
    )

    if (!isMember && project.ownerId.toString() !== userId) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'You are not a member of this project'
      )
    }

    // Check if user has permission to create sprint
    if (
      project.members.find((m) => m.memberId.toString() === userId)?.role !==
        'owner' &&
      !isMember
    ) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'You do not have permission to create a sprint in this project'
      )
    }

    // Check if story point greater than sprint max story point
    if (
      storyPoint &&
      existingSprint.maxStoryPoint !== null &&
      storyPoint > existingSprint.maxStoryPoint
    ) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        `Story point cannot exceed sprint max story point of ${existingSprint.maxStoryPoint}`
      )
    }

    // Calculate total story points in sprint before update
    const tasksInSprint = await taskModel.findBySprintId(
      existingSprint._id!.toString()
    )
    const currentTotalStoryPoints = tasksInSprint.reduce((total, task) => {
      // Exclude current task being updated from the calculation
      if (task._id?.toString() === req.params.id) {
        return total
      }
      return total + (task.storyPoint || 0)
    }, 0)

    // Check if total story points would exceed sprint max
    const newStoryPoint = req.body.storyPoint
    const totalAfterUpdate = currentTotalStoryPoints + newStoryPoint

    if (
      existingSprint.maxStoryPoint !== null &&
      totalAfterUpdate > existingSprint.maxStoryPoint
    ) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        `Total story points (${totalAfterUpdate}) would exceed sprint max story point of ${existingSprint.maxStoryPoint}`
      )
    }

    // Validate assigneeIds if provided
    if (assigneeIds && assigneeIds.length > 0) {
      for (const assigneeId of assigneeIds) {
        const assignee = await userModel.findOneById(assigneeId)
        if (!assignee) {
          throw new ApiError(
            StatusCodes.BAD_REQUEST,
            `Assignee with id ${assigneeId} does not exist`
          )
        }

        // Check if assignee is a member of the project
        const isAssigneeMember =
          project.ownerId.toString() === assigneeId ||
          project.members.some(
            (m) => m.memberId.toString() === assigneeId && m.status === 'active'
          )

        if (!isAssigneeMember) {
          throw new ApiError(
            StatusCodes.BAD_REQUEST,
            `User ${assignee.displayName} is not a member of this project`
          )
        }
      }
    }

    // Find backlog column for the sprint
    const boardColumns = await boardColumnModel.findBySprintId(sprintId)
    const backlogColumn = boardColumns.find(
      (col) => col.title.toLowerCase() === 'backlog'
    )

    if (!backlogColumn) {
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        'Backlog column not found for this sprint'
      )
    }

    const boardColumnIdFinal = boardColumnId
      ? boardColumnId
      : backlogColumn._id?.toString()

    // Prepare new task data
    const newTaskData: any = {
      sprintId,
      boardColumnId: boardColumnIdFinal,
      title,
      description: description || '',
      labels: labels,
      priority: priority || '',
      storyPoint: storyPoint || 0,
      dueDate: dueDate ? new Date(dueDate).getTime() : null,
      assigneeIds: assigneeIds || []
    }

    const createdTask = await taskModel.createNew(newTaskData)

    if (!createdTask) {
      throw new ApiError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Task creation failed'
      )
    }

    // Update board column taskOrderIds
    const updatedTaskOrderIds = [
      ...(boardColumnIdFinal.taskOrderIds || []),
      createdTask._id.toString()
    ]

    if (!boardColumnIdFinal) {
      throw new ApiError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Backlog column ID is missing'
      )
    }
    await boardColumnModel.update(boardColumnIdFinal.toString(), {
      taskOrderIds: updatedTaskOrderIds
    })

    return pickTask(createdTask)
  } catch (error: any) {
    throw error
  }
}

/**
 * Get task by id
 * @param req Request object containing task id
 * @returns Task data
 */
const getTaskById = async (req: Request): Promise<any> => {
  try {
    const { id } = req.params
    const userId = req.jwtDecoded.id

    const task = await taskModel.findOneById(id)
    if (!task) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Task not found')
    }

    // Check if user has access to the project
    const sprint = await sprintModel.findOneById(task.sprintId.toString())
    if (!sprint) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Sprint not found')
    }

    const project = await projectModel.findOneById(sprint.projectId.toString())
    if (!project) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Project not found')
    }

    const isMember = project.members.some(
      (m) => m.memberId.toString() === userId && m.status === 'active'
    )
    if (!isMember && project.ownerId.toString() !== userId) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'You do not have access to this task'
      )
    }

    return pickTask(task)
  } catch (error) {
    throw error
  }
}

/**
 * Get all tasks by sprint id
 * @param req Request object containing sprint id
 * @returns Array of tasks
 */
const getAllTasksBySprintId = async (req: Request): Promise<any[]> => {
  try {
    const { sprintId } = req.params
    const userId = req.jwtDecoded.id

    // Check if sprint exists
    const sprint = await sprintModel.findOneById(sprintId)
    if (!sprint) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Sprint not found')
    }

    // Check if user has access to the project
    const project = await projectModel.findOneById(sprint.projectId.toString())
    if (!project) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Project not found')
    }

    const isMember = project.members.some(
      (m) => m.memberId.toString() === userId && m.status === 'active'
    )
    if (!isMember && project.ownerId.toString() !== userId) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'You do not have access to this sprint'
      )
    }

    const tasks = await taskModel.findBySprintId(sprintId)
    return tasks.map((task) => pickTask(task))
  } catch (error) {
    throw error
  }
}

/**
 * Get all tasks by board column id
 * @param req Request object containing board column id
 * @returns Array of tasks
 */
const getAllTasksByBoardColumnId = async (req: Request): Promise<any[]> => {
  try {
    const { boardColumnId } = req.params
    const userId = req.jwtDecoded.id

    // Check if board column exists
    const boardColumn = await boardColumnModel.findOneById(boardColumnId)
    if (!boardColumn) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Board column not found')
    }

    // Check if user has access to the project
    const sprint = await sprintModel.findOneById(
      boardColumn.sprintId.toString()
    )
    if (!sprint) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Sprint not found')
    }

    const project = await projectModel.findOneById(sprint.projectId.toString())
    if (!project) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Project not found')
    }

    const isMember = project.members.some(
      (m) => m.memberId.toString() === userId && m.status === 'active'
    )
    if (!isMember && project.ownerId.toString() !== userId) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'You do not have access to this board column'
      )
    }

    const tasks = await taskModel.findByBoardColumnId(boardColumnId)
    return tasks.map((task) => pickTask(task))
  } catch (error) {
    throw error
  }
}

/**
 * Update task details
 * @param req Request object containing task update data
 * @returns The updated task document
 */
const updateTask = async (req: Request): Promise<any> => {
  try {
    const { id } = req.params
    const userId = req.jwtDecoded.id

    const existingTask = await taskModel.findOneById(id)
    if (!existingTask) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Task not found')
    }

    // Check if user has access to the project
    const sprint = await sprintModel.findOneById(
      existingTask.sprintId.toString()
    )
    if (!sprint) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Sprint not found')
    }

    const project = await projectModel.findOneById(sprint.projectId.toString())
    if (!project) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Project not found')
    }

    // Only project owner or member can update task
    const isMember = project.members.some(
      (m) => m.memberId.toString() === userId && m.status === 'active'
    )
    const member = project.members.find((m) => m.memberId.toString() === userId)
    // If member role is viewer, they can only update if they are an assignee
    if (
      !isMember &&
      member?.role === 'viewer' &&
      existingTask.assigneeIds.indexOf(userId) === -1
    ) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'You are not authorized to update this task'
      )
    }

    // Check if story point greater than sprint max story point
    if (
      req.body.storyPoint &&
      sprint.maxStoryPoint !== null &&
      req.body.storyPoint > sprint.maxStoryPoint
    ) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        `Story point cannot exceed sprint max story point of ${sprint.maxStoryPoint}`
      )
    }
    // Calculate total story points in sprint before update
    const tasksInSprint = await taskModel.findBySprintId(sprint._id!.toString())
    const currentTotalStoryPoints = tasksInSprint.reduce((total, task) => {
      // Exclude current task being updated from the calculation
      if (task._id?.toString() === id) {
        return total
      }
      return total + (task.storyPoint || 0)
    }, 0)

    // Check if total story points would exceed sprint max
    const newStoryPoint = req.body.storyPoint || existingTask.storyPoint || 0
    const totalAfterUpdate = currentTotalStoryPoints + newStoryPoint

    if (
      sprint.maxStoryPoint !== null &&
      totalAfterUpdate > sprint.maxStoryPoint
    ) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        `Total story points (${totalAfterUpdate}) would exceed sprint max story point of ${sprint.maxStoryPoint}`
      )
    }

    // Validate assigneeIds if provided
    if (req.body.assigneeIds && req.body.assigneeIds.length > 0) {
      // Check if only project owner can assign tasks
      if (
        project.members.find((m) => m.memberId.toString() === userId)?.role !==
        'owner'
      ) {
        throw new ApiError(
          StatusCodes.FORBIDDEN,
          'Only project owner can assign tasks'
        )
      }

      for (const assigneeId of req.body.assigneeIds) {
        const assignee = await userModel.findOneById(assigneeId)
        if (!assignee) {
          throw new ApiError(
            StatusCodes.BAD_REQUEST,
            `Assignee with id ${assigneeId} does not exist`
          )
        }

        // Check if assignee is a member of the project
        const isAssigneeMember =
          project.ownerId.toString() === assigneeId ||
          project.members.some(
            (m) => m.memberId.toString() === assigneeId && m.status === 'active'
          )

        if (!isAssigneeMember) {
          throw new ApiError(
            StatusCodes.BAD_REQUEST,
            `User ${assignee.displayName} is not a member of this project`
          )
        }
      }
    }

    // If moving to different column, update taskOrderIds
    if (
      req.body.boardColumnId &&
      req.body.boardColumnId !== existingTask.boardColumnId.toString()
    ) {
      const newColumn = await boardColumnModel.findOneById(
        req.body.boardColumnId
      )
      if (!newColumn) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Board column not found')
      }

      const oldColumn = await boardColumnModel.findOneById(
        existingTask.boardColumnId.toString()
      )

      // Remove from old column
      if (oldColumn) {
        const updatedOldTaskOrderIds = (oldColumn.taskOrderIds || []).filter(
          (taskId) => taskId.toString() !== id
        )
        await boardColumnModel.update(oldColumn._id!.toString(), {
          taskOrderIds: updatedOldTaskOrderIds
        })
      }

      // Add to new column
      const updatedNewTaskOrderIds = [...(newColumn.taskOrderIds || []), id]
      await boardColumnModel.update(newColumn._id!.toString(), {
        taskOrderIds: updatedNewTaskOrderIds
      })
    }

    // Prepare update data
    const updateData: any = {
      ...req.body,
      updatedAt: Date.now()
    }

    const updatedTask = await taskModel.update(id, updateData)

    return pickTask(updatedTask)
  } catch (error) {
    throw error
  }
}

/**
 * Delete task by id
 * @param req Request object containing task id
 */
const deleteTaskById = async (req: Request): Promise<void> => {
  try {
    const { id } = req.params
    const userId = req.jwtDecoded.id

    const existingTask = await taskModel.findOneById(id)
    if (!existingTask) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Task not found')
    }

    // Check if user has access to the project
    const sprint = await sprintModel.findOneById(
      existingTask.sprintId.toString()
    )
    if (!sprint) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Sprint not found')
    }

    const project = await projectModel.findOneById(sprint.projectId.toString())
    if (!project) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Project not found')
    }

    // Only project owner or member with 'owner' role can delete task
    if (
      project.ownerId.toString() !== userId &&
      project.members.find((m) => m.memberId.toString() === userId)?.role !==
        'owner'
    ) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'Only project owner can delete tasks'
      )
    }

    // Remove task from board column taskOrderIds
    const boardColumn = await boardColumnModel.findOneById(
      existingTask.boardColumnId.toString()
    )
    if (boardColumn) {
      const updatedTaskOrderIds = (boardColumn.taskOrderIds || []).filter(
        (taskId) => taskId.toString() !== id
      )

      await boardColumnModel.update(boardColumn._id!.toString(), {
        taskOrderIds: updatedTaskOrderIds
      })
    }

    await taskModel.deleteById(id)
  } catch (error: any) {
    throw error
  }
}

/**
 * Add comment to task
 * @param req Request object containing task id and comment data
 * @returns The updated task document
 */
const addCommentToTask = async (req: Request): Promise<any> => {
  try {
    const { id } = req.params
    const { content } = req.body
    const userId = req.jwtDecoded.id

    const existingTask = await taskModel.findOneById(id)
    if (!existingTask) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Task not found')
    }

    // Check if user has access to the project
    const sprint = await sprintModel.findOneById(
      existingTask.sprintId.toString()
    )
    if (!sprint) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Sprint not found')
    }

    const project = await projectModel.findOneById(sprint.projectId.toString())
    if (!project) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Project not found')
    }

    const isMember = project.members.some(
      (m) => m.memberId.toString() === userId && m.status === 'active'
    )
    if (!isMember && project.ownerId.toString() !== userId) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'You are not authorized to comment on this task'
      )
    }

    // Get user info
    const user = await userModel.findOneById(userId)
    if (!user) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'User not found')
    }

    const comment = {
      memberId: userId,
      memberDisplayName: user.displayName,
      memberAvatar: user.avatar || '',
      content,
      createdAt: Date.now()
    }

    const updatedTask = await taskModel.addComment(id, comment)

    return pickTask(updatedTask)
  } catch (error) {
    throw error
  }
}

/**
 * Add attachment to task
 * @param req Request object containing task id and attachment data
 * @returns The updated task document
 */
const addAttachmentToTask = async (req: Request): Promise<any> => {
  try {
    const { id } = req.params
    const { fileName, fileType, fileUrl } = req.body
    const userId = req.jwtDecoded.id

    const existingTask = await taskModel.findOneById(id)
    if (!existingTask) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Task not found')
    }

    // Check if user has access to the project
    const sprint = await sprintModel.findOneById(
      existingTask.sprintId.toString()
    )
    if (!sprint) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Sprint not found')
    }

    const project = await projectModel.findOneById(sprint.projectId.toString())
    if (!project) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Project not found')
    }

    const isMember = project.members.some(
      (m) => m.memberId.toString() === userId && m.status === 'active'
    )
    if (!isMember && project.ownerId.toString() !== userId) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'You are not authorized to add attachment to this task'
      )
    }

    const attachment = {
      fileName,
      fileType,
      fileUrl,
      createdAt: Date.now()
    }

    const updatedTask = await taskModel.addAttachment(id, attachment)

    return pickTask(updatedTask)
  } catch (error) {
    throw error
  }
}

export const taskService = {
  createNew,
  getTaskById,
  getAllTasksBySprintId,
  getAllTasksByBoardColumnId,
  updateTask,
  deleteTaskById,
  addCommentToTask,
  addAttachmentToTask
}
