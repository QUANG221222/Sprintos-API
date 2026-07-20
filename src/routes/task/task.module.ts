import { Module } from '@nestjs/common'
import { TaskService } from './task.service'
import { TaskController } from './task.controller'
import { TaskRepo } from './task.repo'

@Module({
  providers: [TaskService, TaskRepo],
  controllers: [TaskController]
})
export class TaskModule {}
