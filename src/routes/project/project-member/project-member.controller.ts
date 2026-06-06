import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common'
import {
  GetListProjectMemberResDTO,
  GetProjectMemberListQueryDTO,
  GetProjectMemberParamDTO,
  GetProjectMembersDetailResDTO,
  InviteProjectMemberBodyDTO,
  ProjectMemberProjectQueryDTO,
  UpdateProjectMemberRoleBodyDTO,
  VerifyProjectMemberInviteBodyDTO
} from './project-member.dto'
import { MessageResDTO } from '~/shared/dtos/response.dto'
import { ZodSerializerDto } from 'nestjs-zod'
import { ProjectMemberService } from './project-member.service'
import { IsPublic } from '~/shared/decorators/auth.decorator'
import { SharedProjectMemberService } from '~/shared/services/shared-project-member.service'
import { GetProjectMemberDetailResDTO } from '~/shared/dtos/shared-project-member.dto'
import { ActiveUser } from '~/shared/decorators/active-user.decorator'

@Controller('project-members')
export class ProjectMemberController {
  constructor(
    private readonly projectMemberService: ProjectMemberService,
    private readonly sharedProjectMemberService: SharedProjectMemberService
  ) {}

  @Get()
  @ZodSerializerDto(GetListProjectMemberResDTO)
  findAll(@Query() query: GetProjectMemberListQueryDTO) {
    return this.projectMemberService.findAll(query)
  }

  @Post('invite')
  @ZodSerializerDto(GetProjectMembersDetailResDTO)
  invite(@Body() body: InviteProjectMemberBodyDTO, @ActiveUser('userId') invitedById: number) {
    return this.sharedProjectMemberService.invite({ ...body, invitedById })
  }

  @IsPublic()
  @Put('verify/invite')
  @ZodSerializerDto(GetProjectMemberDetailResDTO)
  verifyInvite(@Body() body: VerifyProjectMemberInviteBodyDTO) {
    return this.projectMemberService.verifyInvite(body)
  }

  @Patch(':memberId')
  @ZodSerializerDto(GetProjectMemberDetailResDTO)
  updateRole(
    @Param() params: GetProjectMemberParamDTO,
    @Body() body: UpdateProjectMemberRoleBodyDTO,
    @ActiveUser('userId') requesterId: number
  ) {
    return this.projectMemberService.updateRole({ memberId: params.memberId, body, requesterId })
  }

  @Delete(':memberId')
  @ZodSerializerDto(MessageResDTO)
  delete(
    @Param() params: GetProjectMemberParamDTO,
    @Query() query: ProjectMemberProjectQueryDTO,
    @ActiveUser('userId') requesterId: number
  ) {
    return this.projectMemberService.removeMember(
      {
        memberId: params.memberId,
        projectId: query.projectId,
        requesterId
      },
      query?.isHard
    )
  }
}
