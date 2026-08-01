export interface AccessTokenPayloadCreate {
  userId: string
  email: string
  deviceId: string
  roleId: string
  roleName: string
}

export interface AccessTokenPayLoad extends AccessTokenPayloadCreate {
  exp: number
  iat: number
}
export interface RefreshTokenPayloadCreate {
  userId: string
}

export interface RefreshTokenPayload extends RefreshTokenPayloadCreate {
  exp: number
  iat: number
}
