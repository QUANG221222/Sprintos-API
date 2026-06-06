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
  statusCode: HttpStatus.BAD_REQUEST
})

export const missingEmailsError = (emails: string[], existingEmails: string[]) => {
  const missingEmails = emails.filter((email) => !existingEmails.includes(email))
  return new UnprocessableEntityException({
    message: `The following member emails do not exist: ${missingEmails.join(', ')}`,
    path: 'member.email',
    statusCode: HttpStatus.BAD_REQUEST
  })
}


