import { Injectable } from '@nestjs/common'
import { PrismaService } from '~/shared/services/prisma.service'
import { GetListQueryType } from '~/shared/models/request.model'
import {
  CreateSprintBodyType,
  GetListSprintResType,
  GetSprintParamType,
  SprintType,
  UpdateSprintBodyType
} from './sprint.model'
import { GetProjectParamType } from '~/shared/models/shared-project.model'

@Injectable()
export class SprintRepo {
  constructor(private readonly prismaService: PrismaService) {}

  async findAllByProjectId(params: GetProjectParamType, pagination: GetListQueryType): Promise<GetListSprintResType> {
    const { page, limit } = pagination
    const skip = (page - 1) * limit
    const take = limit

    const [totalItems, data] = await Promise.all([
      this.prismaService.sprint.count({
        where: {
          projectId: params.projectId,
          deletedAt: null
        }
      }),
      this.prismaService.sprint.findMany({
        where: {
          projectId: params.projectId,
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

  async findById(params: GetSprintParamType): Promise<SprintType | null> {
    return await this.prismaService.sprint.findFirst({
      where: {
        id: params.sprintId,
        deletedAt: null
      }
    })
  }

  async create(body: CreateSprintBodyType, userId: number): Promise<SprintType> {
    return await this.prismaService.sprint.create({
      data: {
        ...body,
        createdById: userId
      }
    })
  }

  async update({ id, body, userId }: { id: number; body: UpdateSprintBodyType; userId: number }): Promise<SprintType> {
    return await this.prismaService.sprint.update({
      where: {
        id,
        deletedAt: null
      },
      data: {
        ...body,
        updatedAt: new Date(),
        updatedById: userId
      }
    })
  }

  async delete({ id, userId }: { id: number; userId: number }, isHard?: boolean): Promise<SprintType> {
    return isHard
      ? await this.prismaService.sprint.delete({
          where: {
            id
          }
        })
      : await this.prismaService.sprint.update({
          where: {
            id,
            deletedAt: null
          },
          data: {
            deletedAt: new Date(),
            deletedById: userId
          }
        })
  }
}
