import { Injectable } from '@nestjs/common'
import { PrismaService } from '~/shared/services/prisma.service'
import { ProjectMemberStatus } from '~/generated/prisma/client'
import { GetProjectMemberListQueryType, GetListProjectMemberResType } from './project-member.model'
import { GetProjectMemberDetailResType } from '~/shared/models/shared-project-member.model'
import { SharedRoleRepository } from '~/shared/repositories/shared-role.repo'
import { ProjectMemberRole } from '~/shared/constants/project.constants'

@Injectable()
export class ProjectMemberRepo {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly sharedRoleRepository: SharedRoleRepository
  ) {}

  async findAllByProjectId(query: GetProjectMemberListQueryType): Promise<GetListProjectMemberResType> {
    const { page, limit, projectId, roleName, nameMember, emailMember } = query
    const skip = (page - 1) * limit
    const take = limit

    const [totalItems, data] = await Promise.all([
      this.prismaService.projectMember.count({
        where: {
          projectId,
          deletedAt: null,
          role: roleName ? { name: roleName } : undefined,
          member: {
            email: {
              contains: emailMember,
              mode: 'insensitive'
            },
            displayName: {
              contains: nameMember,
              mode: 'insensitive'
            }
          }
        }
      }),
      this.prismaService.projectMember.findMany({
        where: {
          projectId,
          deletedAt: null,
          role: roleName ? { name: roleName } : undefined,
          member: {
            email: {
              contains: emailMember
            },
            displayName: {
              contains: nameMember
            }
          }
        },
        include: {
          role: true
        },
        skip,
        take
      })
    ])

    return {
      data: data.map((member) => ({
        ...member,
        role: member.role.name as (typeof ProjectMemberRole)[keyof typeof ProjectMemberRole]
      })),
      totalItems,
      page,
      limit,
      totalPages: Math.ceil(totalItems / limit)
    }
  }

  async findProjectById(projectId: string) {
    return await this.prismaService.project.findFirst({
      where: {
        id: projectId,
        deletedAt: null
      }
    })
  }

  async verifyInvite(id: string, updatedById: string): Promise<GetProjectMemberDetailResType> {
    const member = await this.prismaService.projectMember.update({
      where: {
        id,
        deletedAt: null
      },
      data: {
        status: ProjectMemberStatus.ACTIVE,
        inviteToken: null,
        joinAt: new Date(),
        updatedById
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

  async updateRole(id: string, roleName: string, updatedById: string) {
    const roleId = await this.sharedRoleRepository.getRoleIdByName(roleName)

    const member = await this.prismaService.projectMember.update({
      where: {
        id,
        deletedAt: null
      },
      data: {
        roleId,
        updatedById
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

  async deleteByProjectMemberId({ id, deletedById }: { id: string; deletedById: string }, isHard?: boolean) {
    return isHard
      ? this.prismaService.projectMember.delete({
          where: {
            id,
            deletedAt: null
          }
        })
      : this.prismaService.projectMember.update({
          where: {
            id,
            deletedAt: null
          },
          data: {
            deletedAt: new Date(),
            deletedById
          }
        })
  }
}
