import Joi from 'joi'
import { ObjectId } from 'mongodb'
import { GET_DB } from '~/configs/mongodb'
import { IUser } from '~/types/user.type'
import { EMAIL_RULE, PASSWORD_RULE, USER_ROLES } from '~/utils/validator'

const COLLECTION_NAME = 'users'
const USER_COLLECTION_SCHEMA: Joi.ObjectSchema<IUser> = Joi.object({
  email: Joi.string().pattern(EMAIL_RULE).required(),
  password: Joi.string().pattern(PASSWORD_RULE).required(),
  displayName: Joi.string().min(3).max(100).required(),
  role: Joi.string().default(USER_ROLES.USER),
  isActive: Joi.boolean().default(false),
  verifyToken: Joi.string().optional(),
  address: Joi.string().optional().allow(null),
  dob: Joi.date().optional().allow(null),
  gender: Joi.string().valid('male', 'female', 'other').optional().allow(null),
  avatar: Joi.string().optional().allow(null),
  avatarPublicId: Joi.string().optional().allow(null),
  createdAt: Joi.date().timestamp('javascript').default(Date.now),
  updatedAt: Joi.date().timestamp('javascript').default(null)
})

const INVALID_UPDATE_FIELDS = ['_id', 'email', 'role', 'createdAt']

/**
 * Create a new user in the database
 * @param userData Partial user data to create a new user
 */
const createNew = async (userData: Partial<IUser>): Promise<any> => {
  try {
    const validatedUserData = await USER_COLLECTION_SCHEMA.validateAsync(
      userData,
      {
        abortEarly: false
      }
    )

    const createdUser = await GET_DB()
      .collection(COLLECTION_NAME)
      .insertOne(validatedUserData)

    return createdUser
  } catch (error: any) {
    throw new Error(error)
  }
}

/**
 * Find a user by email
 * @param email User's email
 * @returns The user document or null if not found
 */
const findOneByEmail = async (email: string): Promise<IUser | null> => {
  try {
    const result = await GET_DB()
      .collection(COLLECTION_NAME)
      .findOne({ email: email })

    return result as IUser | null
  } catch (error: any) {
    throw new Error(error)
  }
}

/**
 * Find a user by ID
 * @param id User's ID
 * @returns The user document or null if not found
 */
const findOneById = async (id: string): Promise<IUser | null> => {
  try {
    const result = await GET_DB()
      .collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id) })
    return result as IUser | null
  } catch (error: any) {
    throw new Error(error)
  }
}

/** * Update a user by ID
 * @param id User's ID
 * @param updateData Partial user data to update
 * @returns The updated user document or null if not found
 */
const update = async (id: string, updateData: Partial<IUser>): Promise<any> => {
  try {
    // Remove invalid fields from updateData
    Object.keys(updateData).forEach((key) => {
      if (INVALID_UPDATE_FIELDS.includes(key)) {
        delete updateData[key as keyof Partial<IUser>]
      }
    })

    const updatedUser = await GET_DB()
      .collection(COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateData },
        { returnDocument: 'after' }
      )

    return updatedUser as IUser | null
  } catch (error: any) {
    throw new Error(error)
  }
}

export const userModel = {
  createNew,
  findOneByEmail,
  findOneById,
  update
}
