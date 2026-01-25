import { env } from '~/configs/environment'

export const WHITELIST_DOMAINS = ['https://sprintsos-task-project-management.vercel.app/']

export const WEBSITE_DOMAIN =
  env.BUILD_MODE === 'production'
    ? env.WEBSITE_DOMAIN_PRODUCTION
    : env.WEBSITE_DOMAIN_DEVELOPMENT
