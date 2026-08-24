import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { Logger } from '@nestjs/common'
import { TokenService } from '~/shared/services/token.service'
import { authenticateSocket } from '~/shared/helpers/ws-auth.helper'
import envConfig from '~/shared/config'

@WebSocketGateway({
  cors: {
    origin: [envConfig.WEBSITE_DOMAIN_DEVELOPMENT, envConfig.WEBSITE_DOMAIN_PRODUCTION],
    credentials: true
  }
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server

  private readonly logger = new Logger(NotificationGateway.name)

  constructor(private readonly tokenService: TokenService) {}

  async handleConnection(client: Socket) {
    const user = await authenticateSocket(client, this.tokenService)
    if (!user) {
      this.logger.warn(`Unauthorized notification socket connection: ${client.id}`)
      // Cho phep client gui subscribe_notifications sau khi handshake
      return
    }

    const userRoom = `user:${user.userId}`
    client.join(userRoom)
    this.logger.log(`User ${user.userId} connected and joined room: ${userRoom}`)
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Notification socket client disconnected: ${client.id}`)
  }

  @SubscribeMessage('subscribe_notifications')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data?: { userId?: string }
  ) {
    const userId = client.data?.user?.userId || data?.userId
    if (userId) {
      const userRoom = `user:${userId}`
      client.join(userRoom)
      this.logger.log(`Client ${client.id} explicitly joined notification room: ${userRoom}`)
      return { status: 'subscribed', room: userRoom }
    }
  }

  /**
   * Gửi thông báo realtime đến một người dùng cụ thể
   */
  sendToUser(userId: string, notification: any) {
    if (this.server) {
      this.server.to(`user:${userId}`).emit('notification:received', notification)
      this.logger.log(`Emitted notification:received to user:${userId}`)
    }
  }
}
