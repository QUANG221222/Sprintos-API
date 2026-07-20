import { createZodDto } from 'nestjs-zod'
import { SprintBoardDetailSchema } from '../models/shared-sprint-board.model'

export class SprintBoardDetailDTO extends createZodDto(SprintBoardDetailSchema) {}
