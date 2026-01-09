import { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'
import { authService } from '~/services/auth.service'
import {
  CreateUserResponse,
  CreateUserRequest,
  VerifyEmailRequest,
  VerifyEmailResponse
} from '~/types/user.type'

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

/**
 * Verify user email
 * @param req VerifyEmailRequest object containing email and token
 * @param res VerifyEmailResponse object containing response message and data
 * @param next NextFunction for error handling
 */
const verifyEmail = async (
  req: Request<{}, {}, VerifyEmailRequest, {}>,
  res: Response<VerifyEmailResponse>,
  next: NextFunction
) => {
  try {
    const result = await authService.verifyEmail(req)

    res.status(StatusCodes.OK).json({
      message: 'Email verified successfully',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

export const authController = {
  register,
  verifyEmail
}
