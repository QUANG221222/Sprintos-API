import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { CreateProjectBodyDTO, GetProjectDetailResDTO, GetProjectParamDTO, UpdateProjectBodyDTO } from './project.dto'
import { ActiveUser } from '~/shared/decorators/active-user.decorator'
import { ProjectService } from './project.service'
import { ZodSerializerDto } from 'nestjs-zod'
import { GetListQueryDTO } from '~/shared/dtos/request.dto'
import { GetListProjectResSchema } from './project.model'
import { MessageResDTO } from '~/shared/dtos/response.dto'
import { ProjectOwner } from './decorators/project-owner.decorator'
import { ProjectMember } from './decorators/project-member.decorator'

@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get()
  @ZodSerializerDto(GetListProjectResSchema)
  findAll(@Query() query: GetListQueryDTO, @ActiveUser('userId') userId: number) {
    return this.projectService.findAll(query, userId)
  }

  @Get(':projectId')
  @ProjectMember()
  @ZodSerializerDto(GetProjectDetailResDTO)
  findOne(@Param() params: GetProjectParamDTO) {
    return this.projectService.findById(params.projectId)
  }

  @Post()
  @ZodSerializerDto(GetProjectDetailResDTO)
  create(@Body() body: CreateProjectBodyDTO, @ActiveUser('userId') ownerId: number) {
    return this.projectService.create({ body, ownerId })
  }

  @Put(':projectId')
  @ProjectOwner()
  @ZodSerializerDto(GetProjectDetailResDTO)
  update(@Param() params: GetProjectParamDTO, @Body() body: UpdateProjectBodyDTO) {
    return this.projectService.update({ id: params.projectId, body })
  }

  @Delete(':projectId')
  @ProjectOwner()
  @ZodSerializerDto(MessageResDTO)
  delete(@Param() params: GetProjectParamDTO) {
    return this.projectService.delete(params.projectId)
  }
}
