import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  GoneException,
  HttpStatus
} from '@nestjs/common'
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
    const accessToken = this.extractTokenFromCookie(request, 'accessToken')
    const refreshToken = this.extractTokenFromCookie(request, 'refreshToken')

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

  private extractTokenFromCookie(request: any, tokenName: string = 'accessToken'): string {
    const cookieHeader = request.headers.cookie
    if (!cookieHeader) {
      throw new UnauthorizedException(`${tokenName} not found`)
    }

    const token = cookieHeader
      .split(';')
      .find((cookie: string) => cookie.trim().startsWith(`${tokenName}=`))
      ?.split('=')[1]

    if (!token) {
      throw new UnauthorizedException(`${tokenName} not found`)
    }
    return token
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
