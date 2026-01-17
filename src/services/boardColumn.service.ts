import { Request } from 'express'
import { boardColumnModel } from '~/models/boardColumn.model'
import { sprintModel } from '~/models/sprint.model'
import { projectModel } from '~/models/project.model'
import ApiError from '~/utils/ApiError'
import { StatusCodes } from 'http-status-codes'
import { pickBoardColumn } from '~/utils/formatter'
import { taskModel } from '~/models/task.model'

/**
 * Create a new board column
 * @param req Board Column Data from request
 * @returns The created board column document
 */
const createNew = async (req: Request): Promise<any> => {
  try {
    const { sprintId, title } = req.body
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

    const isMember = project.members.some(
      (m) => m.memberId.toString() === userId && m.status === 'active'
    )

    if (!isMember && project.ownerId.toString() !== userId) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'You are not a member of this project'
      )
    }

    // Check if user has permission to create board column
    if (
      project.members.find((m) => m.memberId.toString() === userId)?.role !==
        'owner' &&
      !isMember
    ) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'You do not have permission to create a board column in this sprint'
      )
    }

    // Check if column with same title already exists in this sprint
    const existingColumns = await boardColumnModel.findBySprintId(sprintId)
    const isDuplicate = existingColumns.some((col) => col.title === title)
    if (isDuplicate) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        `Column with title "${title}" already exists in this sprint`
      )
    }

    // Prepare new board column data
    const newColumnData: any = {
      sprintId,
      title,
      taskOrderIds: []
    }

    const createdColumn = await boardColumnModel.createNew(newColumnData)

    return pickBoardColumn(createdColumn)
  } catch (error: any) {
    throw error
  }
}

/**
 * Get board column by id
 * @param req Request object containing column id
 * @returns Board column data
 */
const getBoardColumnById = async (req: Request): Promise<any> => {
  try {
    const { id } = req.params
    const userId = req.jwtDecoded.id

    const column = await boardColumnModel.findOneById(id)
    if (!column) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Board column not found')
    }

    // Check if user has access to the project
    const sprint = await sprintModel.findOneById(column.sprintId.toString())
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

    return pickBoardColumn(column)
  } catch (error) {
    throw error
  }
}

/**
 * Get all board columns by sprint id
 * @param req Request object containing sprint id
 * @returns Array of board columns
 */
const getAllBoardColumnsBySprintId = async (req: Request): Promise<any[]> => {
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

    const columns = await boardColumnModel.findBySprintId(sprintId)

    return columns.map((column) => pickBoardColumn(column))
  } catch (error) {
    throw error
  }
}

/**
 * Update board column details
 * @param req Request object containing board column update data
 * @returns The updated board column document
 */
const updateBoardColumn = async (req: Request): Promise<any> => {
  try {
    const { id } = req.params
    const userId = req.jwtDecoded.id

    const existingColumn = await boardColumnModel.findOneById(id)
    if (!existingColumn) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Board column not found')
    }

    // Prevent updates backlog column
    if (existingColumn.title.toLowerCase() === 'backlog' && req.body.title) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        'Backlog column cannot be updated'
      )
    }

    // Check if user has access to the project
    const sprint = await sprintModel.findOneById(
      existingColumn.sprintId.toString()
    )
    if (!sprint) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Sprint not found')
    }

    const project = await projectModel.findOneById(sprint.projectId.toString())
    if (!project) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Project not found')
    }

    // Only project owner or member with 'owner' role can update board column
    if (
      project.ownerId.toString() !== userId &&
      project.members.find((m) => m.memberId.toString() === userId)?.role !==
        'owner'
    ) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'You are not authorized to update this board column'
      )
    }

    // If updating title, check for duplicates
    if (req.body.title && req.body.title !== existingColumn.title) {
      const existingColumns = await boardColumnModel.findBySprintId(
        existingColumn.sprintId.toString()
      )
      const isDuplicate = existingColumns.some(
        (col) =>
          col.title === req.body.title &&
          col._id?.toString() !== existingColumn._id?.toString()
      )
      if (isDuplicate) {
        throw new ApiError(
          StatusCodes.BAD_REQUEST,
          `Column with title "${req.body.title}" already exists in this sprint`
        )
      }
    }

    // Prepare update data
    const updateData: any = {
      ...req.body,
      updatedAt: Date.now()
    }

    const updatedColumn = await boardColumnModel.update(id, updateData)

    return pickBoardColumn(updatedColumn)
  } catch (error) {
    throw error
  }
}

/**
 * Delete board column by id
 * @param req Request object containing board column id
 */
const deleteBoardColumnById = async (req: Request): Promise<void> => {
  try {
    const { id } = req.params
    const userId = req.jwtDecoded.id

    const existingColumn = await boardColumnModel.findOneById(id)
    if (!existingColumn) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Board column not found')
    }

    // Prevent deletion of backlog column
    if (existingColumn.title.toLowerCase() === 'backlog') {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        'Backlog column cannot be deleted'
      )
    }

    // Check if user has access to the project
    const sprint = await sprintModel.findOneById(
      existingColumn.sprintId.toString()
    )
    if (!sprint) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Sprint not found')
    }

    const project = await projectModel.findOneById(sprint.projectId.toString())
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
        'Only project owner can delete board columns'
      )
    }

    await boardColumnModel.deleteById(id)

    // Optionally, handle tasks associated with this column here
    await taskModel.deleteByBoardColumnId(id)
  } catch (error: any) {
    throw error
  }
}

export const boardColumnService = {
  createNew,
  getBoardColumnById,
  getAllBoardColumnsBySprintId,
  updateBoardColumn,
  deleteBoardColumnById
}
