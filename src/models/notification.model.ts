import Joi from 'joi'
import { ObjectId } from 'mongodb'
import { GET_DB } from '~/configs/mongodb'
import { INotification } from '~/types/notification.type'
import { OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validator'
import { NOTIFICATION_TYPES } from '~/utils/validator'

const COLLECTION_NAME = 'notifications'

const NOTIFICATION_SCHEMA: Joi.ObjectSchema<INotification> = Joi.object({
  userId: Joi.string()
    .pattern(OBJECT_ID_RULE)
    .message(OBJECT_ID_RULE_MESSAGE)
    .optional(),
  projectId: Joi.string()
    .pattern(OBJECT_ID_RULE)
    .message(OBJECT_ID_RULE_MESSAGE)
    .optional(),
  taskId: Joi.string()
    .pattern(OBJECT_ID_RULE)
    .message(OBJECT_ID_RULE_MESSAGE)
    .optional(),
  type: Joi.string()
    .valid(...Object.values(NOTIFICATION_TYPES))
    .required(),
  title: Joi.string().required(),
  message: Joi.string().required(),
  isRead: Joi.boolean().default(false),
  createdAt: Joi.date().timestamp('javascript').default(Date.now)
})

/**
 * Create a new notification
 * @param notificationData data of the notification
 * @returns the created notification
 */
const createNew = async (notificationData: any) => {
  try {
    const validatedData =
      await NOTIFICATION_SCHEMA.validateAsync(notificationData)

    if (validatedData.userId) {
      validatedData.userId = new ObjectId(validatedData.userId)
    }

    if (validatedData.projectId) {
      validatedData.projectId = new ObjectId(validatedData.projectId)
    }

    if (validatedData.taskId) {
      validatedData.taskId = new ObjectId(validatedData.taskId)
    }

    const newNotification = {
      ...validatedData
    }

    const result = await GET_DB()
      .collection(COLLECTION_NAME)
      .insertOne(newNotification)

    return await findOneById(result.insertedId.toString())
  } catch (error) {
    throw new Error(error as string)
  }
}

/**
 * Find one notification by ID
 * @param id id of the notification
 * @returns detailed notification information
 */
const findOneById = async (id: string) => {
  try {
    const result = await GET_DB()
      .collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id) })
    return result
  } catch (error) {
    throw new Error(error as string)
  }
}

/**
 * Find notifications by user ID
 * @param userId id of the user
 * @returns list of notifications for the user
 */
const findByUserId = async (userId: string) => {
  try {
    const results = await GET_DB()
      .collection(COLLECTION_NAME)
      .find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray()
    return results
  } catch (error) {
    throw new Error(error as string)
  }
}

/**
 * Find notifications by project ID
 * @param projectId id of the project
 * @returns list of notifications for the project
 */
const findByProjectId = async (projectId: string) => {
  try {
    const results = await GET_DB()
      .collection(COLLECTION_NAME)
      .find({ projectId: new ObjectId(projectId) })
      .sort({ createdAt: -1 })
      .toArray()
    return results
  } catch (error) {
    throw new Error(error as string)
  }
}

/**
 * Find notifications by task ID
 * @param taskId id of the task
 * @returns list of notifications for the task
 */
const findByTaskId = async (taskId: string) => {
  try {
    const results = await GET_DB()
      .collection(COLLECTION_NAME)
      .find({ taskId: new ObjectId(taskId) })
      .sort({ createdAt: -1 })
      .toArray()
    return results
  } catch (error) {
    throw new Error(error as string)
  }
}

/**
 * Mark a notification as read
 * @param id id of the notification
 * @returns the updated notification
 */
const markAsRead = async (id: string) => {
  try {
    const result = await GET_DB()
      .collection(COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { isRead: true } },
        { returnDocument: 'after' }
      )
    return result
  } catch (error) {
    throw new Error(error as string)
  }
}

/**
 * Mark all notifications as read for a user
 * @param userId id of the user
 */
const markAllAsRead = async (userId: string) => {
  try {
    await GET_DB()
      .collection(COLLECTION_NAME)
      .updateMany(
        { userId: new ObjectId(userId), isRead: false },
        { $set: { isRead: true } }
      )
  } catch (error) {
    throw new Error(error as string)
  }
}

export const notificationModel = {
  createNew,
  findOneById,
  findByUserId,
  findByProjectId,
  findByTaskId,
  markAsRead,
  markAllAsRead
}
