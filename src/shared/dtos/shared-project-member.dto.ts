import { createZodDto } from 'nestjs-zod'
import { GetProjectMemberDetailResSchema } from '../models/shared-project-member.model'

export class GetProjectMemberDetailResDTO extends createZodDto(GetProjectMemberDetailResSchema) {}
