import { createZodDto } from 'nestjs-zod'
import {
  ChatMessageSchema,
  GetChatMessagesQuerySchema,
  GetProjectChatParamSchema,
  GetProjectChatResSchema
} from './chat.model'

export class ChatMessageDTO extends createZodDto(ChatMessageSchema) {}
export class GetProjectChatParamDTO extends createZodDto(GetProjectChatParamSchema) {}
export class GetChatMessagesQueryDTO extends createZodDto(GetChatMessagesQuerySchema) {}
export class GetProjectChatResDTO extends createZodDto(GetProjectChatResSchema) {}
