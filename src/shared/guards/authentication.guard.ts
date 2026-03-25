import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, HttpException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AUTH_TYPE_KEY, AuthTypeDecoratorPayload } from '../decorators/auth.decorator'
import { AuthType, ConditionGuard } from '../constants/auth.constants'
import { AccessTokenGuard } from '~/shared/guards/access-token.guard'
import { ApiKeyGuard } from './api-key.guard'

@Injectable()
export class AuthenticationGuard implements CanActivate {
  private readonly authTypeGuardMap: Record<string, CanActivate>
  constructor(
    private readonly reflector: Reflector,
    private readonly AccessTokenGuard: AccessTokenGuard,
    private readonly ApiKeyGuard: ApiKeyGuard
  ) {
    this.authTypeGuardMap = {
      [AuthType.Bearer]: this.AccessTokenGuard,
      [AuthType.ApiKey]: this.ApiKeyGuard,
      [AuthType.None]: { canActivate: () => true }
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authTypeValue = this.getAuthTypeValue(context)

    const guards = authTypeValue.authTypes.map((authType) => this.authTypeGuardMap[authType])

    return authTypeValue.option.condition === ConditionGuard.And
      ? this.handleAndCondition(guards, context)
      : this.handleOrCondition(guards, context)
  }

  private getAuthTypeValue(context: ExecutionContext): AuthTypeDecoratorPayload {
    return (
      this.reflector.getAllAndOverride<AuthTypeDecoratorPayload | undefined>(AUTH_TYPE_KEY, [
        context.getHandler(),
        context.getClass()
      ]) ?? { authTypes: [AuthType.Bearer], option: { condition: ConditionGuard.And } }
    )
  }

  private async handleOrCondition(guards: CanActivate[], context: ExecutionContext): Promise<boolean> {
    let lastError: any = null

    // Scan through guards and return true if any guard allows access
    for (const guard of guards) {
      try {
        if (await guard.canActivate(context)) {
          return true
        }
      } catch (error) {
        lastError = error
      }
    }
    if (lastError instanceof HttpException) {
      throw lastError
    }
    throw new UnauthorizedException()
  }

  private async handleAndCondition(guards: CanActivate[], context: ExecutionContext): Promise<boolean> {
    // All guards must allow access
    try {
      for (const guard of guards) {
        if (!(await guard.canActivate(context))) {
          throw new UnauthorizedException()
        }
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      throw new UnauthorizedException()
    }
    return true
  }
}
