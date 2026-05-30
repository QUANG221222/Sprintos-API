import { applyDecorators, UseGuards } from '@nestjs/common'
import { ProjectMemberGuard } from '../guards/project-member.guard'

export const ProjectMember = () => applyDecorators(UseGuards(ProjectMemberGuard))
