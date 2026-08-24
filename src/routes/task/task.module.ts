import { Module } from '@nestjs/common'
import { TaskService } from './task.service'
import { TaskController } from './task.controller'
import { TaskRepo } from './task.repo'
import { BoardGateway } from './board.gateway'
import { TaskReminderService } from './task-reminder.service'

@Module({
  controllers: [TaskController],
  providers: [TaskService, TaskRepo, BoardGateway, TaskReminderService],
  exports: [TaskService, TaskRepo, BoardGateway, TaskReminderService]
})
export class TaskModule {}
