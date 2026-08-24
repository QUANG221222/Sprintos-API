import z from 'zod'

export const NotificationTypeSchema = z.enum([
  'project_created',
  'project_updated',
  'project_deleted',
  'project_invitation',
  'project_role_changed',
  'project_member_removed',
  'project_member_joined',
  'invitation_accepted',
  'member_role_changed',
  'member_removed',
  'sprint_started',
  'sprint_completed',
  'sprint_created',
  'sprint_deleted',
  'sprint_updated',
  'task_created',
  'task_assigned',
  'task_updated',
  'task_deleted',
  'task_moved',
  'task_commented'
])

export const NotificationSchema = z
  .object({
    id: z.string(),
    userId: z.string().nullable(),
    projectId: z.string().nullable(),
    taskId: z.string().nullable(),
    type: NotificationTypeSchema,
    title: z.string(),
    message: z.string(),
    isRead: z.boolean(),
    createdAt: z.date()
  })
  .strict()

export const GetNotificationParamSchema = z
  .object({
    id: z.string()
  })
  .strict()

export const GetListNotificationQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().default(10),
    isRead: z
      .enum(['true', 'false'])
      .transform((val) => val === 'true')
      .optional(),
    projectId: z.string().optional()
  })
  .strict()

export const GetListNotificationResSchema = z
  .object({
    data: z.array(NotificationSchema),
    totalItems: z.number().nonnegative(),
    page: z.number().positive(),
    limit: z.number().positive(),
    totalPages: z.number().nonnegative(),
    unreadCount: z.number().nonnegative()
  })
  .strict()

export const GetUnreadCountResSchema = z
  .object({
    unreadCount: z.number().nonnegative()
  })
  .strict()

export type NotificationType = z.infer<typeof NotificationSchema>
export type GetNotificationParamType = z.infer<typeof GetNotificationParamSchema>
export type GetListNotificationQueryType = z.infer<typeof GetListNotificationQuerySchema>
export type GetListNotificationResType = z.infer<typeof GetListNotificationResSchema>
export type GetUnreadCountResType = z.infer<typeof GetUnreadCountResSchema>
