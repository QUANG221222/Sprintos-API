import { createZodDto } from 'nestjs-zod'
import {
  LoginBodySchema,
  LoginResSchema,
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
