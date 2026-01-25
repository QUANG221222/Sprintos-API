import multer from 'multer'
import { CloudinaryStorage } from 'multer-storage-cloudinary'
import { cloudinary } from '~/configs/cloudinary'
import { Request } from 'express'

/**
 * Create Cloudinary storage for multer
 * @param folderName The folder name in Cloudinary
 * @param isVideo Whether the storage is for video files
 * @returns A CloudinaryStorage instance
 */
const createCloudinaryStorage = (
  folderName: string,
  isVideo: boolean = false
) => {
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: `sprintos/${folderName}`,
      resource_type: isVideo ? 'video' : 'image',
      allowed_formats: isVideo
        ? ['mp4', 'mov', 'avi', 'wmv', 'flv', 'webm']
        : ['jpg', 'jpeg', 'png', 'webp', 'gif'],
      transformation: isVideo
        ? []
        : [{ width: 800, height: 800, crop: 'limit' }, { quality: 'auto' }],
      public_id: (_req: any, file: any) => {
        const timestamp = Date.now()
        const originalName = file.originalname.split('.')[0]
        return `${folderName}_${originalName}_${timestamp}`
      }
    } as any
  })
}

/**
 * Create multer upload middleware for Cloudinary
 * @param folderName The folder name in Cloudinary
 * @param isVideo Whether the upload is for video files
 * @returns A multer instance
 */
const createUpload = (folderName: string, isVideo: boolean = false) => {
  return multer({
    storage: createCloudinaryStorage(folderName, isVideo),
    limits: {
      fileSize: isVideo ? 100 * 1024 * 1024 : 5 * 1024 * 1024
    },
    fileFilter: (_req, file, cb) => {
      if (isVideo) {
        const allowedMimes = [
          'video/mp4',
          'video/quicktime',
          'video/x-msvideo',
          'video/x-ms-wmv',
          'video/x-flv',
          'video/webm'
        ]
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true)
        } else {
          cb(
            new Error(
              'Invalid file type. Only MP4, MOV, AVI, WMV, FLV and WebM are allowed.'
            )
          )
        }
      } else {
        const allowedMimes = [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/webp',
          'image/gif'
        ]
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true)
        } else {
          cb(
            new Error(
              'Invalid file type. Only JPEG, PNG, WebP and GIF are allowed.'
            )
          )
        }
      }
    }
  })
}

/**
 * Create multer with memory storage (chỉ validate, không upload)
 * @param isVideo Whether the upload is for video files
 * @returns A multer instance
 */
const createMemoryUpload = (isVideo: boolean = false) => {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: isVideo ? 100 * 1024 * 1024 : 5 * 1024 * 1024
    },
    fileFilter: (_req, file, cb) => {
      if (isVideo) {
        const allowedMimes = [
          'video/mp4',
          'video/quicktime',
          'video/x-msvideo',
          'video/x-ms-wmv',
          'video/x-flv',
          'video/webm'
        ]
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true)
        } else {
          cb(
            new Error(
              'Invalid file type. Only MP4, MOV, AVI, WMV, FLV and WebM are allowed.'
            )
          )
        }
      } else {
        const allowedMimes = [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/webp',
          'image/gif'
        ]
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true)
        } else {
          cb(
            new Error(
              'Invalid file type. Only JPEG, PNG, WebP and GIF are allowed.'
            )
          )
        }
      }
    }
  })
}

/**
 * Upload file buffer to Cloudinary
 * @param buffer File buffer
 * @param folderName Folder name in Cloudinary
 * @param originalName Original file name
 * @param isVideo Whether the file is a video
 * @returns Upload result
 */
const uploadFromBuffer = (
  buffer: Buffer,
  folderName: string,
  originalName: string,
  isVideo: boolean = false
): Promise<any> => {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now()
    const fileName = originalName.split('.')[0]
    const publicId = `${folderName}_${fileName}_${timestamp}`

    cloudinary.uploader
      .upload_stream(
        {
          folder: `sprintos/${folderName}`,
          resource_type: isVideo ? 'video' : 'image',
          public_id: publicId,
          transformation: isVideo
            ? []
            : [{ width: 800, height: 800, crop: 'limit' }, { quality: 'auto' }]
        },
        (error, result) => {
          if (error) return reject(error)
          resolve(result)
        }
      )
      .end(buffer)
  })
}

/**
 * Upload file từ base64 string
 * @param base64String Base64 string của file
 * @param folderName Folder name trong Cloudinary
 * @param fileName Original file name (bao gồm extension)
 * @returns Upload result
 */
const uploadFromBase64 = (
  base64String: string,
  folderName: string,
  fileName: string
): Promise<any> => {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now()

    // Split file name and extension
    const lastDotIndex = fileName.lastIndexOf('.')
    const ext = lastDotIndex > 0 ? fileName.substring(lastDotIndex + 1) : ''
    const nameWithoutExt =
      lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName

    // Sanitize name
    const sanitizedName = nameWithoutExt
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .substring(0, 50)

    const publicId = `${folderName}_${sanitizedName}_${timestamp}`

    cloudinary.uploader.upload(
      base64String,
      {
        folder: `sprintos/${folderName}`,
        public_id: publicId,
        resource_type: 'auto',
        // IMPORTANT: Specify format if there is an extension
        ...(ext && { format: ext })
      },
      (error, result) => {
        if (error) {
          // console.error('Cloudinary upload error:', error)
          return reject(error)
        }
        resolve(result)
      }
    )
  })
}

/**
 * Conditional upload middleware
 * @param folderName The folder name in Cloudinary
 * @param shouldUpload Function to determine whether to upload
 * @param isVideo Whether the upload is for video files
 * @returns Middleware function
 */
const createConditionalUpload = (
  folderName: string,
  shouldUpload: (req: Request) => Promise<boolean>,
  isVideo: boolean = false
) => {
  const memoryUpload = createMemoryUpload(isVideo)

  return async (req: Request, res: any, next: any) => {
    // Parse file vào memory
    memoryUpload.single('image')(req, res, async (err: any) => {
      if (err) return next(err)
      if (!req.file) return next()

      try {
        // Check if need to upload
        const canUpload = await shouldUpload(req)

        if (canUpload) {
          // Upload lên Cloudinary
          const result = await uploadFromBuffer(
            req.file.buffer,
            folderName,
            req.file.originalname,
            isVideo
          )

          //
          req.file = {
            ...req.file,
            path: result.secure_url,
            filename: result.public_id
          } as any
        }

        next()
      } catch (error) {
        next(error)
      }
    })
  }
}

const uploadUser = createUpload('user')
const uploadImgProject = createUpload('project')
const uploadProjectMemory = createMemoryUpload(false)

/**
 * Delete media (image or video) from Cloudinary
 * @param publicId The public ID of the media to delete
 * @param resourceType The type of the media: 'image' or 'video'
 */
const deleteMedia = async (
  publicId: string,
  resourceType: 'image' | 'video' | 'auto' = 'image'
): Promise<void> => {
  try {
    if (resourceType === 'auto') {
      // Try deleting as image first
      try {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'image' })
      } catch {
        // If not an image, try video
        try {
          await cloudinary.uploader.destroy(publicId, {
            resource_type: 'video'
          })
        } catch {
          // If not a video, try raw (for other file types)
          await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' })
        }
      }
    } else {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType
      })
    }
  } catch (error) {
    throw new Error(`Failed to delete media from Cloudinary: ${error}`)
  }
}

/**
 * Delete image from Cloudinary
 * @param publicId The public ID of the image to delete
 * @returns Promise<void>
 */
const deleteImage = async (publicId: string): Promise<void> => {
  return deleteMedia(publicId, 'image')
}

/**
 * Delete video from Cloudinary
 * @param publicId The public ID of the video to delete
 * @returns Promise<void>
 */
const deleteVideo = async (publicId: string): Promise<void> => {
  return deleteMedia(publicId, 'video')
}

export const CloudinaryProvider = {
  uploadUser,
  uploadImgProject,
  uploadProjectMemory,
  uploadFromBuffer,
  uploadFromBase64,
  createConditionalUpload,
  deleteImage,
  deleteVideo,
  deleteMedia
}
