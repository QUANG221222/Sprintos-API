/* eslint-disable no-console */
import { env } from '~/configs/environment'
import { Server as SocketIOServer } from 'socket.io'
import { Server as HttpServer } from 'http'
import { cookieOptions } from '~/configs/cookieOption'
import { notificationSocket } from '~/sockets/notification.socket'
import { projectChatSocket } from '~/sockets/projectChat.socket'

let io: SocketIOServer

const setupSocketEvents = (socket: any) => {
  /**
   * Project Chat Socket Events
   */
  // Handle user joining project chat room
  socket.on('join_project_chat', (roomId: string) =>
    projectChatSocket.handleJoinProjectChat(socket, roomId)
  )

  // Handle sending message in project chat
  socket.on('send_message', (messageData: any) =>
    projectChatSocket.handleSendMessage(socket, messageData)
  )

  // Handle deleting message in project chat
  socket.on('delete_message', (deleteData: any) =>
    projectChatSocket.handleDeleteMessage(socket, deleteData)
  )

  // Handle user typing in project chat
  socket.on('typing', (typingData: any) =>
    projectChatSocket.handleTyping(socket, typingData)
  )

  // Handle user stopped typing in project chat
  socket.on('stop_typing', (typingData: any) =>
    projectChatSocket.handleStopTyping(socket, typingData)
  )

  // Handle user leaving project chat room
  socket.on('leave_project_chat', (roomId: string) => {
    try {
      projectChatSocket.handleLeaveProjectChat(socket, roomId)
    } catch (error) {
      console.error('Error leaving project chat room:', error)
    }
  })

  /**
   * Notification Socket Events
   */
  // Handle user joining their notification room
  socket.on('join_notifications_for_user', (userId: string) =>
    notificationSocket.handleJoinNotificationsForUser(socket, userId)
  )

  // Handle user joining their project notification room
  socket.on('join_notifications_for_project', (projectId: string) =>
    notificationSocket.handleJoinNotificationsForProject(socket, projectId)
  )

  // Handle user joining their task notification room
  socket.on('join_notifications_for_task', (taskId: string) =>
    notificationSocket.handleJoinNotificationsForTask(socket, taskId)
  )

  // Handle mark notification as read
  socket.on('mark_read', (notificationId: string) =>
    notificationSocket.handleMarkNotificationAsRead(socket, notificationId)
  )

  // Handle mark all notifications as read
  socket.on('mark_all_read', (userId: string) =>
    notificationSocket.handleMarkAllNotificationsAsRead(socket, userId)
  )

  // Handle user disconnecting
  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id)
  })
}

const initializeSocket = (server: HttpServer): SocketIOServer => {
  // Initialize Socket.io server
  io = new SocketIOServer(server, {
    cors: {
      origin:
        env.BUILD_MODE === 'production'
          ? env.WEBSITE_DOMAIN_PRODUCTION
          : env.WEBSITE_DOMAIN_DEVELOPMENT,
      credentials: true
    },
    cookie: { ...cookieOptions, name: 'sprintos-socket-io' }
  })

  // // Middleware to authenticate socket connections
  // io.use(async (socket, next) => {
  //   try {
  //     const token =
  //       socket.handshake.auth.token ||
  //       socket.handshake.headers.authorization?.split(' ')[1]

  //     if (!token) {
  //       return next(new Error('Authentication error: No token provided'))
  //     }

  //     const decoded = JwtProvider.verifyToken(
  //       token,
  //       env.ACCESS_TOKEN_SECRET_SIGNATURE as string
  //     )
  //     socket.data.user = decoded
  //     next()
  //   } catch (error: any) {
  //     next(error)
  //   }
  // })

  io.on('connection', (socket: any) => {
    console.log('✅ User connected:', socket.id)
    setupSocketEvents(socket)
  })

  return io
}

const getIO = (): SocketIOServer => {
  if (!io) {
    throw new Error('Socket.io not initialized')
  }
  return io
}

export { initializeSocket, getIO }
