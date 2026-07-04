import { HttpStatus, UnprocessableEntityException } from '@nestjs/common'

export const BoardColumnNotFoundError = new UnprocessableEntityException({
  message: 'Board column not found',
  path: 'boardColumnId',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})
