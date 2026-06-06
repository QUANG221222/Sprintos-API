import { PrismaService } from '~/shared/services/prisma.service'
import { Injectable } from '@nestjs/common'
import { GetListQueryType } from '~/shared/models/request.model'
import { CreateProjectBodyType, GetListProjectResType, UpdateProjectBodyType } from './project.model'
import { ProjectMemberStatus, ProjectMemberRole } from '~/shared/constants/project.constants'
import { GetProjectDetailResType } from '~/shared/models/shared-project.model'
import { Prisma } from '~/generated/prisma/client'

@Injectable()
export class ProjectRepo {
  constructor(private readonly prismaService: PrismaService) {}

  async findAll(pagination: GetListQueryType, userId: number): Promise<GetListProjectResType> {
    const { page, limit } = pagination
    const skip = (page - 1) * limit
    const take = limit
    const [totalItems, data] = await Promise.all([
      this.prismaService.project.count({
        where: {
          deletedAt: null,
          OR: [
            { ownerId: userId },
            {
              members: {
                some: {
                  memberId: userId,
                  deletedAt: null,
                  status: ProjectMemberStatus.ACTIVE
                }
              }
            }
          ]
        }
      }),
      this.prismaService.project.findMany({
        where: {
          deletedAt: null,
          OR: [
            { ownerId: userId },
            {
              members: {
                some: {
                  memberId: userId,
                  deletedAt: null,
                  status: ProjectMemberStatus.ACTIVE
                }
              }
            }
          ]
        },
        include: {
          members: {
            include: {
              role: true
            }
          }
        },
        skip,
        take
      })
    ])

    const mappedData = data.map((project) => ({
      ...project,
      members: project.members.map((member) => ({
        ...member,
        role: member.role.name as (typeof ProjectMemberRole)[keyof typeof ProjectMemberRole]
      }))
    }))

    return {
      data: mappedData,
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit)
    }
  }

  async findAllOwnedByUser(userId: number, pagination: GetListQueryType): Promise<GetListProjectResType> {
    const { page, limit } = pagination
    const skip = (page - 1) * limit
    const take = limit
    const [totalItems, data] = await Promise.all([
      this.prismaService.project.count({
        where: {
          ownerId: userId,
          deletedAt: null
        }
      }),
      this.prismaService.project.findMany({
        where: {
          ownerId: userId,
          deletedAt: null
        },
        include: {
          members: {
            include: {
              role: true
            }
          }
        },
        skip,
        take
      })
    ])

    const mappedData = data.map((project) => ({
      ...project,
      members: project.members.map((member) => ({
        ...member,
        role: member.role.name as (typeof ProjectMemberRole)[keyof typeof ProjectMemberRole]
      }))
    }))

    return {
      data: mappedData,
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit)
    }
  }

  async findAllJoinedByUser(userId: number, pagination: GetListQueryType): Promise<GetListProjectResType | null> {
    const { page, limit } = pagination
    const skip = (page - 1) * limit
    const take = limit
    const [totalItems, data] = await Promise.all([
      this.prismaService.project.count({
        where: {
          deletedAt: null,
          AND: [
            { ownerId: { not: userId } },
            {
              members: {
                some: {
                  memberId: userId,
                  deletedAt: null,
                  status: ProjectMemberStatus.ACTIVE
                }
              }
            }
          ]
        }
      }),
      this.prismaService.project.findMany({
        where: {
          deletedAt: null,
          AND: [
            { ownerId: { not: userId } },
            {
              members: {
                some: {
                  memberId: userId,
                  deletedAt: null,
                  status: ProjectMemberStatus.ACTIVE
                }
              }
            }
          ]
        },
        include: {
          members: {
            include: {
              role: true
            }
          }
        },
        skip,
        take
      })
    ])

    const mappedData = data.map((project) => ({
      ...project,
      members: project.members.map((member) => ({
        ...member,
        role: member.role.name as (typeof ProjectMemberRole)[keyof typeof ProjectMemberRole]
      }))
    }))

    return {
      data: mappedData,
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit)
    }
  }

  async create({
    projectData,
    ownerId,
    membersToCreate
  }: {
    projectData: Omit<CreateProjectBodyType, 'members'>
    ownerId: number
    membersToCreate: Prisma.ProjectMemberUncheckedCreateWithoutProjectInput[]
  }): Promise<GetProjectDetailResType> {
    const project = await this.prismaService.project.create({
      data: {
        ...projectData,
        createdById: ownerId,
        ownerId,
        members: {
          create: membersToCreate
        }
      },
      include: {
        members: {
          include: {
            role: true
          }
        }
      }
    })

    return {
      ...project,
      members: project.members.map((member) => ({
        ...member,
        role: member.role.name as (typeof ProjectMemberRole)[keyof typeof ProjectMemberRole]
      }))
    }
  }

  async update({
    id,
    body,
    updatedById
  }: {
    id: number
    body: UpdateProjectBodyType
    updatedById: number
  }): Promise<GetProjectDetailResType> {
    const project = await this.prismaService.project.update({
      where: {
        id,
        deletedAt: null
      },
      data: {
        ...body,
        updatedAt: new Date(),
        updatedById
      },
      include: {
        members: {
          include: {
            role: true
          }
        }
      }
    })

    return {
      ...project,
      members: project.members.map((member) => ({
        ...member,
        role: member.role.name as (typeof ProjectMemberRole)[keyof typeof ProjectMemberRole]
      }))
    }
  }

  async delete(
    { id, deletedById }: { id: number; deletedById: number },
    isHard?: boolean
  ): Promise<GetProjectDetailResType> {
    const project = isHard
      ? await this.prismaService.project.delete({
          where: {
            id
          },
          include: {
            members: {
              include: {
                role: true
              }
            }
          }
        })
      : await this.prismaService.project.update({
          where: {
            id,
            deletedAt: null
          },
          data: {
            deletedAt: new Date(),
            deletedById
          },
          include: {
            members: {
              include: {
                role: true
              }
            }
          }
        })

    return {
      ...project,
      members: project.members.map((member) => ({
        ...member,
        role: member.role.name as (typeof ProjectMemberRole)[keyof typeof ProjectMemberRole]
      }))
    }
  }

  async transfer({
    projectId,
    newOwnerId,
    requesterId,
    requesterMemberId,
    targetMemberId,
    ownerRoleId,
    coOwnerRoleId
  }: {
    projectId: number
    newOwnerId: number
    requesterId: number
    requesterMemberId?: number
    targetMemberId: number
    ownerRoleId: number
    coOwnerRoleId: number
  }): Promise<GetProjectDetailResType> {
    return await this.prismaService.$transaction(async (tx) => {
      // 1. Update Project Owner
      await tx.project.update({
        where: { id: projectId },
        data: {
          ownerId: newOwnerId,
          updatedById: requesterId,
          updatedAt: new Date()
        }
      })

      // 2. Update new owner's project member role to OWNER
      await tx.projectMember.update({
        where: { id: targetMemberId },
        data: {
          roleId: ownerRoleId,
          updatedById: requesterId,
          updatedAt: new Date()
        }
      })

      // 3. Update old owner's project member role to CO-OWNER
      if (requesterMemberId) {
        await tx.projectMember.update({
          where: { id: requesterMemberId },
          data: {
            roleId: coOwnerRoleId,
            updatedById: requesterId,
            updatedAt: new Date()
          }
        })
      }

      // Fetch and return the updated project details
      const project = await tx.project.findFirstOrThrow({
        where: { id: projectId },
        include: {
          members: {
            include: {
              role: true
            }
          }
        }
      })

      return {
        ...project,
        members: project.members.map((member) => ({
          ...member,
          role: member.role.name as (typeof ProjectMemberRole)[keyof typeof ProjectMemberRole]
        }))
      }
    })
  }
}

