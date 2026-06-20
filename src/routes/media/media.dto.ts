import { createZodDto } from 'nestjs-zod'
import { PresignedUploadFileBodySchema, PresignedUploadFileResSchema } from './media.model'

export class PresignedUploadFileBodyDTO extends createZodDto(PresignedUploadFileBodySchema) {}

export class PresignedUploadFileResDTO extends createZodDto(PresignedUploadFileResSchema) {}
