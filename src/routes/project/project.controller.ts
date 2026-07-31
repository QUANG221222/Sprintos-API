import { Body, Controller, Delete, Get, Param, ParseBoolPipe, Post, Put, Query } from '@nestjs/common'
import { CreateProjectBodyDTO, UpdateProjectBodyDTO, TransferProjectBodyDTO, GetListProjectResDTO } from './project.dto'
import { ActiveUser } from '~/shared/decorators/active-user.decorator'
import { ProjectService } from './project.service'
import { ZodSerializerDto } from 'nestjs-zod'
import { GetListQueryDTO } from '~/shared/dtos/request.dto'
import { MessageResDTO } from '~/shared/dtos/response.dto'
import { GetProjectDetailResDTO, GetProjectParamDTO } from '~/shared/dtos/shared-project.dto'

@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get()
  @ZodSerializerDto(GetListProjectResDTO)
  findAll(@Query() query: GetListQueryDTO, @ActiveUser('userId') userId: number) {
    return this.projectService.findAll(query, userId)
  }

  @Get('owned')
  @ZodSerializerDto(GetListProjectResDTO)
  findAllOwnedByUser(@ActiveUser('userId') userId: number, @Query() query: GetListQueryDTO) {
    return this.projectService.findAllOwnedByUser(userId, query)
  }

  @Get('joined')
  @ZodSerializerDto(GetListProjectResDTO)
  findAllJoinedByUser(@ActiveUser('userId') userId: number, @Query() query: GetListQueryDTO) {
    return this.projectService.findAllJoinedByUser(userId, query)
  }

  @Get(':projectId')
  @ZodSerializerDto(GetProjectDetailResDTO)
  findById(@Param() params: GetProjectParamDTO) {
    return this.projectService.findById(params.projectId)
  }

  @Post()
  @ZodSerializerDto(GetProjectDetailResDTO)
  create(@Body() body: CreateProjectBodyDTO, @ActiveUser('userId') ownerId: number) {
    return this.projectService.create({ body, ownerId })
  }

  @Put(':projectId')
  @ZodSerializerDto(GetProjectDetailResDTO)
  update(
    @Param() params: GetProjectParamDTO,
    @Body() body: UpdateProjectBodyDTO,
    @ActiveUser('userId') updatedById: number
  ) {
    return this.projectService.update({ id: params.projectId, body, updatedById })
  }

  @Delete(':projectId')
  @ZodSerializerDto(MessageResDTO)
  delete(
    @Param() params: GetProjectParamDTO,
    @ActiveUser('userId') deletedById: number,
    @Query('isHard', new ParseBoolPipe({ optional: true })) isHard?: boolean
  ) {
    return this.projectService.delete({ id: params.projectId, deletedById }, isHard)
  }

  @Put(':projectId/transfer')
  @ZodSerializerDto(GetProjectDetailResDTO)
  transfer(
    @Param() params: GetProjectParamDTO,
    @Body() body: TransferProjectBodyDTO,
    @ActiveUser('userId') requesterId: number
  ) {
    return this.projectService.transfer({
      projectId: params.projectId,
      newOwnerId: body.newOwnerId,
      requesterId
    })
  }
}
