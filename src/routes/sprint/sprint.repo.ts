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

  async create(body: CreateSprintBodyType, userId: string): Promise<SprintType> {
    const newSprint = await this.prismaService.sprint.create({
      data: {
        ...body,
        createdById: userId
      }
    })

    // Find previous sprint in the project to inherit customized board columns
    const previousSprint = await this.prismaService.sprint.findFirst({
      where: {
        projectId: body.projectId,
        id: { not: newSprint.id },
        deletedAt: null
      },
      orderBy: { createdAt: 'desc' },
      include: {
        boardColumns: {
          where: { deletedAt: null }
        }
      }
    })

    if (previousSprint && previousSprint.boardColumns.length > 0) {
      const orderIds = previousSprint.boardColumnIds || []
      const sortedPrevCols = [...previousSprint.boardColumns].sort((a, b) => {
        const idxA = orderIds.indexOf(a.id)
        const idxB = orderIds.indexOf(b.id)
        if (idxA !== -1 && idxB !== -1) return idxA - idxB
        return 0
      })
      const columnTitles = sortedPrevCols.map((c) => c.title)

      const createdColumnIds: string[] = []
      for (const title of columnTitles) {
        const col = await this.prismaService.boardColumn.create({
          data: {
            sprintId: newSprint.id,
            title
          }
        })
        createdColumnIds.push(col.id)
      }

      return await this.prismaService.sprint.update({
        where: { id: newSprint.id },
        data: {
          boardColumnIds: createdColumnIds
        }
      })
    }

    return newSprint
  }

  async update({ id, body, userId }: { id: string; body: UpdateSprintBodyType; userId: string }): Promise<SprintType> {
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

  async delete({ id, userId }: { id: string; userId: string }, isHard?: boolean): Promise<SprintType> {
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
