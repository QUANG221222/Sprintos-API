import { Injectable } from '@nestjs/common'
import { PrismaService } from '~/shared/services/prisma.service'
import { DeviceType, RefreshTokenType, VerificationCodeType } from './auth.model'
import { UserType } from '~/shared/models/shared-user.model'
import { TypeOfVerificationCodeType } from '~/shared/constants/auth.constants'
import { RoleType } from '~/shared/models/shared-role.model'

@Injectable()
export class AuthRepo {
  constructor(private readonly prismaService: PrismaService) {}
  async createUser(
    user: Pick<UserType, 'email' | 'displayName' | 'password' | 'roleId'>
  ): Promise<Omit<UserType, 'password' | 'totpSecret'>> {
    return await this.prismaService.user.create({
      data: user,
      omit: {
        password: true,
        totpSecret: true
      }
    })
  }

  async createUserIncludeRole(
    user: Pick<UserType, 'email' | 'displayName' | 'password' | 'roleId' | 'phoneNumber' | 'avatar'>
  ): Promise<UserType & { role: RoleType }> {
    return this.prismaService.user.create({
      data: user,
      include: {
        role: true
      }
    }) as Promise<UserType & { role: RoleType }>
  }

  async createVerificationCode(
    payload: Pick<VerificationCodeType, 'email' | 'type' | 'code' | 'expiresAt'>
  ): Promise<VerificationCodeType> {
    return await this.prismaService.verificationCode.upsert({
      where: {
        email_type: {
          email: payload.email,
          type: payload.type
        }
      },
      create: payload,
      update: {
        code: payload.code,
        expiresAt: payload.expiresAt
      }
    })
  }

  async findUniqueVerificationCode(
    uniqueValue: { email_code_type: { email: string; code: string; type: TypeOfVerificationCodeType } } | { id: string }
  ): Promise<VerificationCodeType | null> {
    return await this.prismaService.verificationCode.findUnique({
      where: uniqueValue
    })
  }

  deleteVerificationCode(
    uniqueValue: { email_code_type: { email: string; code: string; type: TypeOfVerificationCodeType } } | { id: string }
  ): Promise<VerificationCodeType> {
    return this.prismaService.verificationCode.delete({
      where: uniqueValue
    })
  }

  createRefreshToken(data: {
    userId: string
    token: string
    deviceId: string
    expiresAt: Date
  }): Promise<RefreshTokenType> {
    return this.prismaService.refreshToken.create({
      data
    })
  }

  findUniqueRefreshToken(token: string): Promise<RefreshTokenType | null> {
    return this.prismaService.refreshToken.findUnique({
      where: { token }
    })
  }

  findUniqueRefreshTokenIncludeUserRole(where: {
    token: string
  }): Promise<(RefreshTokenType & { user: UserType & { role: RoleType } }) | null> {
    return this.prismaService.refreshToken.findUnique({
      where,
      include: {
        user: {
          include: {
            role: true
          }
        }
      }
    }) as Promise<(RefreshTokenType & { user: UserType & { role: RoleType } }) | null>
  }

  deleteRefreshToken(where: { token: string }): Promise<RefreshTokenType> {
    return this.prismaService.refreshToken.delete({
      where
    })
  }

  createDevice(
    data: Pick<DeviceType, 'userId' | 'userAgent' | 'ip'> & Partial<Pick<DeviceType, 'lastActive' | 'isActive'>>
  ) {
    return this.prismaService.device.create({
      data
    })
  }

  updateDevice(deviceId: string, data: Partial<DeviceType>): Promise<DeviceType> {
    return this.prismaService.device.update({
      where: { id: deviceId },
      data
    })
  }
}
