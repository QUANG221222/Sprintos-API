import { Injectable } from '@nestjs/common'
import { BoardColumnRepo } from './board-column.repo'
import { isNotFoundPrismaError } from '~/shared/helpers'
import {
  BoardColumnNotFoundError,
  InvalidColumnsCountError,
  ColumnNotBelongToSprintError,
  DuplicateColumnIdsError,
  TargetColumnNotFoundError,
  ColumnContainsTasksError,
  LastColumnDeletionError
} from './board-column.error'
import { CreateBoardColumnBodyType, GetSprintParamType, UpdateBoardColumnBodyType } from './board-column.model'
import { SprintBoardDetailType } from '~/shared/models/shared-sprint-board.model'
import { SharedSprintRepo } from '~/shared/repositories/shared-sprint.repo'

@Injectable()
export class BoardColumnService {
  constructor(
    private readonly boardColumnRepo: BoardColumnRepo,
    private readonly sharedSprintRepo: SharedSprintRepo
  ) {}

  async findAllBySprintId(params: GetSprintParamType) {
    return await this.boardColumnRepo.findAllBySprintId(params)
  }

  async findById(id: number) {
    const boardColumn = await this.boardColumnRepo.findById({ boardColumnId: id })
    if (!boardColumn) {
      throw BoardColumnNotFoundError
    }
    return boardColumn
  }

  async create(body: CreateBoardColumnBodyType) {
    return await this.boardColumnRepo.create(body)
  }

  async update({ id, body }: { id: number; body: UpdateBoardColumnBodyType }) {
    try {
      return await this.boardColumnRepo.update({ id, body })
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw BoardColumnNotFoundError
      }
      throw error
    }
  }

  async delete(id: number, targetColumnId?: number) {
    const column = await this.boardColumnRepo.findById({ boardColumnId: id })
    if (!column) {
      throw BoardColumnNotFoundError
    }

    const totalColumns = await this.boardColumnRepo.countBySprintId(column.sprintId)
    if (totalColumns <= 1) {
      throw LastColumnDeletionError
    }

    const tasksCount = await this.boardColumnRepo.countTasksInColumn(id)
    if (tasksCount > 0) {
      if (!targetColumnId) {
        throw ColumnContainsTasksError
      }

      const targetColumn = await this.boardColumnRepo.findById({ boardColumnId: targetColumnId })
      if (!targetColumn || targetColumn.sprintId !== column.sprintId) {
        throw TargetColumnNotFoundError
      }

      await this.boardColumnRepo.moveTasksToNewColumn(id, targetColumnId)
    }

    try {
      await this.boardColumnRepo.delete(id)
      return await this.sharedSprintRepo.getSprintBoardDetail(column.sprintId)
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw BoardColumnNotFoundError
      }
      throw error
    }
  }

  async reorder(sprintId: number, columnOrderIds: number[]): Promise<SprintBoardDetailType> {
    const activeColumns = await this.boardColumnRepo.findActiveColumns(sprintId)
    const activeColumnIds = activeColumns.map((col) => col.id)

    if (new Set(columnOrderIds).size !== columnOrderIds.length) {
      throw DuplicateColumnIdsError
    }

    if (columnOrderIds.length !== activeColumnIds.length) {
      throw InvalidColumnsCountError
    }

    const activeSet = new Set(activeColumnIds)
    for (const id of columnOrderIds) {
      if (!activeSet.has(id)) {
        throw ColumnNotBelongToSprintError(id)
      }
    }

    return await this.boardColumnRepo.reorderColumns(sprintId, columnOrderIds)
  }
}
