import { ConflictException, HttpStatus, UnprocessableEntityException } from '@nestjs/common'

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
