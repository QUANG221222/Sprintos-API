import { createZodDto } from 'nestjs-zod'
import { EmptyBodySchema, GetListQuerySchema } from '../models/request.model'

export class EmptyBodyDTO extends createZodDto(EmptyBodySchema) {}

export class GetListQueryDTO extends createZodDto(GetListQuerySchema) {}
