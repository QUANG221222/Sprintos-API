import ms from 'ms'
import envConfig from '../config'

export const REQUEST_USER_KEY = 'user'
export const isProduction = envConfig.BUILD_MODE === 'production'

export const AuthType = {
  Bearer: 'Bearer',
  None: 'None',
  ApiKey: 'ApiKey'
} as const

export type AuthTypeType = (typeof AuthType)[keyof typeof AuthType]

export const ConditionGuard = {
  And: 'And',
  Or: 'Or'
} as const

export type ConditionGuardType = (typeof ConditionGuard)[keyof typeof ConditionGuard]

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE'
} as const

export const TypeOfVerificationCode = {
  REGISTER: 'REGISTER',
  FORGOT_PASSWORD: 'FORGOT_PASSWORD',
  LOGIN: 'LOGIN',
  DISABLE_2FA: 'DISABLE_2FA'
} as const

export type TypeOfVerificationCodeType = (typeof TypeOfVerificationCode)[keyof typeof TypeOfVerificationCode]

export const WebsiteDomain = isProduction ? envConfig.WEBSITE_DOMAIN_PRODUCTION : envConfig.WEBSITE_DOMAIN_DEVELOPMENT

export const cookieOptions = {
  httpOnly: true, // prevent client-side JS access
  secure: isProduction, // prevent cookie access in non-HTTPS
  sameSite: isProduction ? ('none' as const) : ('lax' as const), // CSRF protection
  path: '/', // cookie available for entire site
  domain: isProduction ? process.env.COOKIE_DOMAIN : undefined, // set domain in production
  maxAge: ms('1 days') // cookie expiry time
} as const
