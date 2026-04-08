import { Body, Controller, Post, Res } from '@nestjs/common'
import {
  LoginBodyDTO,
  LoginResDTO,
  RegisterBodyDTO,
  RegisterResDTO,
  SendEmailVerificationBodyDTO,
  VerifyEmailBodyDTO
} from './auth.dto'
import { ZodSerializerDto } from 'nestjs-zod'
import { IsPublic } from '~/shared/decorators/auth.decorator'
import { AuthService } from './auth.service'
import { MessageResDTO } from '~/shared/dtos/response.dto'
import { Response } from 'express'
import { cookieOptions } from '~/shared/constants/auth.constants'

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @IsPublic()
  @ZodSerializerDto(RegisterResDTO)
  register(@Body() body: RegisterBodyDTO) {
    return this.authService.register(body)
  }

  @Post('send-email')
  @IsPublic()
  @ZodSerializerDto(MessageResDTO)
  sendEmail(@Body() body: SendEmailVerificationBodyDTO) {
    return this.authService.sendEmail(body)
  }

  @Post('verify')
  @IsPublic()
  @ZodSerializerDto(MessageResDTO)
  verifyEmail(@Body() body: VerifyEmailBodyDTO) {
    return this.authService.verifyEmail(body)
  }

  @Post('login')
  @IsPublic()
  @ZodSerializerDto(LoginResDTO)
  async login(@Body() body: LoginBodyDTO, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(body)

    res.cookie('accessToken', result.accessToken, cookieOptions)
    res.cookie('refreshToken', result.refreshToken, cookieOptions)
    return result
  }
}
