import { Module } from '@nestjs/common'
import { ProjectService } from './project.service'
import { ProjectController } from './project.controller'
import { ProjectRepo } from './project.repo'
import { ProjectOwnerGuard } from './guards/project-owner.guard'
import { ProjectMemberGuard } from './guards/project-member.guard'

@Module({
  providers: [ProjectService, ProjectRepo, ProjectOwnerGuard, ProjectMemberGuard],
  controllers: [ProjectController]
})
export class ProjectModule {}
