import { Body, Controller, Delete, Get, Param, ParseBoolPipe, Post, Put, Query } from '@nestjs/common'
import { SprintService } from './sprint.service'
import { ZodSerializerDto } from 'nestjs-zod'
import { ActiveUser } from '~/shared/decorators/active-user.decorator'
import {
  CreateSprintBodyDTO,
  GetSprintDetailResDTO,
  GetListSprintResDTO,
  GetSprintParamDTO,
  UpdateSprintBodyDTO
} from './sprint.dto'
import { GetListQueryDTO } from '~/shared/dtos/request.dto'
import { MessageResDTO } from '~/shared/dtos/response.dto'
import { GetProjectParamDTO } from '~/shared/dtos/shared-project.dto'

@Controller('sprints')
export class SprintController {
  constructor(private readonly sprintService: SprintService) {}

  @Post()
  @ZodSerializerDto(GetSprintDetailResDTO)
  create(@Body() body: CreateSprintBodyDTO, @ActiveUser('userId') userId: string) {
    return this.sprintService.create(body, userId)
  }

  @Get(':sprintId')
  @ZodSerializerDto(GetSprintDetailResDTO)
  findById(@Param() params: GetSprintParamDTO) {
    return this.sprintService.findById(params.sprintId)
  }

  @Get('project/:projectId')
  @ZodSerializerDto(GetListSprintResDTO)
  findAllByProjectId(@Param() params: GetProjectParamDTO, @Query() query: GetListQueryDTO) {
    return this.sprintService.findAllByProjectId(params, query)
  }

  @Put(':sprintId')
  @ZodSerializerDto(GetSprintDetailResDTO)
  update(@Param() params: GetSprintParamDTO, @Body() body: UpdateSprintBodyDTO, @ActiveUser('userId') userId: string) {
    return this.sprintService.update({ id: params.sprintId, body, userId })
  }

  @Delete(':sprintId')
  @ZodSerializerDto(MessageResDTO)
  delete(
    @Param() params: GetSprintParamDTO,
    @ActiveUser('userId') userId: string,
    @Query('isHard', new ParseBoolPipe({ optional: true })) isHard?: boolean
  ) {
    return this.sprintService.delete({ id: params.sprintId, userId }, isHard)
  }
}
