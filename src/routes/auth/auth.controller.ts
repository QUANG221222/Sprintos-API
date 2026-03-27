import { Body, Controller, Post } from '@nestjs/common'
import { RegisterBodyDTO, RegisterResDTO, SendEmailVerificationBodyDTO, VerifyEmailBodyDTO } from './auth.dto'
import { ZodSerializerDto } from 'nestjs-zod'
import { IsPublic } from '~/shared/decorators/auth.decorator'
import { AuthService } from './auth.service'
import { MessageResDTO } from '~/shared/dtos/response.dto'

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
}
