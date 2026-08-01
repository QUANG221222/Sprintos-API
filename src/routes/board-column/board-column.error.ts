import { HttpStatus, UnprocessableEntityException, BadRequestException } from '@nestjs/common'

export const BoardColumnNotFoundError = new UnprocessableEntityException({
  message: 'Board column not found',
  path: 'boardColumnId',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const InvalidColumnsCountError = new BadRequestException({
  message: 'The number of column IDs provided does not match the active columns in the sprint',
  path: 'columnOrderIds',
  statusCode: HttpStatus.BAD_REQUEST
})

export const ColumnNotBelongToSprintError = (columnId: string | number) =>
  new BadRequestException({
    message: `Column with ID ${columnId} does not exist in this sprint or has been deleted`,
    path: 'columnOrderIds',
    statusCode: HttpStatus.BAD_REQUEST
  })

export const SourceColumnNotFoundError = new BadRequestException({
  message: 'Source column not found',
  path: 'sourceColumnId',
  statusCode: HttpStatus.BAD_REQUEST
})

export const DuplicateColumnIdsError = new BadRequestException({
  message: 'Duplicate column IDs are not allowed in reordering',
  path: 'columnOrderIds',
  statusCode: HttpStatus.BAD_REQUEST
})

export const ColumnContainsTasksError = new BadRequestException({
  message: 'Column contains tasks. Please specify a target column to move the tasks to before deleting.',
  path: 'columnId',
  statusCode: HttpStatus.BAD_REQUEST
})

export const TargetColumnNotFoundError = new BadRequestException({
  message: 'Target column not found or belongs to a different sprint',
  path: 'columnId',
  statusCode: HttpStatus.BAD_REQUEST
})

export const LastColumnDeletionError = new BadRequestException({
  message: 'Cannot delete the last board column in a sprint.',
  path: 'columnId',
  statusCode: HttpStatus.BAD_REQUEST
})
