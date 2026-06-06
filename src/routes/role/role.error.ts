import { ForbiddenException, HttpStatus, UnprocessableEntityException } from '@nestjs/common'

export const RoleAlreadyExistsException = new UnprocessableEntityException({
  message: 'Error.RoleAlreadyExists',
  path: 'name',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const ProhibitedActionOnBaseRoleException = new ForbiddenException({
  message: 'Error.ProhibitedActionOnBaseRole',
  path: 'id',
  statusCode: HttpStatus.FORBIDDEN
})
