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
import envConfig from '~/shared/config'

@WebSocketGateway({
  cors: {
    origin: [envConfig.WEBSITE_DOMAIN_DEVELOPMENT, envConfig.WEBSITE_DOMAIN_PRODUCTION],
    credentials: true
  }
})
export class BoardGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server

  private readonly logger = new Logger(BoardGateway.name)

  constructor(private readonly tokenService: TokenService) {}

  async handleConnection(client: Socket) {
    const user = await authenticateSocket(client, this.tokenService)
    if (user) {
      this.logger.log(`Board socket authenticated: ${client.id} (user: ${user.userId})`)
    } else {
      this.logger.warn(`Board socket connected: ${client.id}`)
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from board: ${client.id}`)
  }

  @SubscribeMessage('board:join_sprint')
  handleJoinSprint(@ConnectedSocket() client: Socket, @MessageBody() data: { sprintId: string }) {
    if (!data.sprintId) return
    const room = `sprint:${data.sprintId}`
    client.join(room)
    this.logger.log(`Client joined sprint board room: ${room}`)
    return { status: 'joined', room }
  }

  @SubscribeMessage('board:leave_sprint')
  handleLeaveSprint(@ConnectedSocket() client: Socket, @MessageBody() data: { sprintId: string }) {
    if (!data.sprintId) return
    const room = `sprint:${data.sprintId}`
    client.leave(room)
  }

  @SubscribeMessage('yjs:sync_update')
  handleYjsUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sprintId: string; update: string | number[] }
  ) {
    if (!data.sprintId || !data.update) return
    const room = `sprint:${data.sprintId}`
    client.to(room).emit('yjs:sync_update', data)
  }

  @SubscribeMessage('yjs:awareness')
  handleYjsAwareness(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sprintId: string; awarenessState: any }
  ) {
    if (!data.sprintId || !data.awarenessState) return
    const room = `sprint:${data.sprintId}`
    client.to(room).emit('yjs:awareness', data)
  }

  emitTaskCreated(sprintId: string, task: any) {
    if (this.server) {
      this.server.to(`sprint:${sprintId}`).emit('board:task_created', task)
    }
  }

  emitTaskUpdated(sprintId: string, task: any) {
    if (this.server) {
      this.server.to(`sprint:${sprintId}`).emit('board:task_updated', task)
    }
  }

  emitTaskMoved(sprintId: string, payload: any) {
    if (this.server) {
      this.server.to(`sprint:${sprintId}`).emit('board:task_moved', payload)
    }
  }

  emitTaskDeleted(sprintId: string, taskId: string) {
    if (this.server) {
      this.server.to(`sprint:${sprintId}`).emit('board:task_deleted', { taskId })
    }
  }

  emitColumnsReordered(sprintId: string, columnOrderIds: string[]) {
    if (this.server) {
      this.server.to(`sprint:${sprintId}`).emit('board:columns_reordered', { columnOrderIds })
    }
  }
}
