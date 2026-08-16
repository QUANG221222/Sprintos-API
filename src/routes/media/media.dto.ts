import { createZodDto } from 'nestjs-zod'
import {
  PresignedUploadFileBodySchema,
  PresignedUploadFileResSchema,
  PresignedGetFileQuerySchema,
  PresignedGetFileResSchema,
  DeleteFileBodySchema,
  DeleteFileResSchema
} from './media.model'

export class PresignedUploadFileBodyDTO extends createZodDto(PresignedUploadFileBodySchema) {}
export class PresignedUploadFileResDTO extends createZodDto(PresignedUploadFileResSchema) {}

export class PresignedGetFileQueryDTO extends createZodDto(PresignedGetFileQuerySchema) {}
export class PresignedGetFileResDTO extends createZodDto(PresignedGetFileResSchema) {}

export class DeleteFileBodyDTO extends createZodDto(DeleteFileBodySchema) {}
export class DeleteFileResDTO extends createZodDto(DeleteFileResSchema) {}
