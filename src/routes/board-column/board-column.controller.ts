import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { BoardColumnService } from './board-column.service'
import { ZodSerializerDto } from 'nestjs-zod'
import {
  CreateBoardColumnBodyDTO,
  GetBoardColumnDetailResDTO,
  GetBoardColumnParamDTO,
  GetSprintParamDTO,
  UpdateBoardColumnBodyDTO,
  ReorderBoardColumnsBodyDTO
} from './board-column.dto'
import { MessageResDTO } from '~/shared/dtos/response.dto'
import { SprintBoardDetailDTO } from '~/shared/dtos/shared-sprint-board.dto'

@Controller('board-columns')
export class BoardColumnController {
  constructor(private readonly boardColumnService: BoardColumnService) {}

  @Post()
  @ZodSerializerDto(GetBoardColumnDetailResDTO)
  create(@Body() body: CreateBoardColumnBodyDTO) {
    return this.boardColumnService.create(body)
  }

  @Get('sprint/:sprintId')
  @ZodSerializerDto(SprintBoardDetailDTO)
  findAllBySprintId(@Param() params: GetSprintParamDTO) {
    return this.boardColumnService.findAllBySprintId(params)
  }

  @Get(':boardColumnId')
  @ZodSerializerDto(GetBoardColumnDetailResDTO)
  findById(@Param() params: GetBoardColumnParamDTO) {
    return this.boardColumnService.findById(params.boardColumnId)
  }

  @Put(':boardColumnId')
  @ZodSerializerDto(GetBoardColumnDetailResDTO)
  update(@Param() params: GetBoardColumnParamDTO, @Body() body: UpdateBoardColumnBodyDTO) {
    return this.boardColumnService.update({ id: params.boardColumnId, body })
  }

  @Delete(':boardColumnId')
  @ZodSerializerDto(MessageResDTO)
  delete(@Param() params: GetBoardColumnParamDTO, @Query('targetColumnId') targetColumnId?: string) {
    return this.boardColumnService.delete(params.boardColumnId, targetColumnId)
  }

  @Put('sprint/:sprintId/reorder')
  @ZodSerializerDto(SprintBoardDetailDTO)
  reorder(@Param() params: GetSprintParamDTO, @Body() body: ReorderBoardColumnsBodyDTO) {
    return this.boardColumnService.reorder(params.sprintId, body.columnOrderIds)
  }
}
