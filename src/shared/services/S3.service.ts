import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Injectable } from '@nestjs/common'
import envConfig from '../config'
import mime from 'mime-types'

@Injectable()
export class S3Service {
  private s3Client: S3Client

  constructor() {
    this.s3Client = new S3Client({
      region: envConfig.S3_REGION,
      credentials: {
        accessKeyId: envConfig.S3_ACCESS_KEY,
        secretAccessKey: envConfig.S3_SECRET_KEY
      }
    })
  }

  /**
   * Generate a Presigned PUT URL for client-side direct upload
   * @param fileKey S3 Object key (e.g. 'uploads/1723812345-uuid-filename.png')
   * @param contentType MIME type of the file
   * @param expiresIn Expiration time in seconds (default: 300s / 5 mins)
   */
  async createPresignedPutUrl(
    fileKey: string,
    contentType?: string,
    expiresIn = 300
  ) {
    const mimeType = contentType || mime.lookup(fileKey) || 'application/octet-stream'
    const command = new PutObjectCommand({
      Bucket: envConfig.S3_BUCKET_NAME,
      Key: fileKey,
      ContentType: mimeType
    })

    const presignedUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn
    })

    return {
      presignedUrl,
      fileKey,
      contentType: mimeType
    }
  }

  /**
   * Generate a Presigned GET URL for viewing / downloading private files
   * @param fileKey S3 Object key
   * @param expiresIn Expiration time in seconds (default: 3600s / 1 hour)
   */
  async createPresignedGetUrl(fileKey: string, expiresIn = 3600) {
    const command = new GetObjectCommand({
      Bucket: envConfig.S3_BUCKET_NAME,
      Key: fileKey
    })

    return await getSignedUrl(this.s3Client, command, {
      expiresIn
    })
  }

  /**
   * Delete an object directly from S3 bucket
   * @param fileKey S3 Object key to delete
   */
  async deleteObject(fileKey: string) {
    const command = new DeleteObjectCommand({
      Bucket: envConfig.S3_BUCKET_NAME,
      Key: fileKey
    })

    return await this.s3Client.send(command)
  }
}
