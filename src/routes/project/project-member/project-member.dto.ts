import { createZodDto } from 'nestjs-zod'
import {
  CreateProjectMemberBodySchema,
  GetListProjectMemberResSchema,
  GetProjectMemberListQuerySchema,
  GetProjectMemberParamSchema,
  InviteProjectMemberBodySchema,
  ProjectMemberProjectQuerySchema,
  UpdateProjectMemberBodySchema,
  UpdateProjectMemberRoleBodySchema,
  VerifyProjectMemberInviteBodySchema,
  GetProjectMembersDetailResSchema
} from './project-member.model'

export class GetProjectMembersDetailResDTO extends createZodDto(GetProjectMembersDetailResSchema) {}

export class GetListProjectMemberResDTO extends createZodDto(GetListProjectMemberResSchema) {}

export class GetProjectMemberListQueryDTO extends createZodDto(GetProjectMemberListQuerySchema) {}

export class ProjectMemberProjectQueryDTO extends createZodDto(ProjectMemberProjectQuerySchema) {}

export class CreateProjectMemberBodyDTO extends createZodDto(CreateProjectMemberBodySchema) {}

export class UpdateProjectMemberBodyDTO extends createZodDto(UpdateProjectMemberBodySchema) {}

export class InviteProjectMemberBodyDTO extends createZodDto(InviteProjectMemberBodySchema) {}

export class VerifyProjectMemberInviteBodyDTO extends createZodDto(VerifyProjectMemberInviteBodySchema) {}

export class UpdateProjectMemberRoleBodyDTO extends createZodDto(UpdateProjectMemberRoleBodySchema) {}

export class GetProjectMemberParamDTO extends createZodDto(GetProjectMemberParamSchema) {}
