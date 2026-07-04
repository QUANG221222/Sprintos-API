import { HttpStatus, UnprocessableEntityException } from '@nestjs/common'

export const SprintNotFoundError = new UnprocessableEntityException({
  message: 'Sprint not found',
  path: 'sprintId',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})
