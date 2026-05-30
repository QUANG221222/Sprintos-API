import z from 'zod'

export const EmptyBodySchema = z.object({}).strict()

export const GetListQuerySchema = z
  .object({
    page: z.coerce.number().positive(),
    limit: z.coerce.number().positive()
  })
  .strict()

export type EmptyBodyType = z.infer<typeof EmptyBodySchema>
export type GetListQueryType = z.infer<typeof GetListQuerySchema>
