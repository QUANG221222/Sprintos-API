import { UnprocessableEntityException } from '@nestjs/common'
import { createZodValidationPipe } from 'nestjs-zod'
import { ZodError } from 'zod'

const CustomZodValidationPipe = createZodValidationPipe({
  // provide custom validation exception factory
  createValidationException: (error: ZodError) => {
    // console.log(error.issues)
    return new UnprocessableEntityException(
      error.issues.map((error) => ({
        ...error,
        path: error.path.join('.')
      }))
    )
  }
})

export default CustomZodValidationPipe
