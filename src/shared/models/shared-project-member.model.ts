import { z } from 'zod'
import { ProjectMemberRole, ProjectMemberStatus, TechnicalRole } from '../constants/project.constants'

export const ProjectMemberSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  memberId: z.string(),
  email: z.string().email(),
  role: z.nativeEnum(ProjectMemberRole),
  technicalRole: z.nativeEnum(TechnicalRole).default(TechnicalRole.FULLSTACK),
  status: z.nativeEnum(ProjectMemberStatus),
  inviteToken: z.string().nullable(),
  joinAt: z.date().nullable(),

  invitedById: z.string().nullable(),
  updatedById: z.string().nullable(),
  deletedById: z.string().nullable(),

  invitedAt: z.date(),
  updatedAt: z.date().nullable(),
  deletedAt: z.date().nullable()
})

export const GetProjectMemberDetailResSchema = ProjectMemberSchema

export const CreateInvitationProjectMemberBodySchema = ProjectMemberSchema.pick({
  projectId: true,
  memberId: true,
  email: true,
  role: true,
  inviteToken: true
}).extend({
  technicalRole: z.nativeEnum(TechnicalRole).optional()
})

export type ProjectMemberType = z.infer<typeof ProjectMemberSchema>
export type GetProjectMemberDetailResType = z.infer<typeof GetProjectMemberDetailResSchema>
export type CreateInvitationProjectMemberBodyType = z.infer<typeof CreateInvitationProjectMemberBodySchema>
