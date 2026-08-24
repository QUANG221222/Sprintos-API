import z from 'zod'

export const ChatMessageSchema = z
  .object({
    id: z.string(),
    projectChatId: z.string(),
    senderId: z.string(),
    senderName: z.string(),
    senderRole: z.string(),
    senderAvatarUrl: z.string().nullable(),
    message: z.string().nullable(),
    attachmentFileName: z.string().nullable(),
    attachmentFileType: z.string().nullable(),
    attachmentFileUrl: z.string().nullable(),
    attachmentFileSize: z.number().nullable(),
    attachmentPublicId: z.string().nullable(),
    timestamp: z.date(),
    isDeleted: z.boolean(),
    createdById: z.string().nullable().optional(),
    updatedById: z.string().nullable().optional(),
    deletedById: z.string().nullable().optional(),
    createdAt: z.date(),
    updatedAt: z.date().nullable(),
    deletedAt: z.date().nullable()
  })
  .strict()

export const GetProjectChatParamSchema = z
  .object({
    projectId: z.string()
  })
  .strict()

export const GetChatMessagesQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().default(50)
  })
  .strict()

export const GetProjectChatResSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    messages: z.array(ChatMessageSchema),
    totalMessages: z.number().nonnegative(),
    page: z.number().positive(),
    limit: z.number().positive(),
    totalPages: z.number().nonnegative()
  })
  .strict()

export type ChatMessageType = z.infer<typeof ChatMessageSchema>
export type GetProjectChatParamType = z.infer<typeof GetProjectChatParamSchema>
export type GetChatMessagesQueryType = z.infer<typeof GetChatMessagesQuerySchema>
export type GetProjectChatResType = z.infer<typeof GetProjectChatResSchema>
