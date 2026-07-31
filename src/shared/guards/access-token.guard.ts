import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  GoneException,
  HttpStatus,
  ForbiddenException
} from '@nestjs/common'
import { TokenService } from '../services/token.service'
import { REQUEST_ROLE_PERMISSIONS, REQUEST_USER_KEY } from '../constants/auth.constants'
import { AccessTokenPayLoad } from '../types/jwt.type'
import { PrismaService } from '../services/prisma.service'
import { extractTokenFromCookie } from '../helpers'
import { HTTPMethod } from '../constants/role.constants'

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly prismaService: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    // Extract and validate token
    const decodedAccessToken = await this.extractAndValidateToken(request)

    // Check user permission
    await this.validateUserPermission(decodedAccessToken, request)

    return true
  }

  private async extractAndValidateToken(request: any): Promise<AccessTokenPayLoad> {
    const accessToken = extractTokenFromCookie(request, 'accessToken')
    const refreshToken = extractTokenFromCookie(request, 'refreshToken')

    const decodedRefreshToken = await this.tokenService.verifyRefreshToken(refreshToken)

    const decodedAccessToken = await this.tokenService
      .verifyAccessToken(accessToken)
      .then((payload) => payload)
      .catch((error) => {
        if (error.name === 'TokenExpiredError' && decodedRefreshToken.exp > Math.floor(Date.now() / 1000)) {
          throw new GoneException({
            message: 'Access token expired',
            path: 'accessToken',
            statusCode: HttpStatus.GONE
          })
        }
        throw new UnauthorizedException('Invalid access token')
      })
    request[REQUEST_USER_KEY] = decodedAccessToken
    return decodedAccessToken
  }

  private async extractProjectId(request: any): Promise<string | null> {
    // 1. Direct projectId in params, body, or query
    const projectIdRaw = request.params?.projectId ?? request.body?.projectId ?? request.query?.projectId
    if (projectIdRaw && typeof projectIdRaw === 'string') {
      return projectIdRaw
    }

    // 2. SprintId in params, body, or query
    const sprintIdRaw = request.params?.sprintId ?? request.body?.sprintId ?? request.query?.sprintId
    if (sprintIdRaw && typeof sprintIdRaw === 'string') {
      const sprint = await this.prismaService.sprint.findUnique({
        where: { id: sprintIdRaw },
        select: { projectId: true }
      })
      if (sprint) return sprint.projectId
    }

    // 3. TaskId in params, body, or query
    const taskIdRaw = request.params?.taskId ?? request.body?.taskId ?? request.query?.taskId
    if (taskIdRaw && typeof taskIdRaw === 'string') {
      const task = await this.prismaService.task.findUnique({
        where: { id: taskIdRaw },
        select: { sprintId: true }
      })
      if (task) {
        const sprint = await this.prismaService.sprint.findUnique({
          where: { id: task.sprintId },
          select: { projectId: true }
        })
        if (sprint) return sprint.projectId
      }
    }

    // 4. BoardColumnId in params, body, or query
    const boardColumnIdRaw =
      request.params?.boardColumnId ?? request.body?.boardColumnId ?? request.query?.boardColumnId
    if (boardColumnIdRaw && typeof boardColumnIdRaw === 'string') {
      const column = await this.prismaService.boardColumn.findUnique({
        where: { id: boardColumnIdRaw },
        select: { sprintId: true }
      })
      if (column) {
        const sprint = await this.prismaService.sprint.findUnique({
          where: { id: column.sprintId },
          select: { projectId: true }
        })
        if (sprint) return sprint.projectId
      }
    }

    return null
  }

  private async validateUserPermission(decodedAccessToken: AccessTokenPayLoad, request: any): Promise<void> {
    const globalRoleId = decodedAccessToken.roleId
    const path = request.route.path
    const method = request.method as keyof typeof HTTPMethod

    const roleIdsToCheck: number[] = [globalRoleId]

    // Try to extract projectId from request context
    const projectId = await this.extractProjectId(request)

    if (projectId) {
      const projectMember = await this.prismaService.projectMember.findFirst({
        where: {
          projectId,
          memberId: decodedAccessToken.userId,
          status: 'ACTIVE',
          deletedAt: null
        },
        include: {
          role: true
        }
      })

      if (projectMember && projectMember.role && projectMember.role.isActive) {
        roleIdsToCheck.push(projectMember.role.id)
      }
    }

    // Find if any of the active roles has the permission for current route
    const matchingRoles = await this.prismaService.role.findMany({
      where: {
        id: { in: roleIdsToCheck },
        deletedAt: null,
        isActive: true,
        permissions: {
          some: {
            method,
            path,
            deletedAt: null
          }
        }
      },
      include: {
        permissions: {
          where: {
            method,
            path,
            deletedAt: null
          }
        }
      }
    })

    if (matchingRoles.length === 0) {
      throw new ForbiddenException('You do not have permission to access this resource')
    }

    request[REQUEST_ROLE_PERMISSIONS] = matchingRoles[0]
  }
}
