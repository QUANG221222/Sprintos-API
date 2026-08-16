import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common'
import {
  DeleteFileBodyDTO,
  DeleteFileResDTO,
  PresignedGetFileQueryDTO,
  PresignedGetFileResDTO,
  PresignedUploadFileBodyDTO,
  PresignedUploadFileResDTO
} from './media.dto'
import { ZodSerializerDto } from 'nestjs-zod'
import { MediaService } from './media.service'
import { IsPublic } from '~/shared/decorators/auth.decorator'

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  /**
   * Request Presigned PUT URL for uploading file directly to AWS S3
   */
  @Post('presigned-url')
  @IsPublic()
  @ZodSerializerDto(PresignedUploadFileResDTO)
  createPresignedUploadUrl(@Body() body: PresignedUploadFileBodyDTO) {
    return this.mediaService.getPresignedUploadUrl(body)
  }

  /**
   * Request Presigned GET URL for viewing / downloading private S3 file
   */
  @Get('presigned-url')
  @IsPublic()
  @ZodSerializerDto(PresignedGetFileResDTO)
  createPresignedDownloadUrl(@Query() query: PresignedGetFileQueryDTO) {
    return this.mediaService.getPresignedDownloadUrl(query)
  }

  /**
   * Delete an object from AWS S3
   */
  @Delete('file')
  @IsPublic()
  @ZodSerializerDto(DeleteFileResDTO)
  deleteFile(@Body() body: DeleteFileBodyDTO) {
    return this.mediaService.deleteFile(body)
  }
}
