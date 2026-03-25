import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { AccessTokenPayLoad } from '../types/jwt.type'
import { REQUEST_USER_KEY } from '../constants/auth.constants'

export const ActiveUser = createParamDecorator(
  (field: keyof AccessTokenPayLoad | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest()
    const user: AccessTokenPayLoad | undefined = request[REQUEST_USER_KEY]
    return field ? user?.[field] : user
  }
)
