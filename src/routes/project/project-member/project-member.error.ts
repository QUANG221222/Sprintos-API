import { ConflictException, HttpStatus, UnprocessableEntityException } from '@nestjs/common'

export const ProjectMemberNotFoundError = new UnprocessableEntityException({
  message: 'Project member not found',
  path: 'projectMemberId',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const ProjectMemberAlreadyExistsError = new ConflictException({
  message: 'Project member already exists in this project',
  path: 'memberId',
  statusCode: HttpStatus.CONFLICT
})

export const ProjectMemberInvalidReferenceError = new UnprocessableEntityException({
  message: 'Project or user reference is invalid',
  path: 'projectId',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const ProjectMemberInviteInvalidError = new UnprocessableEntityException({
  message: 'Invalid invitation token or email',
  path: 'inviteToken',
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY
})

export const ProjectMemberOwnerOnlyError = new UnprocessableEntityException({
  message: 'Only project owners can manage members',
  path: 'projectId',
  statusCode: HttpStatus.FORBIDDEN
})

export const ProjectMemberRoleChangeForbiddenError = new UnprocessableEntityException({
  message: 'Cannot change role of another owner. Please contact the primary owner.',
  path: 'memberId',
  statusCode: HttpStatus.BAD_REQUEST
})

export const ProjectMemberPrimaryOwnerDeleteError = new UnprocessableEntityException({
  message: 'Cannot remove the primary owner from the project',
  path: 'memberId',
  statusCode: HttpStatus.BAD_REQUEST
})
