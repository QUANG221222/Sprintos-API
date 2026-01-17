import { Request } from 'express'
import { StatusCodes } from 'http-status-codes'
import { userModel } from '~/models/user.model'
import ApiError from '~/utils/ApiError'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { pickUser } from '~/utils/formatter'
import { BrevoProvider } from '~/providers/BrevoProvider'
import { WEBSITE_DOMAIN } from '~/utils/constants'
import { JwtProvider } from '~/providers/JwtProvider'
import { env } from '~/configs/environment'

/**
 * Create a new user
 * @param req Express request object containing user data
 * @returns The created user data
 */
const register = async (req: Request): Promise<any> => {
  try {
    const { email, password } = req.body

    // Check if user already exists
    const exitingUser = await userModel.findOneByEmail(email)

    if (exitingUser) {
      throw new ApiError(StatusCodes.CONFLICT, 'Email already in use')
    }

    // Generate display name from email
    const nameFromEmail = (email as string).split('@')[0]

    // Prepare new user data
    const newUserData = {
      email,
      password: await bcrypt.hash(password as string, 8),
      displayName: nameFromEmail,
      isActive: false,
      verifyToken: uuidv4()
    }

    // Create new user
    const createdUser = await userModel.createNew(newUserData)

    // Get new user info
    const getNewUser = await userModel.findOneById(
      createdUser.insertedId.toString()
    )

    if (!getNewUser) {
      throw new ApiError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Failed to retrieve newly created user.'
      )
    }

    // Send a welcome email to the new user
    const verificationLink = `${WEBSITE_DOMAIN}/user/account/verification?email=${getNewUser.email}&token=${getNewUser.verifyToken}`
    const customSubject =
      'Sprintos: Please verify your email before using our services!'
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 32px 0;">
      <div style="max-width: 480px; margin: auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.07); padding: 32px;">
        <h2 style="color: #2d8cf0; margin-bottom: 16px;">Verify Your Email</h2>
        <p style="font-size: 16px; color: #333;">Thank you for registering with <b>Sprintos</b>!</p>
        <p style="font-size: 15px; color: #444;">Please click the button below to verify your email address:</p>
        <a href="${verificationLink}" style="display: flex;
        justify-content: center; align-items: center; margin: 24px 0; padding: 12px 28px; background: #2d8cf0; color: #fff; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">Verify Email</a>
        <p style="font-size: 13px; color: #888;">If the button doesn't work, copy and paste this link into your browser:</p>
        <div style="word-break: break-all; background: #f4f4f4; padding: 8px 12px; border-radius: 4px; font-size: 13px; color: #2d8cf0;">${verificationLink}</div>
        <hr style="margin: 32px 0 16px 0; border: none; border-top: 1px solid #eee;">
        <div style="font-size: 13px; color: #888;">
        Sincerely,<br/>
        <b>Sprintos Team</b>
        </div>
      </div>
      </div>
    `

    await BrevoProvider.sendEmail(getNewUser.email, customSubject, htmlContent)

    return pickUser(getNewUser)
  } catch (error) {
    throw error
  }
}

/**
 * Verify user email
 * @param req Express request object containing email and token
 * @returns user data after verification
 */
const verifyEmail = async (req: any) => {
  try {
    const { email, token } = req.body

    const existingUser: any | null = await userModel.findOneByEmail(email)

    if (!existingUser) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'User not found')
    }

    if (existingUser.isActive) {
      throw new ApiError(StatusCodes.NOT_ACCEPTABLE, 'User already verified')
    }

    if (existingUser.verifyToken !== token) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'Invalid verification token')
    }

    const updateUser = {
      isActive: true,
      verifyToken: ''
    }

    if (!existingUser._id) {
      throw new ApiError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        'User ID is missing'
      )
    }

    // Update user status to active
    const updatedUser = await userModel.update(
      existingUser._id.toString(),
      updateUser
    )

    return pickUser(updatedUser)
  } catch (error) {
    throw error
  }
}

/**
 * User login
 * @param req Express request object containing login details
 * @returns User data along with access and refresh tokens
 */
const login = async (req: any) => {
  try {
    const { email, password } = req.body

    const existingUser = await userModel.findOneByEmail(email)

    if (!existingUser) {
      throw new ApiError(
        StatusCodes.NOT_ACCEPTABLE,
        'Your Email or Password is incorrect!'
      )
    }

    if (!existingUser.isActive) {
      throw new ApiError(
        StatusCodes.NOT_ACCEPTABLE,
        'Your account is not active! Please verify your email!'
      )
    }

    if (!bcrypt.compareSync(password, existingUser.password)) {
      throw new ApiError(
        StatusCodes.NOT_ACCEPTABLE,
        'Your Email of Password is incorrect!'
      )
    }

    const userInfo = {
      id: existingUser._id,
      email: existingUser.email,
      role: existingUser.role
    }

    const accessToken = await JwtProvider.generateToken(
      userInfo,
      env.ACCESS_TOKEN_SECRET_SIGNATURE as string,
      env.ACCESS_TOKEN_LIFE as string
      // 5 // 5 seconds for testing access token refresh
    )

    const refreshToken = await JwtProvider.generateToken(
      userInfo,
      env.REFRESH_TOKEN_SECRET_SIGNATURE as string,
      env.REFRESH_TOKEN_LIFE as string
      // 15 // 15 seconds for testing refresh token refresh
    )

    return {
      accessToken,
      refreshToken,
      ...pickUser(existingUser)
    }
  } catch (error) {
    throw error
  }
}

/**
 * Refresh access token
 * @param clientRefreshToken The refresh token received from client
 * @returns New access token
 */
const refreshToken = async (clientRefreshToken: string): Promise<any> => {
  try {
    // Verify token received from client
    const refreshTokenDecoded = JwtProvider.verifyToken(
      clientRefreshToken,
      env.REFRESH_TOKEN_SECRET_SIGNATURE as string
    )

    // console.log('refreshTokenDecoded', refreshTokenDecoded)

    // We only store unique, immutable user info in the refresh token (e.g. _id, email),
    // so we can reuse the decoded payload directly instead of querying the database.
    const userInfo = {
      id: (refreshTokenDecoded as any).id as string,
      email: (refreshTokenDecoded as any).email as string,
      role: (refreshTokenDecoded as any).role as string
    }

    // Create new accessToken
    const accessToken = await JwtProvider.generateToken(
      userInfo,
      env.ACCESS_TOKEN_SECRET_SIGNATURE as string,
      // 5 // 5 seconds for testing access token refresh
      env.ACCESS_TOKEN_LIFE as string
    )
    return { accessToken }
  } catch (error) {
    throw error
  }
}

/**
 * Change user password
 * @param req Express request object containing old and new passwords
 * @returns Updated user data
 */
const changePassword = async (req: any) => {
  try {
    const { oldPassword, newPassword } = req.body
    const userId = req.jwtDecoded.id

    const existingUser: any | null = await userModel.findOneById(userId)
    if (!existingUser) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'User not found')
    }

    if (!bcrypt.compareSync(oldPassword, existingUser.password)) {
      throw new ApiError(
        StatusCodes.NOT_ACCEPTABLE,
        'Your old password is incorrect!'
      )
    }
    const hashedNewPassword = bcrypt.hashSync(newPassword, 10)
    const updateUser = {
      password: hashedNewPassword
    }

    const updatedUser = await userModel.update(
      existingUser._id.toString(),
      updateUser
    )

    return pickUser(updatedUser)
  } catch (error) {
    throw error
  }
}

export const authService = {
  register,
  verifyEmail,
  login,
  refreshToken,
  changePassword
}
