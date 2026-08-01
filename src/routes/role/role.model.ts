import z from 'zod'
import { RoleSchema } from '~/shared/models/shared-role.model'
import { RolePermissionsSchema } from '~/shared/models/shared-role.model'

export const GetRolesResSchema = z
  .object({
    data: z.array(RoleSchema),
    totalItems: z.number(),
    page: z.number(),
    limit: z.number(),
    totalPages: z.number()
  })
  .strict()

export const GetRolesQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().default(10)
  })
  .strict()

export const GetRoleDetailResSchema = RolePermissionsSchema

export const GetRoleParamsSchema = z
  .object({
    id: z.string()
  })
  .strict()

export const CreateRoleBodySchema = RoleSchema.pick({
  name: true,
  isActive: true,
  description: true
}).strict()

export const CreateRoleResSchema = RoleSchema

export const UpdateRoleBodySchema = RoleSchema.pick({
  name: true,
  isActive: true,
  description: true
})
  .extend({
    permissionIds: z.array(z.string())
  })
  .strict()

export type GetRolesResType = z.infer<typeof GetRolesResSchema>
export type GetRoleDetailResType = z.infer<typeof GetRoleDetailResSchema>
export type GetRolesQueryType = z.infer<typeof GetRolesQuerySchema>
export type GetRoleParamsType = z.infer<typeof GetRoleParamsSchema>
export type CreateRoleBodyType = z.infer<typeof CreateRoleBodySchema>
export type CreateRoleResType = z.infer<typeof CreateRoleResSchema>
export type UpdateRoleBodyType = z.infer<typeof UpdateRoleBodySchema>
