import { applyDecorators, UseGuards } from '@nestjs/common'
import { ProjectOwnerGuard } from '../guards/project-owner.guard'

export const ProjectOwner = () => applyDecorators(UseGuards(ProjectOwnerGuard))
