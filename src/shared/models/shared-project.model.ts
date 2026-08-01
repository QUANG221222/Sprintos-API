import { z } from 'zod'
import { ProjectMemberSchema } from './shared-project-member.model'

export const ProjectSchema = z
  .object({
    id: z.string(),
    ownerId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    image: z.string().nullable(),
    members: z.array(ProjectMemberSchema),
    // sprints: z.array(SprintSchema)
    // notifications: z.array(NotificationSchema)
    createdById: z.string().nullable(),
    updatedById: z.string().nullable(),
    deletedById: z.string().nullable(),

    createdAt: z.date(),
    updatedAt: z.date().nullable(),
    deletedAt: z.date().nullable()
  })
  .strict()

export const GetProjectDetailResSchema = ProjectSchema

export const GetProjectParamSchema = z.object({
  projectId: z.string()
})

export type ProjectType = z.infer<typeof ProjectSchema>
export type GetProjectParamType = z.infer<typeof GetProjectParamSchema>
export type GetProjectDetailResType = z.infer<typeof GetProjectDetailResSchema>
