import { Controller, Delete, Get, Param, Patch, Query } from '@nestjs/common'
import { NotificationService } from './notification.service'
import { ZodSerializerDto } from 'nestjs-zod'
import { ActiveUser } from '~/shared/decorators/active-user.decorator'
import {
  GetListNotificationQueryDTO,
  GetListNotificationResDTO,
  GetNotificationParamDTO,
  GetUnreadCountResDTO,
  NotificationDTO
} from './notification.dto'
import { MessageResDTO } from '~/shared/dtos/response.dto'
import { GetProjectParamDTO } from '~/shared/dtos/shared-project.dto'

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ZodSerializerDto(GetListNotificationResDTO)
  getUserNotifications(@ActiveUser('userId') userId: string, @Query() query: GetListNotificationQueryDTO) {
    return this.notificationService.findAllByUserId(userId, query)
  }

  @Get('unread-count')
  @ZodSerializerDto(GetUnreadCountResDTO)
  getUnreadCount(@ActiveUser('userId') userId: string) {
    return this.notificationService.getUnreadCount(userId)
  }

  @Get('project/:projectId')
  @ZodSerializerDto(GetListNotificationResDTO)
  getProjectNotifications(@Param() params: GetProjectParamDTO, @Query() query: GetListNotificationQueryDTO) {
    return this.notificationService.findAllByProjectId(params.projectId, query)
  }

  @Patch('mark-all-read')
  @ZodSerializerDto(MessageResDTO)
  markAllAsRead(@ActiveUser('userId') userId: string) {
    return this.notificationService.markAllAsRead(userId)
  }

  @Patch(':id/read')
  @ZodSerializerDto(NotificationDTO)
  markAsRead(@Param() params: GetNotificationParamDTO, @ActiveUser('userId') userId: string) {
    return this.notificationService.markAsRead(params.id, userId)
  }

  @Delete(':id')
  @ZodSerializerDto(MessageResDTO)
  delete(@Param() params: GetNotificationParamDTO, @ActiveUser('userId') userId: string) {
    return this.notificationService.delete(params.id, userId)
  }
}
