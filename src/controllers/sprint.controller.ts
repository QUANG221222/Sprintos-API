import { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'
import { sprintService } from '~/services/sprint.service'
import {
  CreateSprintRequest,
  CreateSprintResponse,
  UpdateSprintResponse,
  GetSprintResponse,
  GetAllSprintsResponse
} from '~/types/sprint.type'

/**
 * Create sprint controller
 * @param req request with CreateSprintRequest
 * @param res response with CreateSprintResponse
 * @param next handle next middleware
 */
const createSprint = async (
  req: Request<{}, {}, CreateSprintRequest, {}>,
  res: Response<CreateSprintResponse>,
  next: NextFunction
) => {
  try {
    const result = await sprintService.createNew(req)

    res.status(StatusCodes.CREATED).json({
      message: 'Sprint created successfully',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Get sprint by id controller
 * @param req request with sprint id
 * @param res response with sprint data
 * @param next handle next middleware
 */
const getSprintById = async (
  req: Request,
  res: Response<GetSprintResponse>,
  next: NextFunction
) => {
  try {
    const result = await sprintService.getSprintById(req)

    res.status(StatusCodes.OK).json({
      message: 'Sprint retrieved successfully',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Get all sprints by project id controller
 * @param req request with project id
 * @param res response with all sprints
 * @param next handle next middleware
 */
const getAllSprintsByProjectId = async (
  req: Request,
  res: Response<GetAllSprintsResponse>,
  next: NextFunction
) => {
  try {
    const sprints = await sprintService.getAllSprintsByProjectId(req)

    res.status(StatusCodes.OK).json({
      message: 'Sprints retrieved successfully',
      data: sprints
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Update sprint controller
 * @param req request with sprint id and update data
 * @param res response with updated sprint data
 * @param next handle next middleware
 */
const updateSprint = async (
  req: Request,
  res: Response<UpdateSprintResponse>,
  next: NextFunction
) => {
  try {
    const result = await sprintService.updateSprint(req)

    res.status(StatusCodes.OK).json({
      message: 'Sprint updated successfully',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Delete sprint controller
 * @param req request with sprint id
 * @param res response with success message
 * @param next handle next middleware
 */
const deleteSprintById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await sprintService.deleteSprintById(req)

    res.status(StatusCodes.OK).json({
      message: 'Sprint deleted successfully'
    })
  } catch (error) {
    next(error)
  }
}

export const sprintController = {
  createSprint,
  getSprintById,
  getAllSprintsByProjectId,
  updateSprint,
  deleteSprintById
}
