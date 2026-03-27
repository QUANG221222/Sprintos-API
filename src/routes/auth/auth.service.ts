import { SharedUserRepository } from './../../shared/repositories/shared-user.repo'
import { HashingService } from './../../shared/services/hashing.service'
import { AuthRepo } from './auth.repo'
import { Injectable } from '@nestjs/common'
import { RegisterBodyType, SendEmailVerificationBodyType, VerifyEmailBodyType } from './auth.model'
import { generateOTP, isUniqueConstraintPrismaError } from '~/shared/helpers'
import {
  EmailAldreadyExistsException,
  EmailNotFoundException,
  FailedToSendOTPException,
  InvalidOTPException,
  OTPExpiredException
} from './auth.error'
import { addMilliseconds } from 'date-fns'
import ms, { StringValue } from 'ms'
import envConfig from '~/shared/config'
import { EmailService } from '~/shared/services/email.service'
import { TypeOfVerificationCode, TypeOfVerificationCodeType, UserStatus } from '~/shared/constants/auth.constants'

@Injectable()
export class AuthService {
  constructor(
    private readonly sharedUserRepository: SharedUserRepository,
    private readonly authRepo: AuthRepo,
    private readonly emailService: EmailService,
    private readonly hashingService: HashingService
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

      const createUser = await this.authRepo.register({
        email,
        password: hashedPassword,
        displayName: nameFromEmail
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
    const user = await this.sharedUserRepository.findUnique({ email: email, deletedAt: null })

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
}
