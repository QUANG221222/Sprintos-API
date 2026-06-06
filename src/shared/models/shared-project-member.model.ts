import { z } from 'zod'
import { ProjectMemberRole, ProjectMemberStatus } from '../constants/project.constants'

export const ProjectMemberSchema = z.object({
  id: z.number(),
  projectId: z.number(),
  memberId: z.number(),
  email: z.string().email(),
  role: z.nativeEnum(ProjectMemberRole),
  status: z.nativeEnum(ProjectMemberStatus),
  inviteToken: z.string().nullable(),
  joinAt: z.date().nullable(),

  invitedById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedById: z.number().nullable(),

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
})

export type ProjectMemberType = z.infer<typeof ProjectMemberSchema>
export type GetProjectMemberDetailResType = z.infer<typeof GetProjectMemberDetailResSchema>
export type CreateInvitationProjectMemberBodyType = z.infer<typeof CreateInvitationProjectMemberBodySchema>
