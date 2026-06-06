import { Module } from '@nestjs/common'
import { ProjectMemberService } from './project-member.service'
import { ProjectMemberController } from './project-member.controller'
import { ProjectMemberRepo } from './project-member.repo'

@Module({
  providers: [ProjectMemberService, ProjectMemberRepo],
  controllers: [ProjectMemberController]
})
export class ProjectMemberModule {}
