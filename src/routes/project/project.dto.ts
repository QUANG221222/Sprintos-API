import { createZodDto } from 'nestjs-zod'
import {
  CreateProjectBodySchema,
  GetListProjectResSchema,
  GetProjectDetailResSchema,
  GetProjectParamSchema,
  UpdateProjectBodySchema
} from './project.model'

export class GetProjectDetailResDTO extends createZodDto(GetProjectDetailResSchema) {}

export class GetListProjectResDTO extends createZodDto(GetListProjectResSchema) {}

export class CreateProjectBodyDTO extends createZodDto(CreateProjectBodySchema) {}

export class UpdateProjectBodyDTO extends createZodDto(UpdateProjectBodySchema) {}

export class GetProjectParamDTO extends createZodDto(GetProjectParamSchema) {}
