import { NotFoundException } from '@nestjs/common'

export const NotificationNotFoundError = new NotFoundException({
  message: 'Notification not found',
  path: 'notificationId',
  statusCode: 404
})
