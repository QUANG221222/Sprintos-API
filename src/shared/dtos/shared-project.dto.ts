import { createZodDto } from 'nestjs-zod'
import { GetProjectDetailResSchema } from '../models/shared-project.model'

export class GetProjectDetailResDTO extends createZodDto(GetProjectDetailResSchema) {}
