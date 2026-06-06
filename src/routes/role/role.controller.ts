import { Controller, Get, Query, Param, Post, Body, Put, Delete } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'
import {
  CreateRoleBodyDTO,
  CreateRoleResDTO,
  GetRoleDetailResDTO,
  GetRoleParamsDTO,
  GetRolesQueryDTO,
  GetRolesResDTO,
  UpdateRoleBodyDTO
} from './role.dto'
import { RoleService } from './role.service'
import { ActiveUser } from '~/shared/decorators/active-user.decorator'

@Controller('roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}
  @Get()
  @ZodSerializerDto(GetRolesResDTO)
  list(@Query() query: GetRolesQueryDTO) {
    return this.roleService.list({
      page: query.page,
      limit: query.limit
    })
  }

  @Get(':id')
  @ZodSerializerDto(GetRoleDetailResDTO)
  findById(@Param() params: GetRoleParamsDTO) {
    return this.roleService.findById(params.id)
  }

  @Post()
  @ZodSerializerDto(CreateRoleResDTO)
  create(@ActiveUser('userId') userId: number, @Body() body: CreateRoleBodyDTO) {
    return this.roleService.create({
      createdById: userId,
      data: body
    })
  }

  @Put(':id')
  @ZodSerializerDto(GetRoleDetailResDTO)
  update(@ActiveUser('userId') userId: number, @Param() params: GetRoleParamsDTO, @Body() body: UpdateRoleBodyDTO) {
    return this.roleService.update({
      id: params.id,
      updatedById: userId,
      data: body
    })
  }

  @Delete(':id')
  delete(@ActiveUser('userId') userId: number, @Param() params: GetRoleParamsDTO) {
    return this.roleService.delete({
      id: params.id,
      deletedById: userId
    })
  }
}
