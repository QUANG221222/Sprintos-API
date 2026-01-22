import { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'
import { notificationService } from '~/services/notification.service'

/**
 * Get notifications for a specific user
 * @param req request object
 * @param res response object
 * @param next next middleware function
 */
const getUserNotifications = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const notifications = await notificationService.getUserNotifications(req)
    res.status(StatusCodes.OK).json({
      message: 'Notifications retrieved successfully',
      data: notifications
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Get notifications for a specific user
 * @param req request object
 * @param res response object
 * @param next next middleware function
 */
const getProjectNotifications = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const notifications = await notificationService.getProjectNotifications(req)
    res.status(StatusCodes.OK).json({
      message: 'Project notifications retrieved successfully',
      data: notifications
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Get notifications for a specific task
 * @param req request object
 * @param res response object
 * @param next next middleware function
 */
const getTaskNotifications = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const notifications = await notificationService.getTaskNotifications(req)
    res.status(StatusCodes.OK).json({
      message: 'Task notifications retrieved successfully',
      data: notifications
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Get notifications for a specific user
 * @param req request object
 * @param res response object
 * @param next next middleware function
 */
const markAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notification = await notificationService.markAsRead(req)
    res.status(StatusCodes.OK).json({
      message: 'Notification marked as read',
      data: notification
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Get notifications for a specific user
 * @param req request object
 * @param res response object
 * @param next next middleware function
 */
const markAllAsRead = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await notificationService.markAllAsRead(req)
    res.status(StatusCodes.OK).json({
      message: 'All notifications marked as read'
    })
  } catch (error) {
    next(error)
  }
}

export const notificationController = {
  getUserNotifications,
  getProjectNotifications,
  getTaskNotifications,
  markAsRead,
  markAllAsRead
}
