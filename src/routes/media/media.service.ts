import { Injectable } from '@nestjs/common'
import { S3Service } from 'src/shared/services/S3.service'
import {
  DeleteFileBodyType,
  PresignedGetFileQueryType,
  PresignedUploadFileBodyType
} from './media.model'
import { v4 as uuidv4 } from 'uuid'

@Injectable()
export class MediaService {
  constructor(private readonly s3Service: S3Service) {}

  /**
   * Generates a presigned PUT URL for uploading files directly to S3
   * and a signed GET URL so the client can immediately display private files
   */
  async getPresignedUploadUrl(body: PresignedUploadFileBodyType) {
    const sanitizedFilename = body.filename.replace(/[^a-zA-Z0-9.-]/g, '_')
    const folder = body.folder || 'uploads'
    const fileKey = `${folder}/${Date.now()}-${uuidv4()}-${sanitizedFilename}`

    const { presignedUrl, contentType } = await this.s3Service.createPresignedPutUrl(
      fileKey,
      body.contentType
    )

    // Generate signed GET URL (valid for 7 days) so the uploaded file can be displayed without 403 error
    const signedGetUrl = await this.s3Service.createPresignedGetUrl(fileKey, 7 * 24 * 3600)

    return {
      presignedUrl,
      fileKey,
      url: signedGetUrl,
      contentType
    }
  }

  /**
   * Generates a presigned GET URL for viewing or downloading private files
   */
  async getPresignedDownloadUrl(query: PresignedGetFileQueryType) {
    const presignedUrl = await this.s3Service.createPresignedGetUrl(query.fileKey)
    return {
      presignedUrl,
      fileKey: query.fileKey
    }
  }

  /**
   * Deletes a file from S3 bucket
   */
  async deleteFile(body: DeleteFileBodyType) {
    await this.s3Service.deleteObject(body.fileKey)
    return {
      success: true,
      message: 'File deleted successfully'
    }
  }
}
