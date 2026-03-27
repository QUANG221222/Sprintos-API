import { createZodDto } from 'nestjs-zod'
import {
  RegisterBodySchema,
  RegisterResSchema,
  SendEmailVerificationBodySchema,
  VerifyEmailBodySchema
} from './auth.model'

export class RegisterBodyDTO extends createZodDto(RegisterBodySchema) {}

export class RegisterResDTO extends createZodDto(RegisterResSchema) {}

export class SendEmailVerificationBodyDTO extends createZodDto(SendEmailVerificationBodySchema) {}

export class VerifyEmailBodyDTO extends createZodDto(VerifyEmailBodySchema) {}
