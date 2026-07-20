import { HttpStatus, UnprocessableEntityException } from '@nestjs/common'

export const UserAlreadyExistsException = new UnprocessableEntityException({
  message: 'Error.UserAlreadyExists',
  path: 'email',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const CannotUpdateAdminUserException = new UnprocessableEntityException({
  message: 'Error.CannotUpdateAdminUser',
  path: 'roleId',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const CannotDeleteAdminUserException = new UnprocessableEntityException({
  message: 'Error.CannotDeleteAdminUser',
  path: 'roleId',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

// Only admin can update role is ADMIN
export const CannotSetAdminRoleToUserException = new UnprocessableEntityException({
  message: 'Error.CannotSetAdminRoleToUser',
  path: 'roleId',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const RoleNotFoundException = new UnprocessableEntityException({
  message: 'Error.RoleNotFound',
  path: 'roleId',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

// Cannot update, delete by yourself
export const CannotUpdateOrDeleteByYourselfException = new UnprocessableEntityException({
  message: 'Error.CannotUpdateOrDeleteByYourself',
  path: 'id',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})
