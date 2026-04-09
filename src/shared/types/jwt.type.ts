export interface AccessTokenPayloadCreate {
  userId: number
  email: string
  deviceId: number
  role: string
}

export interface AccessTokenPayLoad extends AccessTokenPayloadCreate {
  exp: number
  iat: number
}
export interface RefreshTokenPayloadCreate {
  userId: number
}

export interface RefreshTokenPayload extends RefreshTokenPayloadCreate {
  exp: number
  iat: number
}
