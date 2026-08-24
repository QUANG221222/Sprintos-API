import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '~/shared/services/prisma.service'
import { QueueService } from '../queue/queue.service'

@Injectable()
export class TaskReminderService {
  private readonly logger = new Logger(TaskReminderService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService
  ) {}

  // Chạy kiểm tra mỗi giờ để nhắc nhở hạn chót công việc
  @Cron(CronExpression.EVERY_HOUR)
  async handleTaskDueReminders() {
    this.logger.log('Running scheduled task due-date reminder check...')
    const now = new Date()

    try {
      // 1. Lấy tất cả task chưa hoàn thành và có dueDate
      const upcomingTasks = await this.prisma.task.findMany({
        where: {
          deletedAt: null,
          dueDate: {
            gte: now // Chưa quá hạn
          },
          boardColumn: {
            title: {
              not: 'Done'
            }
          }
        },
        include: {
          assignees: {
            include: {
              user: true
            }
          },
          sprint: {
            include: {
              project: true
            }
          }
        }
      })

      for (const task of upcomingTasks) {
        if (!task.dueDate || !task.assignees || task.assignees.length === 0) {
          continue
        }

        const diffMs = task.dueDate.getTime() - now.getTime()
        const diffHours = diffMs / (1000 * 60 * 60)
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

        let isUrgent = false
        let title = ''
        let message = ''

        if (diffHours > 48 && diffHours <= 72) {
          // Nhắc nhở trước 3 ngày
          isUrgent = false
          title = 'Task Due Soon (3 Days Left)'
          message = `Task "${task.title}" in project "${task.sprint?.project?.name || 'Project'}" is due in 3 days (${task.dueDate.toLocaleDateString()}).`
        } else if (diffHours > 0 && diffHours <= 24) {
          // Nhắc nhở khẩn cấp trước 1 ngày / hôm nay
          isUrgent = true
          title = 'Urgent: Task Due Tomorrow'
          message = `Task "${task.title}" in project "${task.sprint?.project?.name || 'Project'}" is due tomorrow (${task.dueDate.toLocaleDateString()}). Please complete your work.`
        }

        if (!title) continue

        // Kiểm tra xem trong 24 giờ qua đã gửi thông báo loại này cho task này chưa (tránh spam)
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        const existingNotification = await this.prisma.notification.findFirst({
          where: {
            taskId: task.id,
            type: 'task_updated',
            title,
            createdAt: {
              gte: oneDayAgo
            }
          }
        })

        if (existingNotification) {
          continue
        }

        // Gửi thông báo In-App qua Socket/DB và Email cho từng assignee
        for (const assignee of task.assignees) {
          if (!assignee.userId) continue

          // 1. In-App Notification (Socket & Database)
          await this.queueService.createNotification({
            userId: assignee.userId,
            taskId: task.id,
            type: 'task_updated',
            title,
            message
          })

          // 2. Gửi Email thông báo nếu user có email hợp lệ
          if (assignee.user?.email) {
            await this.queueService.sendTaskReminderEmail({
              email: assignee.user.email,
              taskTitle: task.title,
              projectName: task.sprint?.project?.name || 'Project',
              dueDate: task.dueDate.toLocaleDateString(),
              reminderText: message,
              isUrgent
            })
          }
        }

        this.logger.log(`Sent task due reminder for task ${task.id} (${task.title})`)
      }
    } catch (error) {
      this.logger.error('Failed to process task due-date reminders', error)
    }
  }
}
