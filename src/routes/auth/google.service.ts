import { Injectable } from '@nestjs/common'
import { google } from 'googleapis'
import { OAuth2Client } from 'googleapis-common'
import envConfig from '~/shared/config'
import { GoogleAuthStateType } from './auth.model'
import { AuthRepo } from './auth.repo'
import { SharedRoleRepository } from '~/shared/repositories/shared-role.repo'
import { HashingService } from '~/shared/services/hashing.service'
import { AuthService } from './auth.service'
import { GoogleUserInfoError } from './auth.error'
import { SharedUserRepository } from '~/shared/repositories/shared-user.repo'
import { v4 as uuidv4 } from 'uuid'

@Injectable()
export class GoogleService {
  private oauth2Client: OAuth2Client

  constructor(
    private readonly authRepo: AuthRepo,
    private readonly sharedRoleRepo: SharedRoleRepository,
    private readonly hashingService: HashingService,
    private readonly authService: AuthService,
    private readonly sharedUserRepository: SharedUserRepository
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      envConfig.GOOGLE_CLIENT_ID,
      envConfig.GOOGLE_CLIENT_SECRET,
      envConfig.GOOGLE_REDIRECT_URI
    )
  }

  getAuthorizationUrl({ userAgent, ip }: GoogleAuthStateType) {
    const scope = ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email']

    // Chuyển Object sang string base64 an toàn bỏ lên url
    const stateString = Buffer.from(
      JSON.stringify({
        userAgent,
        ip
      })
    ).toString('base64')

    const url = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope,
      include_granted_scopes: true,
      state: stateString
    })

    return { url }
  }

  async googleCallback({ code, state }: { code: string; state: string }) {
    try {
      let userAgent = 'Unknown'
      let ip = 'Unknown'

      // 1. Lấy state từ url callback, giải mã base64 để lấy userAgent và ip
      try {
        if (state) {
          const clientInfo = JSON.parse(Buffer.from(state, 'base64').toString()) as GoogleAuthStateType
          userAgent = clientInfo.userAgent
          ip = clientInfo.ip
        }
      } catch (error) {
        console.error('Failed to parse state:', error)
      }

      // 2. Dùng code để lấy token
      const { tokens } = await this.oauth2Client.getToken(code)
      this.oauth2Client.setCredentials(tokens)

      // 3. Dùng token để lấy thông tin user
      const oauth2 = google.oauth2({
        auth: this.oauth2Client,
        version: 'v2'
      })
      const { data } = await oauth2.userinfo.get()

      if (!data.email) {
        throw GoogleUserInfoError
      }

      let user = await this.sharedUserRepository.findUniqueUserIncludeRole({ email: data.email })

      // Nếu không có user tức là người mới sẽ tiến hành đăng ký
      if (!user) {
        const clientRoleId = await this.sharedRoleRepo.getClientRoleId()
        const randomPassword = uuidv4()
        const hashedPassword = await this.hashingService.hash(randomPassword)
        user = await this.authRepo.createUserIncludeRole({
          email: data.email,
          displayName: data.name || data.email.split('@')[0] || 'User',
          password: hashedPassword,
          roleId: clientRoleId,
          phoneNumber: '',
          avatar: data.picture ?? null
        })
      }

      const device = await this.authRepo.createDevice({
        userId: user.id,
        userAgent,
        ip
      })

      const authTokens = await this.authService.generateTokens({
        userId: user.id,
        email: user.email,
        deviceId: device.id,
        roleId: user.roleId,
        roleName: user.role.name
      })

      return authTokens
    } catch (error) {
      console.error('Google authentication failed:', error)
      throw error
    }
  }
}
