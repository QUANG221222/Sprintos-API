import { IUser } from './user.type'

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

interface LoginRequest {
  email: string
  password: string
}

interface LoginResponse {
  message: string
  data: any
}

interface RefreshTokenRequest {
  refreshToken: string
}

interface RefreshTokenResponse {
  message: string
  accessToken: string
}

interface ChangePasswordRequest {
  oldPassword: string
  newPassword: string
}

interface ChangePasswordResponse {
  message: string
  data: any
}

export type {
  CreateUserRequest,
  CreateUserResponse,
  VerifyEmailRequest,
  VerifyEmailResponse,
  LoginRequest,
  LoginResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
  ChangePasswordRequest,
  ChangePasswordResponse
}
