/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
import { notificationModel } from '~/models/notification.model'
import { getIO } from '~/sockets/index.socket'

// Handle user joining their notification room
const handleJoinNotificationsForUser = (socket: any, userId: string) => {
  try {
    socket.join(`user_${userId}`)
    // console.log(`User ${userId} joined notifications room`)
  } catch (error) {
    console.error('Error joining notification room:', error)
  }
}

// Handle user joining their project notification room
const handleJoinNotificationsForProject = (socket: any, projectId: string) => {
  try {
    socket.join(`project_${projectId}`)
    // console.log(`Project ${projectId} joined project notifications room`)
  } catch (error) {
    console.error('Error joining project notification room:', error)
  }
}

// Handle user joining their task notification room
const handleJoinNotificationsForTask = (socket: any, taskId: string) => {
  try {
    socket.join(`task_${taskId}`)
    // console.log(`Task ${taskId} joined task notifications room`)
  } catch (error) {
    console.error('Error joining task notification room:', error)
  }
}

// Handle making a notification as read
const handleMarkNotificationAsRead = async (
  socket: any,
  notificationId: string
) => {
  try {
    await notificationModel.markAsRead(notificationId)
    // socket.emit('notification_marked_read', { notificationId })
  } catch (error) {
    socket.emit('error', { message: 'Failed to mark notification as read' })
  }
}

// Handle mark all notifications as read
const handleMarkAllNotificationsAsRead = async (
  socket: any,
  userId: string
) => {
  try {
    await notificationModel.markAllAsRead(userId)
    // socket.emit('all_notifications_marked_read')
  } catch (error) {
    socket.emit('error', {
      message: 'Failed to mark all notifications as read'
    })
  }
}

// Helper function to send notification to specific user
const sendNotificationToUser = async (userId: string, notification: any) => {
  try {
    if (!getIO()) {
      throw new Error('Socket.io not initialized')
    }

    // Save notification to database
    const savedNotification = await notificationModel.createNew({
      userId,
      ...notification
    })

    // Emit notification to user
    getIO().to(`user_${userId}`).emit('user_notification', savedNotification)

    return savedNotification
  } catch (error) {
    throw error
  }
}

// Helper function to send notification to specific project
const sendNotificationToProject = async (
  projectId: string,
  notification: any
) => {
  try {
    if (!getIO()) {
      throw new Error('Socket.io not initialized')
    }

    // Save notification to database
    const savedNotification = await notificationModel.createNew({
      projectId,
      ...notification
    })
    // Emit notification to project room
    getIO()
      .to(`project_${projectId}`)
      .emit('project_notification', savedNotification)
  } catch (error) {
    throw error
  }
}

// Helper function to send notification to specific task
const sendNotificationToTask = async (taskId: string, notification: any) => {
  try {
    if (!getIO()) {
      throw new Error('Socket.io not initialized')
    }
    // Save notification to database
    const savedNotification = await notificationModel.createNew({
      taskId,
      ...notification
    })
    // Emit notification to task room
    getIO().to(`task_${taskId}`).emit('task_notification', savedNotification)
  } catch (error) {
    throw error
  }
}

export const notificationSocket = {
  handleJoinNotificationsForUser,
  handleJoinNotificationsForProject,
  handleJoinNotificationsForTask,
  handleMarkNotificationAsRead,
  handleMarkAllNotificationsAsRead,
  sendNotificationToUser,
  sendNotificationToProject,
  sendNotificationToTask
}
