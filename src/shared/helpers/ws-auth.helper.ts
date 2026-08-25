import { Socket } from 'socket.io'
import * as cookie from 'cookie'
import { TokenService } from '../services/token.service'
import { AccessTokenPayLoad } from '../types/jwt.type'

export async function authenticateSocket(
  socket: Socket,
  tokenService: TokenService
): Promise<AccessTokenPayLoad | null> {
  try {
    let accessToken: string | undefined

    // 1. Trích xuất từ HttpOnly Cookie trong Handshake Headers
    const rawCookie = socket.handshake.headers.cookie
    if (rawCookie) {
      const parsedCookies = cookie.parse(rawCookie)
      accessToken = parsedCookies.accessToken
    }

    // 2. Fallback từ Handshake Auth object (nếu client truyền auth: { token })
    if (!accessToken && socket.handshake.auth) {
      accessToken = socket.handshake.auth.token || socket.handshake.auth.accessToken
    }

    // 3. Fallback từ Authorization header
    if (!accessToken && socket.handshake.headers.authorization) {
      const authHeader = socket.handshake.headers.authorization
      if (authHeader.startsWith('Bearer ')) {
        accessToken = authHeader.substring(7)
      }
    }

    // 4. Fallback từ Handshake Query
    if (!accessToken && socket.handshake.query) {
      accessToken = (socket.handshake.query.token || socket.handshake.query.accessToken) as string
    }

    if (!accessToken) {
      return null
    }

    const payload = await tokenService.verifyAccessToken(accessToken)
    socket.data.user = payload
    return payload
  } catch (error: any) {
    console.log(error)
    return null
  }
}
