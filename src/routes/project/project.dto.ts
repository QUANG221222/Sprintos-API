import { createZodDto } from 'nestjs-zod'
import {
  CreateProjectBodySchema,
  GetListProjectResSchema,
  UpdateProjectBodySchema,
  TransferProjectBodySchema
} from './project.model'

export class GetListProjectResDTO extends createZodDto(GetListProjectResSchema) {}

export class CreateProjectBodyDTO extends createZodDto(CreateProjectBodySchema) {}

export class UpdateProjectBodyDTO extends createZodDto(UpdateProjectBodySchema) {}

export class TransferProjectBodyDTO extends createZodDto(TransferProjectBodySchema) {}
