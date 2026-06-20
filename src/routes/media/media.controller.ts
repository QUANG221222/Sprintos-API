import { Body, Controller, Post } from '@nestjs/common'
import { PresignedUploadFileBodyDTO, PresignedUploadFileResDTO } from './media.dto'
import { ZodSerializerDto } from 'nestjs-zod'
import { IsPublic } from '~/shared/decorators/auth.decorator'
import { MediaService } from './media.service'

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('presigned-url')
  @ZodSerializerDto(PresignedUploadFileResDTO)
  @IsPublic()
  createPresignedUrl(@Body() body: PresignedUploadFileBodyDTO) {
    return this.mediaService.getPresignedUrl(body)
  }
}
