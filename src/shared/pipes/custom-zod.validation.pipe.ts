import { HttpStatus, UnprocessableEntityException } from '@nestjs/common'
import { createZodValidationPipe } from 'nestjs-zod'
import { ZodError } from 'zod'

const CustomZodValidationPipe = createZodValidationPipe({
  // provide custom validation exception factory
  createValidationException: (error: ZodError) => {
    // console.log(error.issues)
    return new UnprocessableEntityException({
      message: error.issues[0].message,
      path: error.issues[0].path.join('.'),
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY
    })
  }
})

export default CustomZodValidationPipe
