export const OBJECT_ID_RULE = /^[0-9a-fA-F]{24}$/
export const OBJECT_ID_RULE_MESSAGE =
  'Your string fails to match the Object Id pattern!'

export const USERNAME_RULE = /^[a-zA-Z0-9_]{3,30}$/
export const USERNAME_RULE_MESSAGE =
  'Username must be 3-30 characters long and can only contain letters, numbers, and underscores.'
export const EMAIL_RULE = /^\S+@\S+\.\S+$/
export const EMAIL_RULE_MESSAGE = 'Email is invalid. (example@gmail.com)'
export const PASSWORD_RULE = /^(?=.*[A-Z])(?=.*\d)(?=.*\W)[A-Za-z\d\W]{8,256}$/
export const PASSWORD_RULE_MESSAGE =
  'Password must be 8-256 characters, include at least one uppercase letter, one number, and one special character.'
export const USER_ROLES = {
  ADMIN: 'admin',
  USER: 'user'
}
export const SECRET_KEY_RULE = /^[A-Za-z0-9+/]{43}=$/
export const SECRET_KEY_MESSAGE =
  'Secret key must be a valid 32-byte base64 encoded string (44 characters).'
export const NOTIFICATION_TYPES = {
  // Project related notifications
  PROJECT_CREATED: 'project_created',
  PROJECT_UPDATED: 'project_updated',
  PROJECT_DELETED: 'project_deleted',
  PROJECT_INVITATION: 'project_invitation',
  PROJECT_ROLE_CHANGED: 'project_role_changed',
  PROJECT_MEMBER_REMOVED: 'project_member_removed',
  PROJECT_MEMBER_JOINED: 'project_member_joined',

  // Member related notifications
  INVITATION_ACCEPTED: 'invitation_accepted',
  MEMBER_ROLE_CHANGED: 'member_role_changed',
  MEMBER_REMOVED: 'member_removed',

  // Sprint related notifications
  SPRINT_STARTED: 'sprint_started',
  SPRINT_COMPLETED: 'sprint_completed',
  SPRINT_CREATED: 'sprint_created',
  SPRINT_DELETED: 'sprint_deleted',
  SPRINT_UPDATED: 'sprint_updated',

  // Task related notifications
  TASK_CREATED: 'task_created',
  TASK_ASSIGNED: 'task_assigned',
  TASK_UPDATED: 'task_updated',
  TASK_DELETED: 'task_deleted',
  TASK_MOVED: 'task_moved',
  TASK_COMMENTED: 'task_commented'
}
export const USER_ROLES_ON_PROJECT = {
  OWNER: 'owner',
  MEMBER: 'member',
  VIEWER: 'viewer'
}
