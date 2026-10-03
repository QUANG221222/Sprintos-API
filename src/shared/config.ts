import z from 'zod'
import 'dotenv/config'

// const envFile = process.env.BUILD_MODE === 'prod' ? '.env.production' : '.env'

// // Check if .env file exists
// if (!fs.existsSync(path.resolve(envFile))) {
//   console.log(`Config file ${envFile} not found`)
//   process.exit(1)
// }

const configSchema = z.object({
  LOCAL_APP_PORT: z.string(),
  LOCAL_APP_HOST: z.string().url(),
  WEBSITE_DOMAIN_DEVELOPMENT: z.string().url(),
  WEBSITE_DOMAIN_PRODUCTION: z.string().url(),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string(),
  DB_PORT: z.string(),
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
  BUILD_MODE: z.string().default(process.env.BUILD_MODE || 'dev'),
  COOKIE_DOMAIN: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  GOOGLE_REDIRECT_URI: z.string(),
  MICROSOFT_CLIENT_ID: z.string(),
  MICROSOFT_CLIENT_SECRET: z.string(),
  MICROSOFT_REDIRECT_URI: z.string(),
  CLIENT_REDIRECT_URI: z.string(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_REGION: z.string(),
  S3_BUCKET_NAME: z.string(),
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.string().default('6379'),
  LOCAL_AI_BASE_URL: z.string(),
  LOCAL_AI_API_KEY: z.string(),
  CF_ACCESS_CLIENT_SECRET: z.string().optional(),
  CF_ACCESS_CLIENT_ID: z.string().optional(),
  DEFAULT_AI_MODEL: z.string(),
  OPENROUTER_API_KEY: z.string(),
  OPENROUTER_BASE_URL: z.string(),
  TAVILY_API_KEY: z.string().optional()
})

const configServer = configSchema.safeParse(process.env)

if (!configServer.success) {
  console.log('Config not valid')
  console.error(configServer.error)
  process.exit(1)
}

const envConfig = configServer.data

export default envConfig
