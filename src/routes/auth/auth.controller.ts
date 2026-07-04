import { Body, Controller, Get, HttpCode, HttpStatus, Ip, Post, Query, Req, Res } from '@nestjs/common'
import {
  ForgotPasswordBodyDTO,
  GetAuthorizationUrlResDTO,
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
import { GoogleService } from './google.service'
import envConfig from '~/shared/config'
import { MicrosoftService } from './microsoft.service'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly googleService: GoogleService,
    private readonly microsoftService: MicrosoftService
  ) {}

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
  @IsPublic()
  @ZodSerializerDto(MessageResDTO)
  forgotPassword(@Body() body: ForgotPasswordBodyDTO) {
    return this.authService.forgotPassword(body)
  }

  @Get('google-link')
  @IsPublic()
  @ZodSerializerDto(GetAuthorizationUrlResDTO)
  getAuthorizationUrl(@UserAgent() userAgent: string, @Ip() ip: string) {
    return this.googleService.getAuthorizationUrl({ userAgent, ip })
  }

  @Get('google/callback')
  @IsPublic()
  async googleCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      const data = await this.googleService.googleCallback({ code, state })

      res.cookie('accessToken', data.accessToken, cookieOptions)
      res.cookie('refreshToken', data.refreshToken, cookieOptions)

      return res.redirect(
        `${envConfig.CLIENT_REDIRECT_URI}?accessToken=${data.accessToken}&refreshToken=${data.refreshToken}`
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Google authentication failed, Please try again anther way'
      return res.redirect(`${envConfig.CLIENT_REDIRECT_URI}?errorMessage=${message}`)
    }
  }

  @Get('microsoft-link')
  @IsPublic()
  @ZodSerializerDto(GetAuthorizationUrlResDTO)
  getMicrosoftAuthorizationUrl(@UserAgent() userAgent: string, @Ip() ip: string) {
    return this.microsoftService.getAuthorizationUrl({ userAgent, ip })
  }
  @Get('microsoft/callback')
  @IsPublic()
  async microsoftCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      const data = await this.microsoftService.microsoftCallback({ code, state })

      res.cookie('accessToken', data.accessToken, cookieOptions)
      res.cookie('refreshToken', data.refreshToken, cookieOptions)

      return res.redirect(
        `${envConfig.CLIENT_REDIRECT_URI}?accessToken=${data.accessToken}&refreshToken=${data.refreshToken}`
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Microsoft authentication failed, please try again'
      return res.redirect(`${envConfig.CLIENT_REDIRECT_URI}?errorMessage=${message}`)
    }
  }
}
