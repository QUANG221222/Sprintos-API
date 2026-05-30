import { PrismaService } from '~/shared/services/prisma.service'
import { Injectable } from '@nestjs/common'
import { GetListQueryType } from '~/shared/models/request.model'
import {
  CreateProjectBodyType,
  GetListProjectResType,
  GetProjectDetailResType,
  UpdateProjectBodyType,
} from './project.model'
import { Prisma, ProjectMemberRole, ProjectMemberStatus } from '~/generated/prisma/client'
import { missingEmailsError } from './project.error'
import { v4 as uuidv4 } from 'uuid'

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
          members: true
        },
        skip,
        take
      })
    ])
    return {
      data,
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
          members: true
        },
        skip,
        take
      })
    ])
    return {
      data,
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit)
    }
  }

  async findAllJoinedByUser(userId: number, pagination: GetListQueryType): Promise<GetListProjectResType> {
    const { page, limit } = pagination
    const skip = (page - 1) * limit
    const take = limit
    const [totalItems, data] = await Promise.all([
      this.prismaService.project.count({
        where: {
          deletedAt: null,
          members: {
            some: {
              memberId: userId,
              deletedAt: null,
              status: ProjectMemberStatus.ACTIVE
            }
          }
        }
      }),
      this.prismaService.project.findMany({
        where: {
          deletedAt: null,
          members: {
            some: {
              memberId: userId,
              deletedAt: null,
              status: ProjectMemberStatus.ACTIVE
            }
          }
        },
        include: {
          members: true
        },
        skip,
        take
      })
    ])
    return {
      data,
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit)
    }
  }

  async findAllOfUser(userId: number, pagination: GetListQueryType): Promise<GetListProjectResType> {
    const { page, limit } = pagination
    const skip = (page - 1) * limit
    const take = limit
    const where: Prisma.ProjectWhereInput = {
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
    const [totalItems, data] = await Promise.all([
      this.prismaService.project.count({ where }),
      this.prismaService.project.findMany({
        where,
        include: { members: true },
        skip,
        take
      })
    ])
    return {
      data,
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit)
    }
  }

  async findById(id: number): Promise<GetProjectDetailResType | null> {
    return await this.prismaService.project.findFirst({
      where: {
        id,
        deletedAt: null
      },
      include: {
        members: true
      }
    })
  }

  async create({ body, ownerId }: { body: CreateProjectBodyType; ownerId: number }): Promise<GetProjectDetailResType> {
    const { members, ...projectData } = body
    if (members && members.length > 0) {
      const emails = members.map((member) => member.email)
      const existingUsers = await this.prismaService.user.findMany({
        where: {
          email: { in: emails },
          deletedAt: null
        },
        select: {
          id: true,
          email: true
        }
      })

      if (existingUsers.length !== emails.length) {
        throw missingEmailsError(emails, existingUsers.map((user) => user.email))
      }

      const userByEmail = new Map(existingUsers.map((user) => [user.email, user]))
      const memberData = members.map((member) => {
        const user = userByEmail.get(member.email)
        return {
          member: {
            connect: {
              id: user!.id
            }
          },
          email: user!.email,
          role: member.role as ProjectMemberRole,
          status: ProjectMemberStatus.PENDING,
          inviteToken: uuidv4()
        }
      })

      return await this.prismaService.project.create({
        data: {
          ...projectData,
          ownerId,
          members: {
            create: memberData
          }
        },
        include: {
          members: true
        }
      })
    }
    
    return await this.prismaService.project.create({
      data: {
        ...projectData,
        ownerId
      },
      include: {
        members: true
      }
    })
  }

  async update({ id, body }: { id: number; body: UpdateProjectBodyType }): Promise<GetProjectDetailResType> {
    return await this.prismaService.project.update({
      where: {
        id,
        deletedAt: null
      },
      data: {
        ...body,
        updatedAt: new Date()
      },
      include: {
        members: true
      }
    })
  }

  async delete(id: number, isHard?: boolean): Promise<GetProjectDetailResType> {
    return isHard
      ? await this.prismaService.project.update({
          where: {
            id,
            deletedAt: null
          },
          data: {
            deletedAt: new Date()
          },
          include: {
            members: true
          }
        })
      : await this.prismaService.project.delete({
          where: {
            id,
            deletedAt: null
          },
          include: {
            members: true
          }
        })
  }
}
