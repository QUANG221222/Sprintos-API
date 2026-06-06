import { createZodDto } from 'nestjs-zod'
import {
  CreateProjectBodySchema,
  GetListProjectResSchema,
  GetProjectParamSchema,
  UpdateProjectBodySchema,
  TransferProjectBodySchema
} from './project.model'

export class GetListProjectResDTO extends createZodDto(GetListProjectResSchema) {}

export class CreateProjectBodyDTO extends createZodDto(CreateProjectBodySchema) {}

export class UpdateProjectBodyDTO extends createZodDto(UpdateProjectBodySchema) {}

export class GetProjectParamDTO extends createZodDto(GetProjectParamSchema) {}

export class TransferProjectBodyDTO extends createZodDto(TransferProjectBodySchema) {}

