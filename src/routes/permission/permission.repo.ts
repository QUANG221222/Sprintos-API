import { Injectable } from '@nestjs/common'
import {
  CreatePermissionBodyType,
  GetPermissionDetailResType,
  GetPermissionQueryType,
  GetPermissionResType,
  PermissionType
} from './permission.model'
import { PrismaService } from '~/shared/services/prisma.service'

@Injectable()
export class PermissionRepository {
  constructor(private readonly prismaService: PrismaService) {}
  async list(pagination: GetPermissionQueryType): Promise<GetPermissionResType> {
    const { page, limit } = pagination
    const skip = (page - 1) * limit
    const take = limit
    const [totalItems, data] = await Promise.all([
      this.prismaService.permission.count({
        where: {
          deletedAt: null
        }
      }),
      this.prismaService.permission.findMany({
        where: {
          deletedAt: null
        },
        skip,
        take
      })
    ])
    return {
      data,
      totalItems,
      page,
      limit,
      totalPages: Math.ceil(totalItems / limit)
    }
  }

  async findById(permissionId: string): Promise<GetPermissionDetailResType | null> {
    return await this.prismaService.permission.findUnique({
      where: {
        id: permissionId,
        deletedAt: null
      }
    })
  }

  async create({
    createdById,
    data
  }: {
    createdById: string | null
    data: CreatePermissionBodyType
  }): Promise<GetPermissionDetailResType> {
    return await this.prismaService.permission.create({
      data: {
        ...data,
        createdById
      }
    })
  }

  async update({
    permissionId,
    updatedById,
    data
  }: {
    permissionId: string
    updatedById: string | null
    data: Partial<CreatePermissionBodyType>
  }): Promise<GetPermissionDetailResType> {
    return await this.prismaService.permission.update({
      where: {
        id: permissionId,
        deletedAt: null
      },
      data: {
        updatedById,
        updatedAt: new Date(),
        ...data
      }
    })
  }

  async delete(
    { permissionId, deletedById }: { permissionId: string; deletedById: string | null },
    isHard?: boolean
  ): Promise<PermissionType> {
    return isHard
      ? await this.prismaService.permission.delete({
          where: {
            id: permissionId
          }
        })
      : await this.prismaService.permission.update({
          where: {
            id: permissionId,
            deletedAt: null
          },
          data: {
            deletedAt: new Date(),
            deletedById
          }
        })
  }
}
