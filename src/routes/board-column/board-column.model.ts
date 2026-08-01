import z from 'zod'

export const BoardColumnSchema = z
  .object({
    id: z.string(),
    sprintId: z.string(),
    title: z.string().min(1).max(50),
    createdAt: z.date(),
    updatedAt: z.date().nullable(),
    deletedAt: z.date().nullable(),
    createdById: z.string().nullable(),
    updatedById: z.string().nullable(),
    deletedById: z.string().nullable()
  })
  .strict()

export const GetBoardColumnParamSchema = z
  .object({
    boardColumnId: z.string()
  })
  .strict()

export const GetSprintParamSchema = z
  .object({
    sprintId: z.string()
  })
  .strict()

export const GetBoardColumnDetailResSchema = BoardColumnSchema

export const GetListBoardColumnResSchema = z
  .object({
    data: z.array(BoardColumnSchema),
    totalItems: z.number().nonnegative()
  })
  .strict()

export const CreateBoardColumnBodySchema = z
  .object({
    sprintId: z.string(),
    title: z.string().min(1).max(50),
    order: z.number().optional(),
    position: z.number().optional()
  })
  .strict()

export const UpdateBoardColumnBodySchema = z
  .object({
    title: z.string().min(1).max(50).optional()
  })
  .strict()

export const ReorderBoardColumnsBodySchema = z
  .object({
    columnOrderIds: z.array(z.string())
  })
  .strict()

export type BoardColumnType = z.infer<typeof BoardColumnSchema>
export type GetBoardColumnParamType = z.infer<typeof GetBoardColumnParamSchema>
export type GetSprintParamType = z.infer<typeof GetSprintParamSchema>
export type GetBoardColumnDetailResType = z.infer<typeof GetBoardColumnDetailResSchema>
export type GetListBoardColumnResType = z.infer<typeof GetListBoardColumnResSchema>
export type CreateBoardColumnBodyType = z.infer<typeof CreateBoardColumnBodySchema>
export type UpdateBoardColumnBodyType = z.infer<typeof UpdateBoardColumnBodySchema>
export type ReorderBoardColumnsBodyType = z.infer<typeof ReorderBoardColumnsBodySchema>
