import { Module } from '@nestjs/common'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { AuthRepo } from './auth.repo'
import { GoogleService } from './google.service'
import { MicrosoftService } from './microsoft.service'

@Module({
  providers: [AuthService, AuthRepo, GoogleService, MicrosoftService],
  controllers: [AuthController]
})
export class AuthModule {}
