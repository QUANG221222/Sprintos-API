import { z } from 'zod'
import { TypeOfVerificationCode } from '~/shared/constants/auth.constants'
import { UserSchema } from '~/shared/models/shared-user.model'

export const RegisterBodySchema = UserSchema.pick({
  email: true,
  password: true
})

export const RegisterResSchema = UserSchema.omit({ password: true, totpSecret: true })

export const VerificationCodeSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  code: z.string(),
  type: z.nativeEnum(TypeOfVerificationCode),
  expiresAt: z.date(),
  createdAt: z.date()
})

export const SendEmailVerificationBodySchema = VerificationCodeSchema.pick({
  email: true,
  type: true
}).extend({
  websiteDomain: z.string().url()
})

export const VerifyEmailBodySchema = VerificationCodeSchema.pick({
  email: true,
  code: true,
  type: true
})

export type RegisterBodyType = z.infer<typeof RegisterBodySchema>
export type RegisterResType = z.infer<typeof RegisterResSchema>
export type VerificationCodeType = z.infer<typeof VerificationCodeSchema>
export type SendEmailVerificationBodyType = z.infer<typeof SendEmailVerificationBodySchema>
export type VerifyEmailBodyType = z.infer<typeof VerifyEmailBodySchema>
