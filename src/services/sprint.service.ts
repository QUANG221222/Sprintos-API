import { Request } from 'express'
import { sprintModel } from '~/models/sprint.model'
import { projectModel } from '~/models/project.model'
import ApiError from '~/utils/ApiError'
import { StatusCodes } from 'http-status-codes'
import { pickSprint } from '~/utils/formatter'
import { boardColumnModel } from '~/models/boardColumn.model'
import { taskModel } from '~/models/task.model'
import { notificationService } from '~/services/notification.service'
import { userModel } from '~/models/user.model'

/**
 * Create a new sprint
 * @param req Sprint Data from request
 * @returns The created sprint document
 */
const createNew = async (req: Request): Promise<any> => {
  try {
    const { projectId, name, goal, maxStoryPoint, startDate, endDate } =
      req.body

    // Get user ID from JWT token
    const userId = req.jwtDecoded.id

    // Check if project exists
    const existingProject = await projectModel.findOneById(projectId)
    if (!existingProject) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Project not found')
    }

    // Check if user is member of the project
    const isMember = existingProject.members.some(
      (m) => m.memberId.toString() === userId && m.status === 'active'
    )
    if (!isMember && existingProject.ownerId.toString() !== userId) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'You are not a member of this project'
      )
    }

    // Check if user has permission to create sprint
    if (
      existingProject.members.find((m) => m.memberId.toString() === userId)
        ?.role !== 'owner' &&
      !isMember
    ) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'You do not have permission to create a sprint in this project'
      )
    }

    // Prepare new sprint data
    const newSprintData: any = {
      projectId,
      name,
      goal: goal || '',
      maxStoryPoint: maxStoryPoint || 0,
      startDate: startDate ? new Date(startDate).getTime() : Date.now(),
      endDate: endDate ? new Date(endDate).getTime() : Date.now()
    }

    const createdSprint = await sprintModel.createNew(newSprintData)

    if (!createdSprint) {
      throw new ApiError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Sprint creation failed'
      )
    }

    // Get creator info
    const creator = await userModel.findOneById(userId)

    // Notify project about new sprint
    await notificationService.createNotification(
      'sprint_created',
      'New Sprint Created',
      `${creator?.displayName} created sprint "${name}" in project "${existingProject.name}"`,
      '',
      projectId
    )

    // Notify to project owner
    await notificationService.createNotification(
      'sprint_created',
      'New Sprint Created',
      `You created a new sprint "${name}" in your project "${existingProject.name}"`,
      existingProject.ownerId.toString()
    )

    // Notify all active members
    for (const member of existingProject.members) {
      if (member.status !== 'active') continue
      if (member.memberId.toString() === existingProject.ownerId.toString())
        continue
      await notificationService.createNotification(
        'sprint_created',
        'New Sprint Created',
        `A new sprint "${name}" has been created in project "${existingProject.name}"`,
        member.memberId.toString()
      )
    }

    // Create template board columns for the new sprint
    const boardColumnTitles = [
      'backlog',
      'todo',
      'in_process',
      'review',
      'done'
    ]
    for (const title of boardColumnTitles) {
      // Prepare new board column data
      const createdColumn: any = {
        sprintId: createdSprint._id.toString(),
        title
      }
      await boardColumnModel.createNew(createdColumn)
    }

    return pickSprint(createdSprint)
  } catch (error: any) {
    throw error
  }
}

/**
 * Get sprint by id
 * @param req Request object containing sprint id
 * @returns Sprint data
 */
const getSprintById = async (req: Request): Promise<any> => {
  try {
    const { id } = req.params
    const userId = req.jwtDecoded.id

    const sprint = await sprintModel.findOneById(id)
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

    return pickSprint(sprint)
  } catch (error) {
    throw error
  }
}

/**
 * Get all sprints by project id
 * @param req Request object containing project id
 * @returns Array of sprints
 */
const getAllSprintsByProjectId = async (req: Request): Promise<any[]> => {
  try {
    const { projectId } = req.params
    const userId = req.jwtDecoded.id

    // Check if project exists
    const project = await projectModel.findOneById(projectId)
    if (!project) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Project not found')
    }

    // Check if user has access to the project
    const isMember = project.members.some(
      (m) => m.memberId.toString() === userId && m.status === 'active'
    )
    if (!isMember && project.ownerId.toString() !== userId) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'You do not have access to this project'
      )
    }

    const sprints = await sprintModel.findByProjectId(projectId)
    return sprints.map((sprint) => pickSprint(sprint))
  } catch (error) {
    throw error
  }
}

/**
 * Update sprint details
 * @param req Request object containing sprint update data
 * @returns The updated sprint document
 */
const updateSprint = async (req: Request): Promise<any> => {
  try {
    const { id } = req.params
    const userId = req.jwtDecoded.id

    const existingSprint = await sprintModel.findOneById(id)
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

    // Only project owner or member with 'owner' role can update sprint
    if (
      project.ownerId.toString() !== userId &&
      project.members.find((m) => m.memberId.toString() === userId)?.role !==
        'owner'
    ) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'You are not authorized to update this sprint'
      )
    }

    // Prepare update data
    const updateData: any = {
      ...req.body,
      updatedAt: Date.now()
    }

    const updatedSprint = await sprintModel.update(id, updateData)

    if (!updatedSprint) {
      throw new ApiError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Sprint update failed'
      )
    }

    // Check if sprint status changed to 'active' (started)
    if (req.body.status === 'active' && existingSprint.status !== 'active') {
      // Notify project about sprint start
      await notificationService.createNotification(
        'sprint_started',
        'Sprint Started',
        `Sprint "${existingSprint.name}" has started`,
        '',
        project._id.toString()
      )

      // Notify all active members
      for (const member of project.members) {
        if (member.status !== 'active') continue
        if (member.memberId.toString() === userId) continue

        await notificationService.createNotification(
          'sprint_started',
          'Sprint Started',
          `Sprint "${existingSprint.name}" has started in project "${project.name}"`,
          member.memberId.toString()
        )
      }
    }

    // Check if sprint status changed to 'completed'
    else if (
      req.body.status === 'completed' &&
      existingSprint.status !== 'completed'
    ) {
      // Notify project about sprint completion
      await notificationService.createNotification(
        'sprint_completed',
        'Sprint Completed',
        `Sprint "${existingSprint.name}" has been completed`,
        '',
        project._id.toString()
      )

      // Notify all active members
      for (const member of project.members) {
        if (member.status !== 'active') continue
        if (member.memberId.toString() === userId) continue
        await notificationService.createNotification(
          'sprint_completed',
          'Sprint Completed',
          `Sprint "${existingSprint.name}" has been completed in project "${project.name}"`,
          member.memberId.toString()
        )
      }
    } else {
      await notificationService.createNotification(
        'sprint_updated',
        'Sprint Updated',
        `Sprint "${existingSprint.name}" has been updated`,
        '',
        project._id.toString()
      )
    }
    return pickSprint(updatedSprint)
  } catch (error) {
    throw error
  }
}

/**
 * Delete sprint by id
 * @param req Request object containing sprint id
 */
const deleteSprintById = async (req: Request): Promise<void> => {
  try {
    const { id } = req.params
    const userId = req.jwtDecoded.id

    const existingSprint = await sprintModel.findOneById(id)
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

    if (
      project.ownerId.toString() !== userId &&
      project.members.find((m) => m.memberId.toString() === userId)?.role !==
        'owner'
    ) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'Only project owner can delete sprints'
      )
    }

    // Optionally, delete associated board columns and tasks here
    await boardColumnModel.deleteBySprintId(id)

    // Delete tasks associated with the sprint
    await taskModel.deleteBySprintId(id)

    // Finally, delete the sprint
    const result = await sprintModel.deleteById(id)

    if (!result) {
      throw new ApiError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Sprint deletion failed'
      )
    }

    // Notify project about sprint deletion
    await notificationService.createNotification(
      'sprint_deleted',
      'Sprint Deleted',
      `Sprint "${existingSprint.name}" has been deleted`,
      '',
      project._id.toString()
    )
  } catch (error: any) {
    throw error
  }
}

export const sprintService = {
  createNew,
  getSprintById,
  getAllSprintsByProjectId,
  updateSprint,
  deleteSprintById
}
