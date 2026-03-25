import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { TokenService } from '../services/token.service'
import { REQUEST_USER_KEY } from '../constants/auth.constants'
import { AccessTokenPayLoad } from '../types/jwt.type'
import { PrismaService } from '../services/prisma.service'

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly prismaService: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    // Extract and validate token
    await this.extractAndValidateToken(request)

    // Check user permission
    // await this.validateUserPermission(decodedAccessToken, request)

    return true
  }

  private async extractAndValidateToken(request: any): Promise<AccessTokenPayLoad> {
    const accessToken = this.extractAccessTokenFromHeader(request)
    try {
      const decodedAccessToken = await this.tokenService.verifyAccessToken(accessToken)

      request[REQUEST_USER_KEY] = decodedAccessToken
      return decodedAccessToken
    } catch {
      throw new UnauthorizedException('Error.InvalidAccessToken')
    }
  }

  private extractAccessTokenFromHeader(request: any): string {
    const accessToken = request.headers.authorization?.split(' ')[1]
    if (!accessToken) {
      throw new UnauthorizedException('Error.MissingAccessToken')
    }
    return accessToken
  }

  // private async validateUserPermission(decodedAccessToken: AccessTokenPayLoad, request: any): Promise<void> {
  //   const roleId = decodedAccessToken.roleId
  //   const path = request.route.path
  //   const method = request.method as keyof typeof HTTPMethod
  //   const role = await this.prismaService.role
  //     .findUniqueOrThrow({
  //       where: { id: roleId, deletedAt: null, isActive: true },
  //       include: {
  //         permissions: {
  //           where: { deletedAt: null, method, path }
  //         }
  //       }
  //     })
  //     .catch(() => {
  //       throw new ForbiddenException('Error.Forbidden')
  //     })
  //   const canAccess = role.permissions.some((permission) => permission.method === method && permission.path === path)
  //   if (!canAccess) {
  //     throw new ForbiddenException('Error.Forbidden')
  //   }
  //   request[REQUEST_ROLE_PERMISSIONS] = role
  // }
}
