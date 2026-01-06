import { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'
import { authService } from '~/services/auth.service'
import { CreateUserResponse, CreateUserRequest } from '~/types/user.type'

/**
 * Create a new user
 * @param req CreateUserRequest object containing user details
 * @param res CreateUserResponse object containing response message and data
 * @param next NextFunction for error handling
 * @returns A promise that resolves when the user is created
 */
const register = async (
  req: Request<{}, {}, CreateUserRequest, {}>,
  res: Response<CreateUserResponse>,
  next: NextFunction
): Promise<any> => {
  try {
    const createUser = await authService.register(req)

    res.status(StatusCodes.CREATED).json({
      message: 'User created successfully',
      data: createUser
    })
  } catch (error: any) {
    next(error)
  }
}
export const authController = {
  register
}
