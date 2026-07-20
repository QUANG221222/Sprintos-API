import { Injectable } from '@nestjs/common'
import { CreateUserBodyType, GetUsersQueryType, GetUsersResType } from './user.model'
import { PrismaService } from '~/shared/services/prisma.service'
import { UserType } from '~/shared/models/shared-user.model'

@Injectable()
export class UserRepository {
  constructor(private readonly prismaService: PrismaService) {}
  async list(navigation: GetUsersQueryType): Promise<GetUsersResType> {
    const { page, limit } = navigation
    const skip = (page - 1) * limit
    const take = limit
    const [totalItems, data] = await Promise.all([
      this.prismaService.user.count({
        where: {
          deletedAt: null
        }
      }),
      this.prismaService.user.findMany({
        where: {
          deletedAt: null
        },
        skip,
        take,
        include: {
          role: true
        }
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

  create({ createdById, data }: { createdById: number | null; data: CreateUserBodyType }): Promise<UserType> {
    return this.prismaService.user.create({
      data: {
        ...data,
        createdById
      }
    })
  }

  delete({ id, deletedById }: { id: number; deletedById: number | null }, isHard?: boolean): Promise<UserType> {
    return isHard
      ? this.prismaService.user.delete({
          where: {
            id
          }
        })
      : this.prismaService.user.update({
          where: {
            id,
            deletedAt: null
          },
          data: {
            deletedById,
            deletedAt: new Date()
          }
        })
  }
}
