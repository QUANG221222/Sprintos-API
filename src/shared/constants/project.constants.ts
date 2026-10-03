export const ProjectMemberRole = {
  OWNER: 'OWNER',
  CO_OWNER: 'CO-OWNER',
  MEMBER: 'MEMBER',
  VIEWER: 'VIEWER'
} as const

export const ProjectMemberStatus = {
  ACTIVE: 'ACTIVE',
  PENDING: 'PENDING'
} as const

export const TechnicalRole = {
  BACKEND: 'BACKEND',
  FRONTEND: 'FRONTEND',
  FULLSTACK: 'FULLSTACK',
  QA_TEST: 'QA_TEST',
  DEVOPS: 'DEVOPS',
  DESIGN: 'DESIGN',
  PRODUCT_OWNER: 'PRODUCT_OWNER',
  OTHER: 'OTHER'
} as const

export type TechnicalRole = (typeof TechnicalRole)[keyof typeof TechnicalRole]

