import { Module } from '@nestjs/common'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { AuthRepo } from './auth.repo'

@Module({
  providers: [AuthService, AuthRepo],
  controllers: [AuthController]
})
export class AuthModule {}
