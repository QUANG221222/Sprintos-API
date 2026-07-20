import { createZodDto } from 'nestjs-zod'
import {
  CreateBoardColumnBodySchema,
  GetBoardColumnDetailResSchema,
  GetBoardColumnParamSchema,
  GetListBoardColumnResSchema,
  GetSprintParamSchema,
  UpdateBoardColumnBodySchema,
  ReorderBoardColumnsBodySchema
} from './board-column.model'

export class GetBoardColumnDetailResDTO extends createZodDto(GetBoardColumnDetailResSchema) {}

export class GetListBoardColumnResDTO extends createZodDto(GetListBoardColumnResSchema) {}

export class CreateBoardColumnBodyDTO extends createZodDto(CreateBoardColumnBodySchema) {}

export class UpdateBoardColumnBodyDTO extends createZodDto(UpdateBoardColumnBodySchema) {}

export class GetBoardColumnParamDTO extends createZodDto(GetBoardColumnParamSchema) {}

export class GetSprintParamDTO extends createZodDto(GetSprintParamSchema) {}

export class ReorderBoardColumnsBodyDTO extends createZodDto(ReorderBoardColumnsBodySchema) {}
