import z from 'zod'
import fs from 'fs'
import path from 'path'
import 'dotenv/config'

const envFile = process.env.BUILD_MODE === 'prod' ? '.env.production' : '.env'

// Check if .env file exists
if (!fs.existsSync(path.resolve(envFile))) {
  console.log(`Config file ${envFile} not found`)
  process.exit(1)
}

const configSchema = z.object({
  LOCAL_APP_PORT: z.string(),
  LOCAL_APP_HOST: z.string().url(),
  WEBSITE_DOMAIN_DEVELOPMENT: z.string().url(),
  WEBSITE_DOMAIN_PRODUCTION: z.string().url(),
  DATABASE_URL: z.string(),
  APP_NAME: z.string(),
  SECRET_API_KEY: z.string(),
  ACCESS_TOKEN_SECRET: z.string(),
  ACCESS_TOKEN_EXPIRES_IN: z.string(),
  REFRESH_TOKEN_SECRET: z.string(),
  REFRESH_TOKEN_EXPIRES_IN: z.string(),
  ADMIN_NAME: z.string(),
  ADMIN_PASSWORD: z.string(),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_NUMBERPHONE: z.string(),
  OTP_EXPIRES_IN: z.string(),
  RESEND_API_KEY: z.string(),
  BUILD_MODE: z.string().default(process.env.BUILD_MODE || 'dev')
  // GOOGLE_CLIENT_ID: z.string(),
  // GOOGLE_CLIENT_SECRET: z.string(),
  // GOOGLE_REDIRECT_URI: z.string(),
  // GOOGLE_CLIENT_REDIRECT_URI: z.string()
})

const configServer = configSchema.safeParse(process.env)

if (!configServer.success) {
  console.log('Config not valid')
  console.error(configServer.error)
  process.exit(1)
}

const envConfig = configServer.data

export default envConfig
