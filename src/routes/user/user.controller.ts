import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import {
  CreateUserBodyDTO,
  CreateUserResDTO,
  GetUserParamsDTO,
  GetUsersQueryDTO,
  GetUsersResDTO,
  UpdateProfileBodyDTO,
  UpdateUserBodyDTO
} from './user.dto'
import { ZodSerializerDto } from 'nestjs-zod'
import { UserService } from './user.service'
import { GetUserProfileResDTO, UpdateUserProfileResDTO } from '~/shared/dtos/shared-user.dto'
import { ActiveUser } from '~/shared/decorators/active-user.decorator'

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ZodSerializerDto(GetUsersResDTO)
  list(@Query() query: GetUsersQueryDTO) {
    return this.userService.list({
      page: query.page,
      limit: query.limit
    })
  }

  @Get('me')
  @ZodSerializerDto(GetUserProfileResDTO)
  getMe(@ActiveUser('userId') userId: string) {
    return this.userService.findById(userId)
  }

  @Put('me')
  @ZodSerializerDto(UpdateUserProfileResDTO)
  updateMe(
    @ActiveUser('userId') userId: string,
    @Body() body: UpdateProfileBodyDTO
  ) {
    return this.userService.updateProfile({
      userId,
      data: body
    })
  }

  @Get(':id')
  @ZodSerializerDto(GetUserProfileResDTO)
  findById(@Param() params: GetUserParamsDTO) {
    return this.userService.findById(params.id)
  }

  @Post()
  @ZodSerializerDto(CreateUserResDTO)
  create(
    @Body() body: CreateUserBodyDTO,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.userService.create({
      createdById: userId,
      data: body,
      createdByRoleName: roleName
    })
  }

  @Put(':id')
  @ZodSerializerDto(UpdateUserProfileResDTO)
  update(
    @Param() params: GetUserParamsDTO,
    @Body() body: UpdateUserBodyDTO,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.userService.update({
      id: params.id,
      data: body,
      updateById: userId,
      updatedByRoleName: roleName
    })
  }

  @Delete(':id')
  delete(
    @Param() params: GetUserParamsDTO,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.userService.delete({
      id: params.id,
      deletedById: userId,
      deletedByRoleName: roleName
    })
  }
}
