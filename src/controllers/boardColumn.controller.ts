import { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'
import { boardColumnService } from '~/services/boardColumn.service'
import {
  CreateBoardColumnRequest,
  CreateBoardColumnResponse,
  UpdateBoardColumnResponse,
  GetBoardColumnResponse,
  GetAllBoardColumnsResponse
} from '~/types/boardColumn.type'

/**
 * Create board column controller
 * @param req request with CreateBoardColumnRequest
 * @param res response with CreateBoardColumnResponse
 * @param next handle next middleware
 */
const createBoardColumn = async (
  req: Request<{}, {}, CreateBoardColumnRequest, {}>,
  res: Response<CreateBoardColumnResponse>,
  next: NextFunction
) => {
  try {
    const result = await boardColumnService.createNew(req)

    res.status(StatusCodes.CREATED).json({
      message: 'Board column created successfully',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Get board column by id controller
 * @param req request with column id
 * @param res response with board column data
 * @param next handle next middleware
 */
const getBoardColumnById = async (
  req: Request,
  res: Response<GetBoardColumnResponse>,
  next: NextFunction
) => {
  try {
    const result = await boardColumnService.getBoardColumnById(req)

    res.status(StatusCodes.OK).json({
      message: 'Board column retrieved successfully',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Get all board columns by sprint id controller
 * @param req request with sprint id
 * @param res response with all board columns
 * @param next handle next middleware
 */
const getAllBoardColumnsBySprintId = async (
  req: Request,
  res: Response<GetAllBoardColumnsResponse>,
  next: NextFunction
) => {
  try {
    const columns = await boardColumnService.getAllBoardColumnsBySprintId(req)

    res.status(StatusCodes.OK).json({
      message: 'Board columns retrieved successfully',
      data: columns
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Update board column controller
 * @param req request with column id and update data
 * @param res response with updated board column data
 * @param next handle next middleware
 */
const updateBoardColumn = async (
  req: Request,
  res: Response<UpdateBoardColumnResponse>,
  next: NextFunction
) => {
  try {
    const result = await boardColumnService.updateBoardColumn(req)

    res.status(StatusCodes.OK).json({
      message: 'Board column updated successfully',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Delete board column controller
 * @param req request with column id
 * @param res response with success message
 * @param next handle next middleware
 */
const deleteBoardColumnById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await boardColumnService.deleteBoardColumnById(req)

    res.status(StatusCodes.OK).json({
      message: 'Board column deleted successfully'
    })
  } catch (error) {
    next(error)
  }
}

export const boardColumnController = {
  createBoardColumn,
  getBoardColumnById,
  getAllBoardColumnsBySprintId,
  updateBoardColumn,
  deleteBoardColumnById
}
