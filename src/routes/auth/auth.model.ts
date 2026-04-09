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

export const LoginBodySchema = RegisterBodySchema.extend({
  totpCode: z.string().length(6).optional(), // 2FA code
  code: z.string().length(6).optional() // Email OTP code
}).strict()

export const LoginResSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string()
})

export const RefreshTokenSchema = z
  .object({
    token: z.string(),
    userId: z.number(),
    deviceId: z.number(),
    expiresAt: z.date(),
    createdAt: z.date()
  })
  .strict()

export const RefreshTokenBodySchema = z
  .object({
    refreshToken: z.string()
  })
  .strict()

export const RefreshTokenResSchema = LoginResSchema

export const DeviceSchema = z.object({
  id: z.number(),
  userId: z.number(),
  userAgent: z.string(),
  ip: z.string(),
  lastActive: z.date(),
  createdAt: z.date(),
  isActive: z.boolean()
})

export const LogoutBodySchema = RefreshTokenBodySchema

export type RegisterBodyType = z.infer<typeof RegisterBodySchema>
export type RegisterResType = z.infer<typeof RegisterResSchema>
export type VerificationCodeType = z.infer<typeof VerificationCodeSchema>
export type SendEmailVerificationBodyType = z.infer<typeof SendEmailVerificationBodySchema>
export type VerifyEmailBodyType = z.infer<typeof VerifyEmailBodySchema>
export type LoginBodyType = z.infer<typeof LoginBodySchema>
export type LoginResType = z.infer<typeof LoginResSchema>
export type RefreshTokenBodyType = z.infer<typeof RefreshTokenBodySchema>
export type RefreshTokenResType = z.infer<typeof RefreshTokenResSchema>
export type RefreshTokenType = z.infer<typeof RefreshTokenSchema>
export type DeviceType = z.infer<typeof DeviceSchema>
export type LogoutBodyType = z.infer<typeof LogoutBodySchema>
