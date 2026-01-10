import { Request } from 'express'
import { StatusCodes } from 'http-status-codes'
import { userModel } from '~/models/user.model'
import ApiError from '~/utils/ApiError'
import { pickUser } from '~/utils/formatter'
import { CloudinaryProvider } from '~/providers/CloudinaryProvider'

/**
 * Get user profile service
 * @param req Request object
 * @returns User profile data
 */
const getProfile = async (req: Request): Promise<any> => {
  try {
    const userId = req.jwtDecoded.id

    const user = await userModel.findOneById(userId)
    if (!user) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'User not found')
    }

    return pickUser(user)
  } catch (error) {
    throw error
  }
}

/**
 * Update user service
 * @param req Request object
 * @returns  Updated user data
 */
const update = async (req: Request): Promise<any> => {
  try {
    // Get user ID from JWT token
    const userId = req.jwtDecoded.id

    // Find user
    const user = await userModel.findOneById(userId)
    if (!user) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'User not found')
    }

    // Handle avatar upload if file is provided
    if (req.file) {
      // Delete old avatar from Cloudinary if exists
      if (user.avatarPublicId) {
        await CloudinaryProvider.deleteImage(user.avatarPublicId)
      }

      // ✅ Save both avatar URL and public_id from Cloudinary
      req.body.avatar = req.file.path
      req.body.avatarPublicId = (req.file as any).filename // Cloudinary public_id
    }

    // Prepare update data
    const updateData = { updatedAt: Date.now(), ...req.body }

    // Update user in database
    const updatedUser = await userModel.update(userId, updateData)

    return pickUser(updatedUser)
  } catch (error) {
    throw error
  }
}

export const userService = {
  getProfile,
  update
}
