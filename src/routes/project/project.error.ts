import { HttpStatus, UnprocessableEntityException } from '@nestjs/common'

export const ProjectNotFoundError = new UnprocessableEntityException({
  message: 'Project not found',
  path: 'projectId',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const ProjectForbiddenError = new UnprocessableEntityException({
  message: 'You do not have permission to perform this action on the project',
  path: 'projectId',
  statusCode: HttpStatus.FORBIDDEN
})

export const ProjectIdRequiredError = new UnprocessableEntityException({
  message: 'projectId is required',
  path: 'projectId',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const CannotTransferToSelfError = new UnprocessableEntityException({
  message: 'Cannot transfer the project to yourself',
  path: 'newOwnerId',
  statusCode: HttpStatus.BAD_REQUEST
})

export const TargetUserNotMemberError = new UnprocessableEntityException({
  message: 'Target user is not an active member of this project',
  path: 'newOwnerId',
  statusCode: HttpStatus.BAD_REQUEST
})

