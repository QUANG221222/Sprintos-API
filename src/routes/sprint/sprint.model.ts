import z from 'zod'

export const SprintStatusSchema = z.enum(['PLANNED', 'ACTIVE', 'COMPLETED'])

export const SprintSchema = z
  .object({
    id: z.number(),
    projectId: z.number(),
    name: z.string(),
    goal: z.string().nullable(),
    maxStoryPoint: z.number().int(),
    startDate: z.date(),
    endDate: z.date(),
    status: SprintStatusSchema,
    createdById: z.number().nullable(),
    updatedById: z.number().nullable(),
    deletedById: z.number().nullable(),
    createdAt: z.date(),
    updatedAt: z.date().nullable(),
    deletedAt: z.date().nullable()
  })
  .strict()

export const GetSprintParamSchema = z
  .object({
    sprintId: z.coerce.number()
  })
  .strict()

export const GetSprintDetailResSchema = SprintSchema

export const GetListSprintResSchema = z
  .object({
    data: z.array(SprintSchema),
    totalItems: z.number().nonnegative(),
    page: z.number().positive(),
    limit: z.number().positive(),
    totalPages: z.number().nonnegative()
  })
  .strict()

export const CreateSprintBodySchema = z
  .object({
    projectId: z.number().positive(),
    name: z.string(),
    goal: z.string().nullable().optional(),
    maxStoryPoint: z.number().int().nonnegative(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    status: SprintStatusSchema.optional()
  })
  .strict()

export const UpdateSprintBodySchema = CreateSprintBodySchema.omit({
  projectId: true
})
  .partial()
  .strict()

export type SprintType = z.infer<typeof SprintSchema>
export type GetSprintParamType = z.infer<typeof GetSprintParamSchema>
export type GetSprintDetailResType = z.infer<typeof GetSprintDetailResSchema>
export type GetListSprintResType = z.infer<typeof GetListSprintResSchema>
export type CreateSprintBodyType = z.infer<typeof CreateSprintBodySchema>
export type UpdateSprintBodyType = z.infer<typeof UpdateSprintBodySchema>
