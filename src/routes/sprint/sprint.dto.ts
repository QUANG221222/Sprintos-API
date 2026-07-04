import { createZodDto } from 'nestjs-zod'
import {
  CreateSprintBodySchema,
  GetSprintDetailResSchema,
  GetListSprintResSchema,
  GetSprintParamSchema,
  UpdateSprintBodySchema
} from './sprint.model'

export class GetSprintDetailResDTO extends createZodDto(GetSprintDetailResSchema) {}

export class GetListSprintResDTO extends createZodDto(GetListSprintResSchema) {}

export class CreateSprintBodyDTO extends createZodDto(CreateSprintBodySchema) {}

export class UpdateSprintBodyDTO extends createZodDto(UpdateSprintBodySchema) {}

export class GetSprintParamDTO extends createZodDto(GetSprintParamSchema) {}
