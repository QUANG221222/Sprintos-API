import { Request } from 'express'
import { sprintModel } from '~/models/sprint.model'
import { projectModel } from '~/models/project.model'
import ApiError from '~/utils/ApiError'
import { StatusCodes } from 'http-status-codes'
import { pickSprint } from '~/utils/formatter'

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

    await sprintModel.deleteById(id)
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
