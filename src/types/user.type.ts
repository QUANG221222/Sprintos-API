import { ObjectId } from 'mongodb'

interface IUser {
  _id?: ObjectId
  email: string
  password: string
  displayName: string
  role: string
  isActive: boolean
  verifyToken?: string
  gender?: string
  dob?: Date | number
  address?: string
  avatar?: string
  avatarPublicId?: string
  createdAt: Date | number
  updatedAt: Date | number | null
}

interface CreateUserRequest {
  email: string
  password: string
}

interface CreateUserResponse {
  message: string
  data: Partial<IUser>
}

interface VerifyEmailResponse {
  message: string
  data: any
}

interface VerifyEmailRequest {
  email: string
  token: string
}

export type {
  IUser,
  CreateUserRequest,
  CreateUserResponse,
  VerifyEmailRequest,
  VerifyEmailResponse
}
