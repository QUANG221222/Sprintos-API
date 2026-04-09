import { Injectable } from '@nestjs/common'
import { PrismaService } from '~/shared/services/prisma.service'
import { DeviceType, RefreshTokenType, RegisterResType, VerificationCodeType } from './auth.model'
import { UserType } from '~/shared/models/shared-user.model'
import { TypeOfVerificationCodeType } from '~/shared/constants/auth.constants'

@Injectable()
export class AuthRepo {
  constructor(private readonly prismaService: PrismaService) {}
  register(data: Pick<UserType, 'email' | 'password' | 'displayName'>): Promise<RegisterResType> {
    return this.prismaService.user.create({
      data: {
        email: data.email,
        password: data.password,
        displayName: data.displayName
      }
    })
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
    uniqueValue: { email_code_type: { email: string; code: string; type: TypeOfVerificationCodeType } } | { id: number }
  ): Promise<VerificationCodeType | null> {
    return await this.prismaService.verificationCode.findUnique({
      where: uniqueValue
    })
  }

  deleteVerificationCode(
    uniqueValue: { email_code_type: { email: string; code: string; type: TypeOfVerificationCodeType } } | { id: number }
  ): Promise<VerificationCodeType> {
    return this.prismaService.verificationCode.delete({
      where: uniqueValue
    })
  }

  createRefreshToken(data: {
    userId: number
    token: string
    deviceId: number
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

  findUniqueRefreshTokenIncludeUser(where: { token: string }): Promise<(RefreshTokenType & { user: UserType }) | null> {
    return this.prismaService.refreshToken.findUnique({
      where,
      include: {
        user: true
      }
    }) as Promise<(RefreshTokenType & { user: UserType }) | null>
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

  updateDevice(deviceId: number, data: Partial<DeviceType>): Promise<DeviceType> {
    return this.prismaService.device.update({
      where: { id: deviceId },
      data
    })
  }
}
