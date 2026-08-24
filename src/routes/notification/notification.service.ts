import { Injectable } from '@nestjs/common'
import { NotificationRepo } from './notification.repo'
import { GetListNotificationQueryType } from './notification.model'
import { isNotFoundPrismaError } from '~/shared/helpers'
import { NotificationNotFoundError } from './notification.error'

@Injectable()
export class NotificationService {
  constructor(private readonly notificationRepo: NotificationRepo) {}

  async findAllByUserId(userId: string, query: GetListNotificationQueryType) {
    return await this.notificationRepo.findAllByUserId(userId, query)
  }

  async findAllByProjectId(projectId: string, query: GetListNotificationQueryType) {
    return await this.notificationRepo.findAllByProjectId(projectId, query)
  }

  async getUnreadCount(userId: string) {
    return await this.notificationRepo.getUnreadCount(userId)
  }

  async markAsRead(id: string, userId: string) {
    try {
      return await this.notificationRepo.markAsRead(id, userId)
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw NotificationNotFoundError
      }
      throw error
    }
  }

  async markAllAsRead(userId: string) {
    await this.notificationRepo.markAllAsRead(userId)
    return { message: 'All notifications marked as read' }
  }

  async delete(id: string, userId: string) {
    try {
      await this.notificationRepo.delete(id, userId)
      return { message: 'Notification deleted successfully' }
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw NotificationNotFoundError
      }
      throw error
    }
  }
}
