import { z } from 'zod'
import { PermissionSchema } from './shared-permission.model'

export const RoleSchema = z.object({
  id: z.string(),
  name: z.string().max(500),
  description: z.string().optional(),
  isActive: z.boolean(),
  createdById: z.string().nullable(),
  updatedById: z.string().nullable(),
  deletedById: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable()
})

export const RolePermissionsSchema = RoleSchema.extend({
  permissions: z.array(
    PermissionSchema.pick({ id: true, name: true, description: true, path: true, method: true, module: true })
  )
})

export type RoleType = z.infer<typeof RoleSchema>
export type RolePermissionType = z.infer<typeof RolePermissionsSchema>
