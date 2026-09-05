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
  LastColumnDeletionError,
  CannotDeleteDoneColumnError
} from './board-column.error'
import { CreateBoardColumnBodyType, GetSprintParamType, UpdateBoardColumnBodyType } from './board-column.model'
import { SharedSprintRepo } from '~/shared/repositories/shared-sprint.repo'

@Injectable()
export class BoardColumnService {
  constructor(
    private readonly boardColumnRepo: BoardColumnRepo,
    private readonly sharedSprintRepo: SharedSprintRepo
  ) {}

  async findAllBySprintId(params: GetSprintParamType) {
    return await this.sharedSprintRepo.getSprintBoardDetail(params.sprintId)
  }

  async findById(id: string) {
    const boardColumn = await this.boardColumnRepo.findById({ boardColumnId: id })
    if (!boardColumn) {
      throw BoardColumnNotFoundError
    }
    return boardColumn
  }

  private resolveAutoFlags(title: string) {
    const titleLower = (title || '').toLowerCase().trim()
    const DONE_KW = ['done', 'hoàn thành', 'đã xong', 'closed', 'resolved', 'hoàn tất', 'deploy', 'released', 'finish']
    const TODO_KW = ['todo', 'to do', 'to-do', 'cần làm', 'chờ làm', 'backlog', 'mới', 'open', 'new', 'chưa làm', 'ready']
    const BLOCKED_KW = ['block', 'blocked', 'tắc', 'nghẽn', 'chờ api', 'tạm dừng', 'on hold', 'pause']
    const CANCELLED_KW = ['cancel', 'cancelled', 'hủy', 'discard', 'rejected', 'bỏ']

    if (CANCELLED_KW.some((kw) => titleLower.includes(kw))) {
      return { isDone: false, isWip: false, isBlocked: false, isCancelled: true, color: '#ef4444' }
    }
    if (DONE_KW.some((kw) => titleLower.includes(kw))) {
      return { isDone: true, isWip: false, isBlocked: false, isCancelled: false, color: '#10b981' }
    }
    if (BLOCKED_KW.some((kw) => titleLower.includes(kw))) {
      return { isDone: false, isWip: false, isBlocked: true, isCancelled: false, color: '#f59e0b' }
    }
    if (TODO_KW.some((kw) => titleLower.includes(kw))) {
      return { isDone: false, isWip: false, isBlocked: false, isCancelled: false, color: '#94a3b8' }
    }
    return {
      isDone: false,
      isWip: true,
      isBlocked: false,
      isCancelled: false,
      color: titleLower.includes('review') || titleLower.includes('test') ? '#8b5cf6' : '#3b82f6'
    }
  }

  async create(body: CreateBoardColumnBodyType) {
    const hasExplicitFlags =
      body.isDone !== undefined ||
      body.isWip !== undefined ||
      body.isBlocked !== undefined ||
      body.isCancelled !== undefined

    if (!hasExplicitFlags) {
      const autoFlags = this.resolveAutoFlags(body.title)
      return await this.boardColumnRepo.create({
        ...body,
        ...autoFlags,
        color: body.color || autoFlags.color
      })
    }

    return await this.boardColumnRepo.create(body)
  }

  async update({ id, body }: { id: string; body: UpdateBoardColumnBodyType }) {
    try {
      return await this.boardColumnRepo.update({ id, body })
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw BoardColumnNotFoundError
      }
      throw error
    }
  }

  async delete(id: string, targetColumnId?: string) {
    const column = await this.boardColumnRepo.findById({ boardColumnId: id })
    if (!column) {
      return { message: 'Board column deleted successfully' }
    }

    if (column.title.trim().toLowerCase() === 'done') {
      throw CannotDeleteDoneColumnError
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

  async reorder(sprintId: string, columnOrderIds: string[]) {
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
