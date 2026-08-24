import { Module } from '@nestjs/common'
import { NotificationController } from './notification.controller'
import { NotificationService } from './notification.service'
import { NotificationRepo } from './notification.repo'
import { NotificationGateway } from './notification.gateway'
import { NotificationProcessor } from '../queue/notification.processor'

@Module({
  controllers: [NotificationController],
  providers: [NotificationService, NotificationRepo, NotificationGateway, NotificationProcessor],
  exports: [NotificationService, NotificationRepo, NotificationGateway]
})
export class NotificationModule {}