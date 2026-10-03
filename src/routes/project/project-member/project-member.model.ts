import z from 'zod'
import { ProjectMemberRole, ProjectMemberStatus, TechnicalRole } from '~/shared/constants/project.constants'
import { GetListQuerySchema } from '~/shared/models/request.model'
import { ProjectMemberSchema } from '~/shared/models/shared-project-member.model'

export const GetProjectMemberParamSchema = z
  .object({
    memberId: z.string()
  })
  .strict()

export const GetProjectMemberListQuerySchema = GetListQuerySchema.extend({
  projectId: z.string(),
  roleName: z.nativeEnum(ProjectMemberRole).optional(),
  nameMember: z.string().optional(),
  emailMember: z.string().optional()
})

export const ProjectMemberProjectQuerySchema = z
  .object({
    projectId: z.string(),
    isHard: z.coerce
      .string()
      .optional()
      .transform((val) => val === 'true')
  })
  .strict()

export const GetProjectMembersDetailResSchema = z.array(ProjectMemberSchema)

export const GetListProjectMemberResSchema = z
  .object({
    data: z.array(ProjectMemberSchema),
    totalItems: z.number().nonnegative(),
    page: z.number().positive(),
    limit: z.number().positive(),
    totalPages: z.number().nonnegative()
  })
  .strict()

export const CreateProjectMemberBodySchema = z
  .object({
    projectId: z.string(),
    memberId: z.string(),
    email: z.string().email(),
    role: z.nativeEnum(ProjectMemberRole),
    technicalRole: z.nativeEnum(TechnicalRole).optional(),
    status: z.nativeEnum(ProjectMemberStatus).optional(),
    inviteToken: z.string().nullable().optional(),
    joinAt: z.coerce.date().nullable().optional()
  })
  .strict()

export const UpdateProjectMemberBodySchema = z
  .object({
    email: z.string().email().optional(),
    role: z.nativeEnum(ProjectMemberRole).optional(),
    technicalRole: z.nativeEnum(TechnicalRole).optional(),
    status: z.nativeEnum(ProjectMemberStatus).optional(),
    inviteToken: z.string().nullable().optional(),
    joinAt: z.coerce.date().nullable().optional()
  })
  .strict()

export const InviteProjectMemberBodySchema = z
  .object({
    projectId: z.string(),
    members: z
      .array(
        z.object({
          email: z.string().email(),
          role: z.nativeEnum(ProjectMemberRole),
          technicalRole: z.nativeEnum(TechnicalRole).optional()
        })
      )
      .nonempty()
  })
  .strict()

export const VerifyProjectMemberInviteBodySchema = z
  .object({
    projectId: z.string(),
    email: z.string().email(),
    token: z.string().min(1)
  })
  .strict()

export const UpdateProjectMemberRoleBodySchema = z
  .object({
    projectId: z.string(),
    role: z.nativeEnum(ProjectMemberRole).optional(),
    technicalRole: z.nativeEnum(TechnicalRole).optional()
  })
  .strict()

export type ProjectMemberType = z.infer<typeof ProjectMemberSchema>
export type GetProjectMemberParamType = z.infer<typeof GetProjectMemberParamSchema>
export type GetProjectMembersDetailResType = z.infer<typeof GetProjectMembersDetailResSchema>
export type GetListProjectMemberResType = z.infer<typeof GetListProjectMemberResSchema>
export type GetProjectMemberListQueryType = z.infer<typeof GetProjectMemberListQuerySchema>
export type ProjectMemberProjectQueryType = z.infer<typeof ProjectMemberProjectQuerySchema>
export type CreateProjectMemberBodyType = z.infer<typeof CreateProjectMemberBodySchema>
export type UpdateProjectMemberBodyType = z.infer<typeof UpdateProjectMemberBodySchema>
export type InviteProjectMemberBodyType = z.infer<typeof InviteProjectMemberBodySchema>
export type VerifyProjectMemberInviteBodyType = z.infer<typeof VerifyProjectMemberInviteBodySchema>
export type UpdateProjectMemberRoleBodyType = z.infer<typeof UpdateProjectMemberRoleBodySchema>
