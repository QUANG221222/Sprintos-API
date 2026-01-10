import { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'
import { UpdateUserResponse, GetUserResponse } from '~/types/user.type'
import { userService } from '~/services/user.service'

/**
 * Get user profile controller
 * @param req None request
 * @param res Response with user profile data
 * @param next Handle next middleware
 */
const getProfile = async (
  req: Request,
  res: Response<GetUserResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await userService.getProfile(req)

    res.status(StatusCodes.OK).json({
      message: 'User profile retrieved successfully',
      data: result
    })
  } catch (error: any) {
    next(error)
  }
}

/**
 * Update user controller
 * @param req Request with update data
 * @param res Response with updated user data
 * @param next Handle next middleware
 */
const update = async (
  req: Request,
  res: Response<UpdateUserResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await userService.update(req)

    res.status(StatusCodes.OK).json({
      message: 'User updated successfully',
      data: result
    })
  } catch (error: any) {
    next(error)
  }
}

export const userController = {
  getProfile,
  update
}
