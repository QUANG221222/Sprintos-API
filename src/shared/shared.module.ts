import { Global, Module } from '@nestjs/common'
import { PrismaService } from './services/prisma.service'
import { HashingService } from './services/hashing.service'
import { TokenService } from './services/token.service'
import { JwtModule } from '@nestjs/jwt'
import { AccessTokenGuard } from './guards/access-token.guard'
import { ApiKeyGuard } from './guards/api-key.guard'
import { APP_GUARD } from '@nestjs/core'
import { AuthenticationGuard } from './guards/authentication.guard'
import { SharedUserRepository } from './repositories/shared-user.repo'
import { EmailService } from './services/email.service'
import { TwoFactorAuthService } from './services/2fa.service'
import { SharedRoleRepository } from './repositories/shared-role.repo'
import { SharedProjectRepository } from './repositories/shared-project.repo'
import { SharedProjectMemberService } from './services/shared-project-member.service'
import { SharedProjectMemberRepo } from './repositories/shared-project-member.repo'
import { S3Service } from './services/S3.service'
import { SharedSprintRepo } from './repositories/shared-sprint.repo'
import { OpenRouterService } from './services/openrouter.service'
import { RedisService } from './services/redis.service'

const sharedServices = [
  PrismaService,
  HashingService,
  TokenService,
  SharedUserRepository,
  SharedRoleRepository,
  EmailService,
  TwoFactorAuthService,
  SharedProjectRepository,
  SharedProjectMemberRepo,
  SharedProjectMemberService,
  SharedSprintRepo,
  S3Service,
  OpenRouterService,
  RedisService
]

@Global()
@Module({
  providers: [
    ...sharedServices,
    AccessTokenGuard,
    ApiKeyGuard,
    {
      provide: APP_GUARD,
      useClass: AuthenticationGuard
    }
  ],
  exports: sharedServices,
  imports: [JwtModule]
})
export class SharedModule {}
