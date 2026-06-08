import { createZodDto } from 'nestjs-zod'
import {
  ForgotPasswordBodySchema,
  GetAuthorizationUrlResSchema,
  LoginBodySchema,
  LoginResSchema,
  RefreshTokenResSchema,
  RegisterBodySchema,
  RegisterResSchema,
  SendEmailVerificationBodySchema,
  VerifyEmailBodySchema
} from './auth.model'

export class RegisterBodyDTO extends createZodDto(RegisterBodySchema) {}

export class RegisterResDTO extends createZodDto(RegisterResSchema) {}

export class SendEmailVerificationBodyDTO extends createZodDto(SendEmailVerificationBodySchema) {}

export class VerifyEmailBodyDTO extends createZodDto(VerifyEmailBodySchema) {}

export class LoginBodyDTO extends createZodDto(LoginBodySchema) {}

export class LoginResDTO extends createZodDto(LoginResSchema) {}

export class RefreshTokenResDTO extends createZodDto(RefreshTokenResSchema) {}

export class ForgotPasswordBodyDTO extends createZodDto(ForgotPasswordBodySchema) {}

export class GetAuthorizationUrlResDTO extends createZodDto(GetAuthorizationUrlResSchema) {}
