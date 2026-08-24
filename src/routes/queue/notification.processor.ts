import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { Logger } from '@nestjs/common'
import { NOTIFICATION_QUEUE, QUEUE_JOBS } from './queue.constant'
import { PrismaService } from '~/shared/services/prisma.service'
import { NotificationType } from '~/generated/prisma/client'
import { NotificationGateway } from '~/routes/notification/notification.gateway'

@Processor(NOTIFICATION_QUEUE)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name)

  constructor(
    private readonly prismaService: PrismaService,
    private readonly notificationGateway: NotificationGateway
  ) {
    super()
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing notification job: ${job.name} (Job ID: ${job.id})`)

    if (job.name === QUEUE_JOBS.CREATE_NOTIFICATION) {
      const { userId, projectId, taskId, type, title, message } = job.data
      const notification = await this.prismaService.notification.create({
        data: {
          userId,
          projectId,
          taskId,
          type: type as NotificationType,
          title,
          message,
          isRead: false
        }
      })
      this.logger.log(`Notification created for user ${userId}: ${title}`)
      
      if(userId) {
        this.notificationGateway.sendToUser(userId, notification)
      }

      return notification
    }

    return null
  }
}
