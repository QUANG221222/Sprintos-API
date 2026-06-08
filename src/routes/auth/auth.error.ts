import { ConflictException, HttpStatus, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common'

export const EmailAldreadyExistsException = new ConflictException({
  message: 'Email already exists',
  path: 'email',
  statusCode: HttpStatus.CONFLICT
})

export const EmailNotFoundException = new UnprocessableEntityException({
  message: 'Email not found',
  path: 'email',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const UserNotActiveException = new UnprocessableEntityException({
  message: 'User is not active. Please verify your email.',
  path: 'email',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const LoginFailedException = new UnprocessableEntityException({
  message: 'Invalid email or password',
  path: 'email',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const FailedToSendOTPException = new UnprocessableEntityException({
  message: 'Failed to send OTP',
  path: 'code',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const InvalidOTPException = new UnprocessableEntityException({
  message: 'Invalid OTP',
  path: 'code',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const OTPExpiredException = new UnprocessableEntityException({
  message: 'OTP has expired',
  path: 'code',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const RefreshTokenNotFoundException = new UnauthorizedException({
  message: 'Refresh token not found',
  path: 'refreshToken',
  statusCode: HttpStatus.UNAUTHORIZED
})

export const GoogleUserInfoError = new UnprocessableEntityException({
  message: 'Failed to get Google user information',
  path: 'email',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})
