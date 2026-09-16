import { Injectable } from '@nestjs/common'
import envConfig from '~/shared/config'
import { AuthRepo } from './auth.repo'
import { SharedRoleRepository } from '~/shared/repositories/shared-role.repo'
import { HashingService } from '~/shared/services/hashing.service'
import { AuthService } from './auth.service'
import { SharedUserRepository } from '~/shared/repositories/shared-user.repo'
import { v4 as uuidv4 } from 'uuid'

export interface MicrosoftAuthStateType {
  userAgent: string
  ip: string
}

@Injectable()
export class MicrosoftService {
  constructor(
    private readonly authRepo: AuthRepo,
    private readonly sharedRoleRepo: SharedRoleRepository,
    private readonly hashingService: HashingService,
    private readonly authService: AuthService,
    private readonly sharedUserRepository: SharedUserRepository
  ) {}

  getAuthorizationUrl({ userAgent, ip }: MicrosoftAuthStateType) {
    const stateString = Buffer.from(
      JSON.stringify({
        userAgent,
        ip
      })
    ).toString('base64')

    // Scopes cần thiết để lấy thông tin profile và email của người dùng
    const scope = encodeURIComponent('openid profile email User.Read')
    const redirectUri = encodeURIComponent(envConfig.MICROSOFT_REDIRECT_URI)

    // Sử dụng endpoint 'common' cho multitenant + personal accounts
    const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${envConfig.MICROSOFT_CLIENT_ID}&response_type=code&redirect_uri=${redirectUri}&response_mode=query&scope=${scope}&state=${stateString}`

    return { url }
  }

  async microsoftCallback({ code, state }: { code: string; state: string }) {
    try {
      let userAgent = 'Unknown'
      let ip = 'Unknown'

      // 1. Giải mã state để lấy thông tin client (userAgent, ip)
      try {
        if (state) {
          const clientInfo = JSON.parse(Buffer.from(state, 'base64').toString()) as MicrosoftAuthStateType
          userAgent = clientInfo.userAgent
          ip = clientInfo.ip
        }
      } catch (error) {
        console.error('Failed to parse Microsoft state:', error)
      }

      // 2. Trao đổi Authorization Code lấy Access Token
      const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: envConfig.MICROSOFT_CLIENT_ID,
          scope: 'User.Read',
          code: code,
          redirect_uri: envConfig.MICROSOFT_REDIRECT_URI,
          grant_type: 'authorization_code',
          client_secret: envConfig.MICROSOFT_CLIENT_SECRET
        })
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json()
        throw new Error(`Failed to exchange Microsoft token: ${JSON.stringify(errorData)}`)
      }

      const tokenData = (await tokenResponse.json()) as { access_token: string }
      const accessToken = tokenData.access_token

      // 3. Sử dụng Access Token để lấy thông tin người dùng từ Microsoft Graph API
      const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      })

      if (!profileResponse.ok) {
        throw new Error('Failed to fetch Microsoft user profile')
      }

      const profileData = (await profileResponse.json()) as {
        displayName: string
        mail?: string
        userPrincipalName: string
        id: string
      }

      // Microsoft trả email qua 'mail', nếu rỗng thì dùng 'userPrincipalName'
      const email = profileData.mail || profileData.userPrincipalName

      if (!email) {
        throw new Error('No email address returned from Microsoft account')
      }

      // 4. Tìm kiếm hoặc khởi tạo User tương ứng
      let user = await this.sharedUserRepository.findUniqueUserIncludeRole({ email })

      if (!user) {
        const clientRoleId = await this.sharedRoleRepo.getClientRoleId()
        const randomPassword = uuidv4()
        const hashedPassword = await this.hashingService.hash(randomPassword)

        user = await this.authRepo.createUserIncludeRole({
          email: email,
          displayName: profileData.displayName || email.split('@')[0] || 'User',
          password: hashedPassword,
          roleId: clientRoleId,
          phoneNumber: '',
          avatar: null // Bạn có thể tùy chọn call API lấy ảnh từ Microsoft Graph sau
        })
      }

      // 5. Tạo phiên đăng nhập (Device & JWT Tokens)
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
      console.error('Microsoft authentication failed:', error)
      throw error
    }
  }
}
