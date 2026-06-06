import { Module } from '@nestjs/common'
import { ProjectService } from './project.service'
import { ProjectController } from './project.controller'
import { ProjectRepo } from './project.repo'

@Module({
  providers: [ProjectService, ProjectRepo],
  controllers: [ProjectController]
})
export class ProjectModule {}
