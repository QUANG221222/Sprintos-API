import { Injectable } from '@nestjs/common'
import { PrismaService } from '~/shared/services/prisma.service'
import { SprintBoardDetailType } from '~/shared/models/shared-sprint-board.model'
import { SourceColumnNotFoundError } from './board-column.error'
import {
  BoardColumnType,
  CreateBoardColumnBodyType,
  GetBoardColumnParamType,
  GetListBoardColumnResType,
  GetSprintParamType,
  UpdateBoardColumnBodyType
} from './board-column.model'
import { SharedSprintRepo } from '~/shared/repositories/shared-sprint.repo'

@Injectable()
export class BoardColumnRepo {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly sharedSprintRepo: SharedSprintRepo
  ) {}

  async findAllBySprintId(params: GetSprintParamType): Promise<GetListBoardColumnResType> {
    const [sprint, data] = await Promise.all([
      this.prismaService.sprint.findUnique({
        where: { id: params.sprintId }
      }),
      this.prismaService.boardColumn.findMany({
        where: {
          sprintId: params.sprintId
        }
      })
    ])

    const columnOrderIds = sprint?.boardColumnIds || []
    const sortedData = [...data].sort((a, b) => {
      const indexA = columnOrderIds.indexOf(a.id)
      const indexB = columnOrderIds.indexOf(b.id)
      if (indexA !== -1 && indexB !== -1) return indexA - indexB
      if (indexA !== -1) return -1
      if (indexB !== -1) return 1
      return a.id - b.id
    })

    return {
      data: sortedData as BoardColumnType[],
      totalItems: sortedData.length
    }
  }

  async findById(params: GetBoardColumnParamType): Promise<BoardColumnType | null> {
    return (await this.prismaService.boardColumn.findFirst({
      where: {
        id: params.boardColumnId
      }
    })) as BoardColumnType | null
  }

  async create(body: CreateBoardColumnBodyType): Promise<BoardColumnType> {
    const createdColumn = (await this.prismaService.boardColumn.create({
      data: {
        sprintId: body.sprintId,
        title: body.title
      }
    })) as BoardColumnType

    await this.prismaService.sprint.update({
      where: { id: body.sprintId },
      data: {
        boardColumnIds: {
          push: createdColumn.id
        }
      }
    })

    return createdColumn
  }

  async update({ id, body }: { id: number; body: UpdateBoardColumnBodyType }): Promise<BoardColumnType> {
    return (await this.prismaService.boardColumn.update({
      where: {
        id
      },
      data: {
        ...body,
        updatedAt: new Date()
      }
    })) as BoardColumnType
  }

  async delete(id: number): Promise<BoardColumnType> {
    const deletedColumn = (await this.prismaService.boardColumn.delete({
      where: {
        id
      }
    })) as BoardColumnType

    const sprint = await this.prismaService.sprint.findUnique({
      where: { id: deletedColumn.sprintId }
    })

    if (sprint) {
      const updatedIds = sprint.boardColumnIds.filter((colId) => colId !== id)
      await this.prismaService.sprint.update({
        where: { id: deletedColumn.sprintId },
        data: {
          boardColumnIds: updatedIds
        }
      })
    }

    return deletedColumn
  }

  async countBySprintId(sprintId: number): Promise<number> {
    return await this.prismaService.boardColumn.count({
      where: { sprintId, deletedAt: null }
    })
  }

  async findActiveColumns(sprintId: number): Promise<BoardColumnType[]> {
    return (await this.prismaService.boardColumn.findMany({
      where: { sprintId, deletedAt: null }
    })) as BoardColumnType[]
  }

  async countTasksInColumn(columnId: number): Promise<number> {
    return await this.prismaService.task.count({
      where: { boardColumnId: columnId, deletedAt: null }
    })
  }

  async moveTasksToNewColumn(sourceColumnId: number, targetColumnId: number): Promise<SprintBoardDetailType> {
    const column = await this.prismaService.boardColumn.findUnique({
      where: { id: sourceColumnId }
    })
    if (!column) {
      throw SourceColumnNotFoundError
    }
    await this.prismaService.task.updateMany({
      where: { boardColumnId: sourceColumnId, deletedAt: null },
      data: { boardColumnId: targetColumnId }
    })
    return await this.sharedSprintRepo.getSprintBoardDetail(column.sprintId)
  }

  async reorderColumns(sprintId: number, columnOrderIds: number[]): Promise<SprintBoardDetailType> {
    await this.prismaService.sprint.update({
      where: { id: sprintId },
      data: {
        boardColumnIds: columnOrderIds
      }
    })
    return await this.sharedSprintRepo.getSprintBoardDetail(sprintId)
  }
}
