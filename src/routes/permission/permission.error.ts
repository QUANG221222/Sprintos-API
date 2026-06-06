import { HttpStatus, UnprocessableEntityException } from '@nestjs/common'

export const PermissionAlreadyExistsException = new UnprocessableEntityException({
  message: 'Error.PermissionAlreadyExists',
  path: ['path', 'method'],
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})
