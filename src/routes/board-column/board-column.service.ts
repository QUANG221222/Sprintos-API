import { BadRequestException, Injectable } from '@nestjs/common'
import { BoardColumnRepo } from './board-column.repo'
import { isNotFoundPrismaError } from '~/shared/helpers'
import { BoardColumnNotFoundError } from './board-column.error'
import { CreateBoardColumnBodyType, GetSprintParamType, UpdateBoardColumnBodyType } from './board-column.model'

@Injectable()
export class BoardColumnService {
  constructor(private readonly boardColumnRepo: BoardColumnRepo) {}

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
      throw new BadRequestException('Cannot delete the last board column in a sprint')
    }

    const tasksCount = await this.boardColumnRepo.countTasksInColumn(id)
    if (tasksCount > 0) {
      if (!targetColumnId) {
        throw new BadRequestException(
          'Column contains tasks. Please specify a target column to move the tasks to before deleting.'
        )
      }

      const targetColumn = await this.boardColumnRepo.findById({ boardColumnId: targetColumnId })
      if (!targetColumn || targetColumn.sprintId !== column.sprintId) {
        throw new BadRequestException('Target column not found or belongs to a different sprint')
      }

      await this.boardColumnRepo.moveTasksToNewColumn(id, targetColumnId)
    }

    try {
      await this.boardColumnRepo.delete(id)
      return { message: 'Board column deleted successfully' }
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw BoardColumnNotFoundError
      }
      throw error
    }
  }

  async reorder(sprintId: number, columnOrderIds: number[]) {
    await this.boardColumnRepo.reorderColumns(sprintId, columnOrderIds)
    return { message: 'Board columns reordered successfully' }
  }
}
