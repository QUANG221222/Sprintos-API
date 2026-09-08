export const MAIL_QUEUE = 'mail-queue'
export const NOTIFICATION_QUEUE = 'notification-queue'
export const AI_EMBEDDING_QUEUE = 'ai-embedding-queue'
export const QUEUE_JOBS = {
  SEND_VERIFICATION_MAIL: 'send-verification-mail',
  SEND_INVITATION_MAIL: 'send-invitation-mail',
  SEND_TASK_ASSIGNED_MAIL: 'send-task-assigned-mail',
  SEND_TASK_REMINDER_MAIL: 'send-task-reminder-mail',
  CREATE_NOTIFICATION: 'create-notification',
  GENERATE_TASK_EMBEDDING: 'generate-task-embedding'
} as const