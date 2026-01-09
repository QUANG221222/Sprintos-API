import { Request } from 'express'
import { StatusCodes } from 'http-status-codes'
import { userModel } from '~/models/user.model'
import ApiError from '~/utils/ApiError'
import bcrypt from 'bcryptjs'
import { v7 as uuidv7 } from 'uuid'
import { pickUser } from '~/utils/formatter'
import { BrevoProvider } from '~/providers/BrevoProvider'
import { WEBSITE_DOMAIN } from '~/utils/constants'

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
      verifyToken: uuidv7()
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

export const authService = {
  register,
  verifyEmail
}
