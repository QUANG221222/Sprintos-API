import z from 'zod'
import { ProjectMemberRole, TechnicalRole } from '~/shared/constants/project.constants'
import { ProjectSchema } from '~/shared/models/shared-project.model'

export const GetListProjectResSchema = z.object({
  data: z.array(ProjectSchema),
  totalItems: z.number().nonnegative(),
  page: z.number().positive(),
  limit: z.number().positive(),
  totalPages: z.number()
})

export const CreateProjectBodySchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    image: z.string().optional(),
    workTypes: z.array(z.string()).optional(),
    members: z
      .array(
        z.object({
          email: z.string().email(),
          role: z.nativeEnum(ProjectMemberRole),
          technicalRole: z.nativeEnum(TechnicalRole).optional()
        })
      )
      .optional()
  })
  .strict()

export const UpdateProjectBodySchema = CreateProjectBodySchema.pick({
  name: true,
  description: true,
  image: true,
  workTypes: true
}).strict()

export const TransferProjectBodySchema = z
  .object({
    newOwnerId: z.string()
  })
  .strict()

export type CreateProjectBodyType = z.infer<typeof CreateProjectBodySchema>
export type UpdateProjectBodyType = z.infer<typeof UpdateProjectBodySchema>
export type GetListProjectResType = z.infer<typeof GetListProjectResSchema>
export type TransferProjectBodyType = z.infer<typeof TransferProjectBodySchema>
