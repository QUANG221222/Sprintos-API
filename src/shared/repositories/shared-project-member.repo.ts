import { Injectable } from '@nestjs/common'
import { PrismaService } from '../services/prisma.service'
import {
  CreateInvitationProjectMemberBodyType,
  GetProjectMemberDetailResType
} from '../models/shared-project-member.model'
import { ProjectMemberStatus, ProjectMemberRole } from '../constants/project.constants'
import { SharedRoleRepository } from './shared-role.repo'

@Injectable()
export class SharedProjectMemberRepo {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly sharedRoleRepository: SharedRoleRepository
  ) {}

  async findMemberByProjectAndMemberId(
    projectId: string,
    memberId: number
  ): Promise<GetProjectMemberDetailResType | null> {
    const member = await this.prismaService.projectMember.findFirst({
      where: {
        projectId,
        memberId,
        deletedAt: null
      },
      include: {
        role: true
      }
    })
    if (!member) return null
    return {
      ...member,
      role: member.role.name as (typeof ProjectMemberRole)[keyof typeof ProjectMemberRole]
    }
  }

  async findMemberByProjectAndEmail(projectId: string, email: string): Promise<GetProjectMemberDetailResType | null> {
    const member = await this.prismaService.projectMember.findFirst({
      where: {
        projectId,
        email,
        deletedAt: null
      },
      include: {
        role: true
      }
    })
    if (!member) return null
    return {
      ...member,
      role: member.role.name as (typeof ProjectMemberRole)[keyof typeof ProjectMemberRole]
    }
  }

  async findInviteByToken(
    projectId: string,
    email: string,
    token: string
  ): Promise<GetProjectMemberDetailResType | null> {
    const member = await this.prismaService.projectMember.findFirst({
      where: {
        projectId,
        email,
        inviteToken: token,
        deletedAt: null
      },
      include: {
        role: true
      }
    })
    if (!member) return null
    return {
      ...member,
      role: member.role.name as (typeof ProjectMemberRole)[keyof typeof ProjectMemberRole]
    }
  }

  async updateInviteToken(
    id: string,
    inviteToken: string,
    role: (typeof ProjectMemberRole)[keyof typeof ProjectMemberRole],
    invitedById?: number
  ): Promise<GetProjectMemberDetailResType> {
    const roleId = await this.sharedRoleRepository.getRoleIdByName(role)
    const member = await this.prismaService.projectMember.update({
      where: {
        id,
        deletedAt: null
      },
      data: {
        inviteToken,
        roleId,
        invitedAt: new Date(),
        invitedById
      },
      include: {
        role: true
      }
    })
    return {
      ...member,
      role: member.role.name as (typeof ProjectMemberRole)[keyof typeof ProjectMemberRole]
    }
  }

  async createInvite(
    body: CreateInvitationProjectMemberBodyType & { invitedById?: number }
  ): Promise<GetProjectMemberDetailResType> {
    const roleId = await this.sharedRoleRepository.getRoleIdByName(body.role)

    const member = await this.prismaService.projectMember.create({
      data: {
        projectId: body.projectId,
        memberId: body.memberId,
        email: body.email,
        roleId,
        status: ProjectMemberStatus.PENDING,
        inviteToken: body.inviteToken,
        invitedById: body.invitedById
      },
      include: {
        role: true
      }
    })
    return {
      ...member,
      role: member.role.name as (typeof ProjectMemberRole)[keyof typeof ProjectMemberRole]
    }
  }
}
