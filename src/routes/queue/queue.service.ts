import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { MAIL_QUEUE, NOTIFICATION_QUEUE, QUEUE_JOBS } from './queue.constant'
import { NotificationType } from '~/generated/prisma/client'

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name)

  constructor(
    @InjectQueue(MAIL_QUEUE) private readonly mailQueue: Queue,
    @InjectQueue(NOTIFICATION_QUEUE) private readonly notificationQueue: Queue
  ) {}

  /**
   * Đẩy job gửi mã xác thực email / quên mật khẩu vào hàng đợi
   */
  async sendVerificationEmail(payload: { email: string; code: string; websiteDomain: string; type: string }) {
    await this.mailQueue.add(QUEUE_JOBS.SEND_VERIFICATION_MAIL, payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true
    })
  }

  /**
   * Đẩy job gửi thư mời tham gia dự án vào hàng đợi
   */
  async sendInvitationEmail(payload: {
    email: string
    token: string
    websiteDomain: string
    role: string
    projectId: string
  }) {
    await this.mailQueue.add(QUEUE_JOBS.SEND_INVITATION_MAIL, payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true
    })
  }

  /**
   * Đẩy job gửi thư nhắc hạn chót Task vào hàng đợi
   */
  async sendTaskReminderEmail(payload: {
    email: string
    taskTitle: string
    projectName: string
    dueDate: string
    reminderText: string
    isUrgent?: boolean
  }) {
    await this.mailQueue.add(QUEUE_JOBS.SEND_TASK_REMINDER_MAIL, payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true
    })
  }

  /**
   * Đẩy job tạo thông báo hệ thống và gửi realtime
   */
  async createNotification(payload: {
    userId?: string
    projectId?: string
    taskId?: string
    type: NotificationType
    title: string
    message: string
  }) {
    await this.notificationQueue.add(QUEUE_JOBS.CREATE_NOTIFICATION, payload, {
      attempts: 2,
      removeOnComplete: true
    })
  }
}
