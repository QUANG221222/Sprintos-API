import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { Logger } from '@nestjs/common'
import { TokenService } from '~/shared/services/token.service'
import { authenticateSocket } from '~/shared/helpers/ws-auth.helper'
import { ChatService } from './chat.service'
import envConfig from '~/shared/config'

@WebSocketGateway({
  cors: {
    origin: [envConfig.WEBSITE_DOMAIN_DEVELOPMENT, envConfig.WEBSITE_DOMAIN_PRODUCTION],
    credentials: true
  }
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server

  private readonly logger = new Logger(ChatGateway.name)

  constructor(
    private readonly tokenService: TokenService,
    private readonly chatService: ChatService
  ) {}

  async handleConnection(client: Socket) {
    const user = await authenticateSocket(client, this.tokenService)
    if (!user) {
      client.disconnect()
      return
    }
    this.logger.log(`User ${user.userId} connected to Chat Gateway`)
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from chat: ${client.id}`)
  }

  @SubscribeMessage('chat:join_project')
  async handleJoinProject(@ConnectedSocket() client: Socket, @MessageBody() data: { projectId: string }) {
    const user = client.data.user
    if (!user || !data.projectId) return

    const room = `project:${data.projectId}`
    client.join(room)
    this.logger.log(`User ${user.userId} joined chat room: ${room}`)
    return { status: 'joined', room }
  }

  @SubscribeMessage('chat:leave_project')
  handleLeaveProject(@ConnectedSocket() client: Socket, @MessageBody() data: { projectId: string }) {
    if (!data.projectId) return
    const room = `project:${data.projectId}`
    client.leave(room)
    this.logger.log(`Client ${client.id} left chat room: ${room}`)
  }

  @SubscribeMessage('chat:send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      projectId: string
      message?: string
      senderRole?: string
      attachment?: {
        fileName: string
        fileType: string
        fileUrl: string
        fileSize: number
        publicId: string
      }
    }
  ) {
    const user = client.data.user
    if (!user || !data.projectId) return

    const chat = await this.chatService.findOrCreateChat(data.projectId)

    const savedMessage = await this.chatService.saveMessage({
      projectChatId: chat.id,
      senderId: user.userId,
      senderName: user.name || user.email || 'Member',
      senderRole: data.senderRole || 'MEMBER',
      senderAvatarUrl: user.avatar || null,
      message: data.message || null,
      attachmentFileName: data.attachment?.fileName || null,
      attachmentFileType: data.attachment?.fileType || null,
      attachmentFileUrl: data.attachment?.fileUrl || null,
      attachmentFileSize: data.attachment?.fileSize || null,
      attachmentPublicId: data.attachment?.publicId || null
    })

    const room = `project:${data.projectId}`
    client.join(room)
    this.server.to(room).emit('chat:new_message', savedMessage)
    this.logger.log(`Broadcasted chat:new_message to room ${room}`)
    return savedMessage
  }

  @SubscribeMessage('chat:typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId: string; isTyping: boolean }
  ) {
    const user = client.data.user
    if (!user || !data.projectId) return

    const room = `project:${data.projectId}`
    client.to(room).emit('chat:user_typing', {
      userId: user.userId,
      userName: user.name || user.email,
      isTyping: data.isTyping
    })
  }
}
