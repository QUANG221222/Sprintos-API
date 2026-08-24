import { Module, Global } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { MAIL_QUEUE, NOTIFICATION_QUEUE } from './queue.constant'
import { QueueService } from './queue.service'
import { MailProcessor } from './mail.processor'
import { NotificationProcessor } from './notification.processor'
import envConfig from '~/shared/config'

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          host: envConfig.REDIS_HOST,
          port: parseInt(envConfig.REDIS_PORT, 10)
        }
      })
    }),
    BullModule.registerQueue(
      {
        name: MAIL_QUEUE
      },
      {
        name: NOTIFICATION_QUEUE
      }
    )
  ],
  providers: [QueueService, MailProcessor],
  exports: [QueueService, BullModule]
})
export class QueueModule {}
