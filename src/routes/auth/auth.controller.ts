import { Body, Controller, HttpCode, HttpStatus, Ip, Post, Req, Res } from '@nestjs/common'
import {
  ForgotPasswordBodyDTO,
  LoginBodyDTO,
  LoginResDTO,
  RefreshTokenResDTO,
  RegisterBodyDTO,
  RegisterResDTO,
  SendEmailVerificationBodyDTO,
  VerifyEmailBodyDTO
} from './auth.dto'
import { ZodSerializerDto } from 'nestjs-zod'
import { IsPublic } from '~/shared/decorators/auth.decorator'
import { AuthService } from './auth.service'
import { MessageResDTO } from '~/shared/dtos/response.dto'
import { Request, Response } from 'express'
import { cookieOptions } from '~/shared/constants/auth.constants'
import { UserAgent } from '~/shared/decorators/user-agent.decorator'

@Controller('auth')
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
  async login(
    @Body() body: LoginBodyDTO,
    @Res({ passthrough: true }) res: Response,
    @UserAgent() userAgent: string,
    @Ip() ip
  ) {
    const result = await this.authService.login({
      ...body,
      userAgent,
      ip
    })

    res.cookie('accessToken', result.accessToken, cookieOptions)
    res.cookie('refreshToken', result.refreshToken, cookieOptions)
    return result
  }

  @Post('refresh-token')
  @ZodSerializerDto(RefreshTokenResDTO)
  @HttpCode(HttpStatus.OK)
  @IsPublic()
  async refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @UserAgent() userAgent: string,
    @Ip() ip
  ) {
    const result = await this.authService.refreshToken({
      req,
      userAgent,
      ip
    })
    res.cookie('accessToken', result.accessToken, cookieOptions)
    res.cookie('refreshToken', result.refreshToken, cookieOptions)
    return result
  }

  @Post('logout')
  @ZodSerializerDto(MessageResDTO)
  async logout(@Res({ passthrough: true }) res: Response, @Req() req: Request) {
    const result = await this.authService.logout(req)

    res.clearCookie('accessToken', cookieOptions)

    res.clearCookie('refreshToken', cookieOptions)

    return result
  }

  @Post('forgot-password')
  forgotPassword(@Body() body: ForgotPasswordBodyDTO) {
    return this.authService.forgotPassword(body)
  }
}
