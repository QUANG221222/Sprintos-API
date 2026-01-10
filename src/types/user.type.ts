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

interface UpdateUserRequest {
  displayName?: string
  gender?: string
  dob?: Date
  heightCm?: number
  weightKg?: number
}

interface UpdateUserResponse {
  message: string
  data: Partial<IUser>
}

interface GetUserResponse {
  message: string
  data: Partial<IUser>
}
export type { IUser, UpdateUserRequest, UpdateUserResponse, GetUserResponse }
