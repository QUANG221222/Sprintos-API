/* eslint-disable no-console */
import { env } from '~/configs/environment'
import { Server as SocketIOServer } from 'socket.io'
import { Server as HttpServer } from 'http'
import { cookieOptions } from '~/configs/cookieOption'
// import { JwtProvider } from '~/providers/JwtProvider'
import { notificationSocket } from '~/sockets/notification.socket'

let io: SocketIOServer

const setupSocketEvents = (socket: any) => {
  // Handle user joining their notification room
  socket.on('join_notifications', (userId: string) =>
    notificationSocket.handleJoinNotifications(socket, userId)
  )

  // Handle mark notification as read
  socket.on('mark_read', (notificationId: string) =>
    notificationSocket.handleMarkNotificationAsRead(socket, notificationId)
  )

  // Handle mark all notifications as read
  socket.on('mark_all_read', (userId: string) =>
    notificationSocket.handleMarkAllNotificationsAsRead(socket, userId)
  )

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
