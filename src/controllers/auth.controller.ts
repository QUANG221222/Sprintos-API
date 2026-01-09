import e, { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'
import { authService } from '~/services/auth.service'
import {
  CreateUserResponse,
  CreateUserRequest,
  VerifyEmailRequest,
  VerifyEmailResponse,
  LoginRequest,
  LoginResponse,
  RefreshTokenRequest,
  RefreshTokenResponse
} from '~/types/user.type'
import { cookieOptions } from '~/configs/cookieOption'

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

/**
 * User login
 * @param req LoginRequest object containing login details
 * @param res LoginResponse object containing response message and data
 * @param next NextFunction for error handling
 */
const login = async (
  req: Request<{}, {}, LoginRequest, {}>,
  res: Response<LoginResponse>,
  next: NextFunction
) => {
  try {
    const result = await authService.login(req)

    res.cookie('userRole', result.role, cookieOptions)

    res.cookie('accessToken', result.accessToken, cookieOptions)

    res.cookie('refreshToken', result.refreshToken, cookieOptions)

    res.status(StatusCodes.OK).json({
      message: 'Login successful',
      data: result
    })
  } catch (error: any) {
    next(error)
  }
}

/**
 * Refresh access token
 * @param req Express request object containing refresh token in cookies
 * @param res Express response object to send the new access token
 * @param next NextFunction for error handling
 */
const refreshToken = async (
  req: Request<{}, {}, RefreshTokenRequest, {}>,
  res: Response<RefreshTokenResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await authService.refreshToken(req.cookies?.refreshToken)

    res.cookie('accessToken', result.accessToken, cookieOptions)

    res.status(StatusCodes.OK).json({
      message: 'Token refreshed successfully',
      accessToken: result.accessToken
    })
  } catch (error: any) {
    next(error)
  }
}

export const authController = {
  register,
  verifyEmail,
  login,
  refreshToken
}
