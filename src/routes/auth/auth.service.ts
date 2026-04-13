import { TokenService } from './../../shared/services/token.service'
import { SharedUserRepository } from './../../shared/repositories/shared-user.repo'
import { HashingService } from './../../shared/services/hashing.service'
import { AuthRepo } from './auth.repo'
import { HttpException, Injectable, UnauthorizedException } from '@nestjs/common'
import {
  ForgotPasswordBodyType,
  LoginBodyType,
  RegisterBodyType,
  SendEmailVerificationBodyType,
  VerifyEmailBodyType
} from './auth.model'
import {
  extractTokenFromCookie,
  generateOTP,
  isNotFoundPrismaError,
  isUniqueConstraintPrismaError
} from '~/shared/helpers'
import {
  EmailAldreadyExistsException,
  EmailNotFoundException,
  FailedToSendOTPException,
  InvalidOTPException,
  LoginFailedException,
  OTPExpiredException,
  RefreshTokenNotFoundException,
  UserNotActiveException
} from './auth.error'
import { addMilliseconds } from 'date-fns'
import ms, { StringValue } from 'ms'
import envConfig from '~/shared/config'
import { EmailService } from '~/shared/services/email.service'
import { TypeOfVerificationCode, TypeOfVerificationCodeType, UserStatus } from '~/shared/constants/auth.constants'
import { SharedRoleRepository } from '~/shared/repositories/shared-role.repo'
import { Request } from 'express'

@Injectable()
export class AuthService {
  constructor(
    private readonly sharedUserRepository: SharedUserRepository,
    private readonly sharedRoleRepository: SharedRoleRepository,
    private readonly authRepo: AuthRepo,
    private readonly emailService: EmailService,
    private readonly hashingService: HashingService,
    private readonly tokenService: TokenService
  ) {}

  async register(data: RegisterBodyType) {
    try {
      const { email, password } = data

      // Hash password
      const hashedPassword = await this.hashingService.hash(password)

      const nameFromEmail = email.split('@')[0]

      // Send verification email
      await this.sendEmail({
        email,
        websiteDomain: envConfig.WEBSITE_DOMAIN_DEVELOPMENT,
        type: TypeOfVerificationCode.REGISTER
      })

      // Get client role id
      const clientRoleId = await this.sharedRoleRepository.getClientRoleId()

      const createUser = await this.authRepo.createUser({
        email,
        password: hashedPassword,
        displayName: nameFromEmail,
        roleId: clientRoleId
      })

      return createUser
    } catch (error) {
      if (isUniqueConstraintPrismaError(error)) {
        throw EmailAldreadyExistsException
      }
      throw error
    }
  }

  async sendEmail({ email, websiteDomain, type }: SendEmailVerificationBodyType) {
    const user = await this.sharedUserRepository.findUnique({ email: email })

    if (type === TypeOfVerificationCode.REGISTER && user && user.status !== UserStatus.INACTIVE) {
      throw EmailAldreadyExistsException
    }

    if (type === TypeOfVerificationCode.FORGOT_PASSWORD && !user) {
      throw EmailNotFoundException
    }

    // Generate and save verification code, then send email
    const code = generateOTP()
    await this.authRepo.createVerificationCode({
      email: email,
      code,
      type: type,
      expiresAt: addMilliseconds(new Date(), ms(envConfig.OTP_EXPIRES_IN as StringValue))
    })
    const { error } = await this.emailService.sendLink({ email, code, websiteDomain, type })

    if (error) {
      throw FailedToSendOTPException
    }
    return {
      message: 'Verification email sent successfully'
    }
  }

  async verifyEmail(body: VerifyEmailBodyType) {
    // Validate verification code
    const verificationCode = await this.validateVerificationCode(body)

    if (!verificationCode) throw InvalidOTPException

    await Promise.all([
      this.sharedUserRepository.update({ email: body.email }, { status: UserStatus.ACTIVE }),
      this.authRepo.deleteVerificationCode({ id: verificationCode.id })
    ])

    return {
      message: 'Email verified successfully'
    }
  }

  async validateVerificationCode({
    email,
    code,
    type
  }: {
    email: string
    code: string
    type: TypeOfVerificationCodeType
  }) {
    const verificationCode = await this.authRepo.findUniqueVerificationCode({
      email_code_type: {
        email,
        code,
        type
      }
    })

    if (!verificationCode) {
      throw InvalidOTPException
    }

    if (verificationCode.expiresAt < new Date()) {
      throw OTPExpiredException
    }

    return verificationCode
  }

  async login(body: LoginBodyType & { userAgent: string; ip: string }) {
    // Find user by email
    const exitingUser = await this.sharedUserRepository.findUniqueUserIncludeRole({ email: body.email })

    if (!exitingUser) {
      throw EmailNotFoundException
    }

    // Check if user is active
    if (exitingUser.status !== UserStatus.ACTIVE) {
      throw UserNotActiveException
    }

    // Validate password
    const isPasswordValid = await this.hashingService.compare(body.password, exitingUser.password)

    if (!isPasswordValid) {
      throw LoginFailedException
    }

    // Create Device
    const device = await this.authRepo.createDevice({
      userId: exitingUser.id,
      userAgent: body.userAgent,
      ip: body.ip
    })

    const tokens = await this.generateTokens({
      userId: exitingUser.id,
      email: exitingUser.email,
      deviceId: device.id,
      roleId: exitingUser.roleId,
      roleName: exitingUser.role.name
    })

    return tokens
  }

  async generateTokens({
    userId,
    email,
    deviceId,
    roleId,
    roleName
  }: {
    userId: number
    email: string
    deviceId: number
    roleId: number
    roleName: string
  }) {
    // Generate access token and refresh token
    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.signAccessToken({
        userId,
        email,
        deviceId,
        roleId,
        roleName
      }),
      this.tokenService.signRefreshToken({
        userId
      })
    ])

    const decodedRefreshToken = await this.tokenService.verifyRefreshToken(refreshToken)

    await this.authRepo.createRefreshToken({
      token: refreshToken,
      userId,
      deviceId,
      expiresAt: new Date(decodedRefreshToken.exp * 1000) // Convert exp to milliseconds
    })

    return {
      accessToken,
      refreshToken
    }
  }

  async refreshToken({ req, userAgent, ip }: { req: Request; userAgent: string; ip: string }) {
    try {
      // Extract refresh token from cookie
      const refreshToken = extractTokenFromCookie(req, 'refreshToken')

      // 1. Verify refresh token and get payload
      const { userId } = await this.tokenService.verifyRefreshToken(refreshToken)

      // 2. Check refreshToken is exist in database
      const refreshTokenData = await this.authRepo.findUniqueRefreshTokenIncludeUserRole({ token: refreshToken })
      if (!refreshTokenData) {
        throw RefreshTokenNotFoundException
      }

      const {
        deviceId,
        user: {
          email,
          roleId,
          role: { name: roleName }
        }
      } = refreshTokenData

      // 3. Update device with new ip and user agent
      const $updateDevice = this.authRepo.updateDevice(deviceId, {
        ip,
        userAgent
      })

      // 4. Delete old refresh token
      const $deleteRefreshToken = this.authRepo.deleteRefreshToken({ token: refreshToken })

      // 5. Generate new access token and refresh token
      const $tokens = this.generateTokens({
        userId,
        deviceId,
        email,
        roleId,
        roleName
      })

      const [, , tokens] = await Promise.all([$updateDevice, $deleteRefreshToken, $tokens])

      return tokens
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      throw new UnauthorizedException()
    }
  }

  async logout(req: Request) {
    try {
      // Extract refresh token from cookie
      const refreshToken = extractTokenFromCookie(req, 'refreshToken')

      // 1. Check refreshToken is exist and valid
      await this.tokenService.verifyRefreshToken(refreshToken)

      // 2. Delete refresh token in database
      const deletedRefreshToken = await this.authRepo.deleteRefreshToken({ token: refreshToken })

      // 3. Update device in database, set isActive to false
      await this.authRepo.updateDevice(deletedRefreshToken.deviceId, {
        isActive: false
      })

      return { message: 'Logout successfully' }
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw RefreshTokenNotFoundException
      }
      throw new UnauthorizedException()
    }
  }

  async forgotPassword(body: ForgotPasswordBodyType) {
    const { email, code, newPassword } = body

    // Check if user exist
    const user = await this.sharedUserRepository.findUnique({ email })

    if (!user) {
      throw EmailNotFoundException
    }

    // Check if user is active
    if (user.status !== UserStatus.ACTIVE) {
      throw UserNotActiveException
    }

    // Validate verification code
    const verificationCode = await this.validateVerificationCode({
      email,
      code,
      type: TypeOfVerificationCode.FORGOT_PASSWORD
    })

    if (!verificationCode) {
      throw InvalidOTPException
    }

    // Hash new password
    const hashedPassword = await this.hashingService.hash(newPassword)

    // Update user password and delete verification code
    await Promise.all([
      this.sharedUserRepository.update({ id: user.id }, { password: hashedPassword }),
      this.authRepo.deleteVerificationCode({
        email_code_type: {
          email,
          code,
          type: TypeOfVerificationCode.FORGOT_PASSWORD
        }
      })
    ])

    return { message: 'Password has been reset successfully' }
  }
}
