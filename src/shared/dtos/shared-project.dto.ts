import { createZodDto } from 'nestjs-zod'
import { GetProjectDetailResSchema, GetProjectParamSchema } from '../models/shared-project.model'

export class GetProjectDetailResDTO extends createZodDto(GetProjectDetailResSchema) {}

export class GetProjectParamDTO extends createZodDto(GetProjectParamSchema) {}
