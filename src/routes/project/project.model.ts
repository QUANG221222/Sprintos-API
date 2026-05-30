import z from 'zod'
import { ProjectMemberSchema } from './project-member/project-member.model'
import { ProjectMemberRoleSchema } from '~/shared/constants/project.constants'

export const ProjectSchema = z
  .object({
    id: z.number(),
    ownerId: z.number(),
    name: z.string(),
    description: z.string().nullable(),
    image: z.string().nullable(),
    members: z.array(ProjectMemberSchema),
    // sprints: z.array(SprintSchema)
    // notifications: z.array(NotificationSchema)

    createdAt: z.date(),
    updatedAt: z.date().nullable(),
    deletedAt: z.date().nullable()
  })
  .strict()


export const GetProjectDetailResSchema = ProjectSchema

export const GetProjectParamSchema = z.object({
  projectId: z.coerce.number()
})

export const GetListProjectResSchema = z.object({
  data: z.array(ProjectSchema),
  totalItems: z.number().positive(),
  page: z.number().positive(),
  limit: z.number().positive(),
  totalPages: z.number().positive()
})

export const CreateProjectBodySchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    members: z
      .array(
        z.object({
          email: z.string().email(),
          role: z.nativeEnum(ProjectMemberRoleSchema)
        })
      )
      .optional()
  })
  .strict()

export const UpdateProjectBodySchema = CreateProjectBodySchema.pick({
  name: true,
  description: true
}).strict()

export type ProjectType = z.infer<typeof ProjectSchema>
export type CreateProjectBodyType = z.infer<typeof CreateProjectBodySchema>
export type UpdateProjectBodyType = z.infer<typeof UpdateProjectBodySchema>
export type GetProjectDetailResType = z.infer<typeof GetProjectDetailResSchema>
export type GetListProjectResType = z.infer<typeof GetListProjectResSchema>
export type GetProjectParamType = z.infer<typeof GetProjectParamSchema>
