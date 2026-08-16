import { createZodDto } from 'nestjs-zod'
import {
  CreateUserBodySchema,
  GetUserParamsSchema,
  GetUsersQuerySchema,
  GetUsersResSchema,
  UpdateProfileBodySchema,
  UpdateUserBodySchema
} from './user.model'
import { UpdateUserProfileResDTO } from '~/shared/dtos/shared-user.dto'

export class GetUsersResDTO extends createZodDto(GetUsersResSchema) {}

export class GetUsersQueryDTO extends createZodDto(GetUsersQuerySchema) {}

export class GetUserParamsDTO extends createZodDto(GetUserParamsSchema) {}

export class CreateUserBodyDTO extends createZodDto(CreateUserBodySchema) {}

export class UpdateUserBodyDTO extends createZodDto(UpdateUserBodySchema) {}

export class UpdateProfileBodyDTO extends createZodDto(UpdateProfileBodySchema) {}

export class CreateUserResDTO extends UpdateUserProfileResDTO {}
