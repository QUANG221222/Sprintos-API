import z from 'zod'

// Schema for requesting Presigned PUT URL (Upload)
export const PresignedUploadFileBodySchema = z
  .object({
    filename: z.string().min(1, 'Filename cannot be empty'),
    filesize: z.number().max(50 * 1024 * 1024, 'File size cannot exceed 50MB'), // 50MB limit
    folder: z.string().optional().default('uploads'),
    contentType: z.string().optional()
  })
  .strict()

export const PresignedUploadFileResSchema = z.object({
  presignedUrl: z.string(),
  fileKey: z.string(),
  url: z.string(),
  contentType: z.string()
})

// Schema for requesting Presigned GET URL (Download/View)
export const PresignedGetFileQuerySchema = z
  .object({
    fileKey: z.string().min(1, 'File key is required')
  })
  .strict()

export const PresignedGetFileResSchema = z.object({
  presignedUrl: z.string(),
  fileKey: z.string()
})

// Schema for Deleting File
export const DeleteFileBodySchema = z
  .object({
    fileKey: z.string().min(1, 'File key is required')
  })
  .strict()

export const DeleteFileResSchema = z.object({
  success: z.boolean(),
  message: z.string()
})

export type PresignedUploadFileBodyType = z.infer<typeof PresignedUploadFileBodySchema>
export type PresignedUploadFileResType = z.infer<typeof PresignedUploadFileResSchema>

export type PresignedGetFileQueryType = z.infer<typeof PresignedGetFileQuerySchema>
export type PresignedGetFileResType = z.infer<typeof PresignedGetFileResSchema>

export type DeleteFileBodyType = z.infer<typeof DeleteFileBodySchema>
export type DeleteFileResType = z.infer<typeof DeleteFileResSchema>
