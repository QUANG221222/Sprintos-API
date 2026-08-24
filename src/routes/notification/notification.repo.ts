import { Injectable } from '@nestjs/common'
import { PrismaService } from '~/shared/services/prisma.service'
import {
  GetListNotificationQueryType,
  GetListNotificationResType,
  GetUnreadCountResType,
  NotificationType
} from './notification.model'

@Injectable()
export class NotificationRepo {
  constructor(private readonly prismaService: PrismaService) {}

  async findAllByUserId(userId: string, query: GetListNotificationQueryType): Promise<GetListNotificationResType> {
    const { page, limit, isRead, projectId } = query
    const skip = (page - 1) * limit
    const take = limit

    const whereCondition: any = {
      userId,
      ...(isRead !== undefined ? { isRead } : {}),
      ...(projectId ? { projectId } : {})
    }

    const [totalItems, unreadCount, data] = await Promise.all([
      this.prismaService.notification.count({
        where: whereCondition
      }),
      this.prismaService.notification.count({
        where: {
          userId,
          isRead: false
        }
      }),
      this.prismaService.notification.findMany({
        where: whereCondition,
        skip,
        take,
        orderBy: {
          createdAt: 'desc'
        }
      })
    ])

    return {
      data,
      totalItems,
      page,
      limit,
      totalPages: Math.ceil(totalItems / limit),
      unreadCount
    }
  }

  async findAllByProjectId(
    projectId: string,
    query: GetListNotificationQueryType
  ): Promise<GetListNotificationResType> {
    const { page, limit, isRead } = query
    const skip = (page - 1) * limit
    const take = limit

    const whereCondition: any = {
      projectId,
      ...(isRead !== undefined ? { isRead } : {})
    }

    const [totalItems, unreadCount, data] = await Promise.all([
      this.prismaService.notification.count({
        where: whereCondition
      }),
      this.prismaService.notification.count({
        where: {
          projectId,
          isRead: false
        }
      }),
      this.prismaService.notification.findMany({
        where: whereCondition,
        skip,
        take,
        orderBy: {
          createdAt: 'desc'
        }
      })
    ])

    return {
      data,
      totalItems,
      page,
      limit,
      totalPages: Math.ceil(totalItems / limit),
      unreadCount
    }
  }

  async getUnreadCount(userId: string): Promise<GetUnreadCountResType> {
    const unreadCount = await this.prismaService.notification.count({
      where: {
        userId,
        isRead: false
      }
    })
    return { unreadCount }
  }

  async findById(id: string): Promise<NotificationType | null> {
    return await this.prismaService.notification.findUnique({
      where: { id }
    })
  }

  async markAsRead(id: string, userId: string): Promise<NotificationType> {
    return await this.prismaService.notification.update({
      where: {
        id,
        userId
      },
      data: {
        isRead: true
      }
    })
  }

  async markAllAsRead(userId: string): Promise<{ count: number }> {
    const result = await this.prismaService.notification.updateMany({
      where: {
        userId,
        isRead: false
      },
      data: {
        isRead: true
      }
    })
    return { count: result.count }
  }

  async delete(id: string, userId: string): Promise<NotificationType> {
    return await this.prismaService.notification.delete({
      where: {
        id,
        userId
      }
    })
  }
}
