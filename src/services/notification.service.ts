import { Request } from 'express'
import { notificationModel } from '~/models/notification.model'
import { notificationSocket } from '~/sockets/notification.socket'

/**
 * Create a new notification
 * @param userId user to notify
 * @param projectId project related to the notification
 * @param type type of the notification
 * @param title title of the notification
 * @param message message of the notification
 * @returns created notification
 */
const createNotification = async (
  type: string,
  title: string,
  message: string,
  userId?: string,
  projectId?: string,
  taskId?: string
) => {
  try {
    let notification: any = null
    // Notify only user
    if (userId && !projectId && !taskId) {
      notification = await notificationSocket.sendNotificationToUser(userId, {
        type,
        title,
        message
      })
    }
    // Notify only project
    else if (!userId && projectId && !taskId) {
      notification = await notificationSocket.sendNotificationToProject(
        projectId,
        {
          type,
          title,
          message
        }
      )
    } else {
      // Notify only task
      notification = await notificationSocket.sendNotificationToTask(taskId!, {
        type,
        title,
        message
      })
    }
    return notification
  } catch (error) {
    throw error
  }
}

/**
 * Get notifications for a specific user
 * @param req request object
 * @returns list of notifications for the user
 */
const getUserNotifications = async (req: Request) => {
  try {
    // Get userId from req.jwtDecoded
    const userId = req.jwtDecoded.id

    const notifications = await notificationModel.findByUserId(userId)
    return notifications
  } catch (error) {
    throw error
  }
}

/**
 * Get notifications for a specific project
 * @param req request object
 * @returns list of notifications for the project
 */
const getProjectNotifications = async (req: Request) => {
  try {
    // Get projectId from req.params
    const { id } = req.params

    const notifications = await notificationModel.findByProjectId(id)
    return notifications
  } catch (error) {
    throw error
  }
}

/**
 * Get notifications for a specific task
 * @param req request object
 * @returns list of notifications for the task
 */
const getTaskNotifications = async (req: Request) => {
  try {
    // Get taskId from req.params
    const { id } = req.params
    const notifications = await notificationModel.findByTaskId(id)
    return notifications
  } catch (error) {
    throw error
  }
}

/**
 * Mark a specific notification as read
 * @param req request object
 * @returns updated notification
 */
const markAsRead = async (req: Request) => {
  try {
    const { id } = req.params
    const notification = await notificationModel.markAsRead(id)
    return notification
  } catch (error) {
    throw error
  }
}

/**
 * Mark all notifications as read for a specific user
 * @param req request object
 */
const markAllAsRead = async (req: Request) => {
  try {
    const userId = req.jwtDecoded.id
    await notificationModel.markAllAsRead(userId)
  } catch (error) {
    throw error
  }
}

export const notificationService = {
  createNotification,
  getUserNotifications,
  getProjectNotifications,
  getTaskNotifications,
  markAsRead,
  markAllAsRead
}
