import { createZodDto } from 'nestjs-zod'
import {
  GetListNotificationQuerySchema,
  GetListNotificationResSchema,
  GetNotificationParamSchema,
  GetUnreadCountResSchema,
  NotificationSchema
} from './notification.model'

export class NotificationDTO extends createZodDto(NotificationSchema) {}
export class GetNotificationParamDTO extends createZodDto(GetNotificationParamSchema) {}
export class GetListNotificationQueryDTO extends createZodDto(GetListNotificationQuerySchema) {}
export class GetListNotificationResDTO extends createZodDto(GetListNotificationResSchema) {}
export class GetUnreadCountResDTO extends createZodDto(GetUnreadCountResSchema) {}
