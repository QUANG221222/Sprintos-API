import { PutObjectCommand, S3 } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Injectable } from '@nestjs/common'
import envConfig from '../config'
import mine from 'mime-types'

@Injectable()
export class S3Service {
  private s3: S3

  constructor() {
    this.s3 = new S3({
      region: envConfig.S3_REGION,
      credentials: {
        secretAccessKey: envConfig.S3_SECRET_KEY,
        accessKeyId: envConfig.S3_ACCESS_KEY
      }
    })
  }

  async createPresignedUrlWithClient(filename: string) {
    const mineType = mine.lookup(filename) || 'application/octet-stream'
    const command = new PutObjectCommand({ Bucket: envConfig.S3_BUCKET_NAME, Key: filename, ContentType: mineType })
    return await getSignedUrl(this.s3, command, { expiresIn: 300 })
  }
}
