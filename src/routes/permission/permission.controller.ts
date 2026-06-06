import { Controller, Get, Query, Param, Post, Body, Put, Delete, ParseBoolPipe } from '@nestjs/common'
import { PermissionService } from './permission.service'
import { ZodSerializerDto } from 'nestjs-zod'
import {
  GetPermissionResDTO,
  GetPermissionQueryDTO,
  GetPermissionDetailResDTO,
  GetPermissionParamsDTO,
  CreatePermissionBodyDTO,
  UpdatePermissionBodyDTO
} from './permission.dto'
import { ActiveUser } from '~/shared/decorators/active-user.decorator'

@Controller('permissions')
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}
  @Get()
  @ZodSerializerDto(GetPermissionResDTO)
  list(@Query() query: GetPermissionQueryDTO) {
    return this.permissionService.list({
      page: query.page,
      limit: query.limit
    })
  }

  @Get(':permissionId')
  @ZodSerializerDto(GetPermissionDetailResDTO)
  get(@Param() params: GetPermissionParamsDTO) {
    return this.permissionService.findById(params.permissionId)
  }

  @Post()
  @ZodSerializerDto(GetPermissionDetailResDTO)
  create(@Body() body: CreatePermissionBodyDTO, @ActiveUser('userId') createdById: number) {
    return this.permissionService.create({ createdById, data: body })
  }

  @Put(':permissionId')
  @ZodSerializerDto(GetPermissionDetailResDTO)
  update(
    @Param() params: GetPermissionParamsDTO,
    @Body() body: UpdatePermissionBodyDTO,
    @ActiveUser('userId') updatedById: number
  ) {
    return this.permissionService.update({
      permissionId: params.permissionId,
      updatedById,
      data: body
    })
  }

  @Delete(':permissionId')
  delete(
    @Param() params: GetPermissionParamsDTO,
    @ActiveUser('userId') deletedById: number,
    @Query('isHard', new ParseBoolPipe({ optional: true })) isHard?: boolean
  ) {
    return this.permissionService.delete({ permissionId: params.permissionId, deletedById }, isHard)
  }
}
