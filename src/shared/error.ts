import { BadRequestException, HttpStatus, NotFoundException, UnprocessableEntityException } from '@nestjs/common'

export const NotFoundRecordException = new NotFoundException({
  message: 'Not Found',
  path: 'record',
  statusCode: HttpStatus.NOT_FOUND
})

export const InvalidPasswordException = new UnprocessableEntityException({
  message: 'Invalid Password',
  path: 'password',
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

export const SprintNotFoundError = new BadRequestException({
  message: 'Sprint not found',
  path: 'sprintId',
  statusCode: HttpStatus.BAD_REQUEST
})
