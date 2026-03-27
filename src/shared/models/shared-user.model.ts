import { z } from 'zod'
import { UserStatus } from '../constants/auth.constants'
import { RoleName } from '../constants/role.constants'

export const UserSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  displayName: z.string().min(2).max(100),
  role: z.nativeEnum(RoleName),
  totpSecret: z.string().nullable(),
  status: z.nativeEnum(UserStatus),
  phoneNumber: z.string().max(20).nullable(),
  address: z.string().max(255).nullable(),
  dob: z.date().nullable(),
  bio: z.string().max(500).nullable(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullable(),
  avatar: z.string().nullable(),
  avatarPublicId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date().nullable(),
  deletedAt: z.date().nullable()
})

/**
 * It use for API Get('/profile) and Get('/users/:id')
 */
export const GetUserProfileResSchema = UserSchema.omit({
  password: true,
  totpSecret: true
})

/**
 * It use for API Put('/profile) and Put('/users/:id')
 */
export const UpdateUserProfileResSchema = UserSchema.omit({
  password: true,
  totpSecret: true
})

export type UserType = z.infer<typeof UserSchema>
export type GetUserProfileResType = z.infer<typeof GetUserProfileResSchema>
export type UpdateUserProfileResType = z.infer<typeof UpdateUserProfileResSchema>
