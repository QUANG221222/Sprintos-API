import { Module } from '@nestjs/common'
import { SprintService } from './sprint.service'
import { SprintController } from './sprint.controller'
import { SprintRepo } from './sprint.repo'

@Module({
  providers: [SprintService, SprintRepo],
  controllers: [SprintController]
})
export class SprintModule {}
