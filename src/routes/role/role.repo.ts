import { Injectable } from '@nestjs/common'
import { PrismaService } from '~/shared/services/prisma.service'
import { CreateRoleBodyType, GetRolesQueryType, GetRolesResType, UpdateRoleBodyType } from './role.model'
import { RoleType } from '~/shared/models/shared-role.model'
import { RolePermissionType } from '~/shared/models/shared-role.model'

@Injectable()
export class RoleRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async list(pagination: GetRolesQueryType): Promise<GetRolesResType | null> {
    const { page, limit } = pagination
    const skip = (page - 1) * limit
    const take = limit
    const [totalItems, data] = await Promise.all([
      this.prismaService.role.count({
        where: {
          deletedAt: null
        }
      }),
      this.prismaService.role.findMany({
        where: {
          deletedAt: null
        },
        skip,
        take
      })
    ])
    return { totalItems, data, page, limit, totalPages: Math.ceil(totalItems / limit) }
  }

  findById(id: number): Promise<RolePermissionType | null> {
    const role = this.prismaService.role.findUnique({
      where: {
        id,
        deletedAt: null
      },
      include: {
        permissions: {
          where: {
            deletedAt: null
          }
        }
      }
    })
    return role
  }

  create({ createdById, data }: { createdById: number | null; data: CreateRoleBodyType }): Promise<RoleType> {
    return this.prismaService.role.create({
      data: {
        createdById: createdById,
        ...data
      }
    })
  }

  async update({
    id,
    updatedById,
    data
  }: {
    id: number
    updatedById: number | null
    data: UpdateRoleBodyType
  }): Promise<RoleType> {
    // Check if role exists and not deleted
    if (data.permissionIds.length > 0) {
      const permissions = await this.prismaService.permission.findMany({
        where: {
          id: { in: data.permissionIds }
        }
      })
      const deletedPermission = permissions.filter((permission) => permission.deletedAt)
      if (deletedPermission.length > 0) {
        const deletedPermissionIds = deletedPermission.map((permission) => permission.id).join(', ')
        throw new Error(`Error: The following permissions are deleted: ${deletedPermissionIds}`)
      }
    }
    return this.prismaService.role.update({
      where: {
        id,
        deletedAt: null
      },
      data: {
        name: data.name,
        description: data.description,
        isActive: data.isActive,
        updatedById: updatedById,
        permissions: {
          set: data.permissionIds.map((id) => ({ id }))
        }
      },
      include: {
        permissions: {
          where: {
            deletedAt: null
          }
        }
      }
    })
  }

  delete({ id, deletedById }: { id: number; deletedById: number | null }, isHard?: boolean): Promise<RoleType> {
    return isHard
      ? this.prismaService.role.delete({
          where: {
            id
          }
        })
      : this.prismaService.role.update({
          where: {
            id,
            deletedAt: null
          },
          data: {
            deletedAt: new Date(),
            deletedById: deletedById
          }
        })
  }
}
