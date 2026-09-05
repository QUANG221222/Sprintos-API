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
import { PrismaService } from '~/shared/services/prisma.service'
import { RoleName } from '~/shared/constants/role.constants'
import { ProjectMemberRole } from '~/shared/constants/project.constants'
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

  constructor(
    private readonly tokenService: TokenService,
    private readonly prismaService: PrismaService
  ) {}

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
  async handleJoinSprint(@ConnectedSocket() client: Socket, @MessageBody() data: { sprintId: string }) {
    if (!data.sprintId) return
    let user = client.data.user
    if (!user) {
      user = await authenticateSocket(client, this.tokenService)
    }
    if (!user) {
      this.logger.warn(`Unauthenticated socket ${client.id} attempted to join sprint ${data.sprintId}`)
      return { error: 'Unauthorized' }
    }

    const hasAccess = await this.checkSprintAccess(user.userId, data.sprintId, user.roleName)
    if (!hasAccess) {
      this.logger.warn(`User ${user.userId} forbidden from sprint board ${data.sprintId}`)
      return { error: 'Forbidden' }
    }

    const room = `sprint:${data.sprintId}`
    client.join(room)
    this.logger.log(`Client ${client.id} (user: ${user.userId}) joined sprint board room: ${room}`)
    return { status: 'joined', room }
  }

  @SubscribeMessage('board:leave_sprint')
  handleLeaveSprint(@ConnectedSocket() client: Socket, @MessageBody() data: { sprintId: string }) {
    if (!data.sprintId) return
    const room = `sprint:${data.sprintId}`
    client.leave(room)
  }

  @SubscribeMessage('yjs:sync_update')
  async handleYjsUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sprintId: string; update: string | number[] }
  ) {
    if (!data.sprintId || !data.update) return
    let user = client.data.user
    if (!user) {
      user = await authenticateSocket(client, this.tokenService)
    }
    if (!user) return

    const canEdit = await this.checkSprintWriteAccess(user.userId, data.sprintId, user.roleName)
    if (!canEdit) {
      this.logger.warn(`User ${user.userId} forbidden from editing sprint board ${data.sprintId} (Read-only)`)
      return
    }

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

  private async checkSprintAccess(userId: string, sprintId: string, roleName?: string): Promise<boolean> {
    if (roleName === RoleName.Admin) return true
    const sprint = await this.prismaService.sprint.findFirst({
      where: { id: sprintId, deletedAt: null },
      select: { projectId: true }
    })
    if (!sprint) return false
    const project = await this.prismaService.project.findFirst({
      where: {
        id: sprint.projectId,
        deletedAt: null,
        OR: [
          { ownerId: userId },
          {
            members: {
              some: {
                memberId: userId,
                status: 'ACTIVE',
                deletedAt: null
              }
            }
          }
        ]
      }
    })
    return !!project
  }

  private async checkSprintWriteAccess(userId: string, sprintId: string, roleName?: string): Promise<boolean> {
    if (roleName === RoleName.Admin) return true
    const sprint = await this.prismaService.sprint.findFirst({
      where: { id: sprintId, deletedAt: null },
      select: { projectId: true }
    })
    if (!sprint) return false

    const project = await this.prismaService.project.findFirst({
      where: { id: sprint.projectId, ownerId: userId, deletedAt: null }
    })
    if (project) return true

    const member = await this.prismaService.projectMember.findFirst({
      where: {
        projectId: sprint.projectId,
        memberId: userId,
        status: 'ACTIVE',
        deletedAt: null
      },
      include: { role: true }
    })
    if (!member || !member.role) return false
    return member.role.name !== ProjectMemberRole.VIEWER
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
