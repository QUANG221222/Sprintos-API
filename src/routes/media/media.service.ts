import { Injectable } from '@nestjs/common'
import { S3Service } from 'src/shared/services/S3.service'
import { PresignedUploadFileBodyType } from './media.model'
import envConfig from 'src/shared/config'

@Injectable()
export class MediaService {
  constructor(private readonly s3Service: S3Service) {}

  async getPresignedUrl(body: PresignedUploadFileBodyType) {
    const fileName = `uploads/${Date.now()}-${body.filename}`
    const presignedUrl = await this.s3Service.createPresignedUrlWithClient(fileName)
    const url = `https://${envConfig.S3_BUCKET_NAME}.s3.${envConfig.S3_REGION}.amazonaws.com/${fileName}`
    return {
      presignedUrl,
      url
    }
  }
}

