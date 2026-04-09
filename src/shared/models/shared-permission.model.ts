import { z } from 'zod'
import { HTTPMethod } from '~/shared/constants/role.constants'

export const PermissionSchema = z.object({
  id: z.number(),
  name: z.string().max(500),
  description: z.string().default(''),
  path: z.string().max(1000),
  method: z.nativeEnum(HTTPMethod),
  module: z.string().max(500).default(''),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable()
})

export type PermissionType = z.infer<typeof PermissionSchema>
