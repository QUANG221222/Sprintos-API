import { env } from '~/configs/environment'

export const WHITELIST_DOMAINS = ['https://sprintsos-task-project-management.vercel.app', 'https://sprintosweb.vercel.app', 'https://sprintos.fittrackwk.online']

export const WEBSITE_DOMAIN =
  env.BUILD_MODE === 'production'
    ? env.WEBSITE_DOMAIN_PRODUCTION
    : env.WEBSITE_DOMAIN_DEVELOPMENT
