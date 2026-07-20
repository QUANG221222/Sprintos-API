import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '~/shared/services/prisma.service'
import { GetListQueryType } from '~/shared/models/request.model'
import { DependencyType, ProjectMemberStatus } from '~/generated/prisma/client'
import {
  AddTaskAttachmentBodyType,
  AddTaskCommentBodyType,
  CreateTaskBodyType,
  GetBoardColumnParamType,
  GetListTaskResType,
  GetSprintParamType,
  GetTaskParamType,
  TaskAttachmentType,
  TaskCommentType,
  TaskType,
  TaskDetailType,
  UpdateTaskBodyType
} from './task.model'

@Injectable()
export class TaskRepo {
  constructor(private readonly prismaService: PrismaService) {}

  async findAllBySprintId(params: GetSprintParamType, pagination: GetListQueryType): Promise<GetListTaskResType> {
    const { page, limit } = pagination
    const skip = (page - 1) * limit
    const take = limit

    const [totalItems, data] = await Promise.all([
      this.prismaService.task.count({
        where: {
          sprintId: params.sprintId,
          deletedAt: null
        }
      }),
      this.prismaService.task.findMany({
        where: {
          sprintId: params.sprintId,
          deletedAt: null
        },
        skip,
        take
      })
    ])

    return {
      data,
      totalItems,
      page,
      limit,
      totalPages: Math.ceil(totalItems / limit)
    }
  }

  async findAllByBoardColumnId(
    params: GetBoardColumnParamType,
    pagination: GetListQueryType
  ): Promise<GetListTaskResType> {
    const { page, limit } = pagination
    const skip = (page - 1) * limit
    const take = limit

    const [totalItems, data] = await Promise.all([
      this.prismaService.task.count({
        where: {
          boardColumnId: params.boardColumnId,
          deletedAt: null
        }
      }),
      this.prismaService.task.findMany({
        where: {
          boardColumnId: params.boardColumnId,
          deletedAt: null
        },
        skip,
        take
      })
    ])

    return {
      data,
      totalItems,
      page,
      limit,
      totalPages: Math.ceil(totalItems / limit)
    }
  }

  async findById(params: GetTaskParamType): Promise<TaskDetailType | null> {
    return (await this.prismaService.task.findFirst({
      where: {
        id: params.taskId,
        deletedAt: null
      },
      include: {
        assignees: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                displayName: true,
                roleId: true,
                totpSecret: true,
                status: true,
                phoneNumber: true,
                address: true,
                dob: true,
                bio: true,
                gender: true,
                avatar: true,
                avatarPublicId: true,
                createdById: true,
                updatedById: true,
                deletedById: true,
                createdAt: true,
                updatedAt: true,
                deletedAt: true
              }
            }
          }
        },
        parent: true,
        subTasks: {
          where: {
            deletedAt: null
          }
        },
        predecessors: {
          include: {
            predecessor: {
              select: {
                id: true,
                title: true
              }
            }
          }
        },
        successors: {
          include: {
            successor: {
              select: {
                id: true,
                title: true
              }
            }
          }
        }
      }
    })) as any
  }

  async create(body: CreateTaskBodyType, userId: number): Promise<TaskType> {
    const { assigneeIds, ...taskData } = body
    let boardColumnId = taskData.boardColumnId
    if (!boardColumnId) {
      const sprint = await this.prismaService.sprint.findUnique({
        where: { id: taskData.sprintId }
      })
      if (!sprint || !sprint.boardColumnIds || sprint.boardColumnIds.length === 0) {
        throw new BadRequestException(
          'Cannot create task because the sprint has no board columns. Please create at least one board column first.'
        )
      }
      boardColumnId = sprint.boardColumnIds[0]
    }
    return await this.prismaService.task.create({
      data: {
        ...taskData,
        boardColumnId,
        createdById: userId,
        assignees: assigneeIds && assigneeIds.length > 0 ? {
          create: assigneeIds.map((userId) => ({
            userId
          }))
        } : undefined
      }
    })
  }

  async getProjectIdBySprintId(sprintId: number): Promise<number | null> {
    const sprint = await this.prismaService.sprint.findFirst({
      where: { id: sprintId, deletedAt: null },
      select: { projectId: true }
    })
    return sprint ? sprint.projectId : null
  }

  async getProjectIdByTaskId(taskId: number): Promise<number | null> {
    const task = await this.prismaService.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        sprint: {
          select: { projectId: true }
        }
      }
    })
    return task?.sprint ? task.sprint.projectId : null
  }

  async validateProjectMembers(projectId: number, assigneeIds: number[]): Promise<boolean> {
    const uniqueIds = Array.from(new Set(assigneeIds))
    if (uniqueIds.length === 0) return true

    const members = await this.prismaService.projectMember.findMany({
      where: {
        projectId,
        memberId: { in: uniqueIds },
        status: ProjectMemberStatus.ACTIVE,
        deletedAt: null
      },
      select: {
        memberId: true
      }
    })

    return members.length === uniqueIds.length
  }

  async update({ id, body, userId }: { id: number; body: UpdateTaskBodyType; userId: number }): Promise<TaskType> {
    const { assigneeIds, ...taskData } = body

    if (taskData.sprintId !== undefined) {
      let boardColumnId = taskData.boardColumnId
      if (!boardColumnId) {
        const sprint = await this.prismaService.sprint.findUnique({
          where: { id: taskData.sprintId }
        })
        if (sprint && sprint.boardColumnIds && sprint.boardColumnIds.length > 0) {
          boardColumnId = sprint.boardColumnIds[0]
        }
      }
      if (boardColumnId) {
        await this.prismaService.task.updateMany({
          where: { parentId: id, deletedAt: null },
          data: {
            sprintId: taskData.sprintId,
            boardColumnId
          }
        })
      } else {
        await this.prismaService.task.updateMany({
          where: { parentId: id, deletedAt: null },
          data: { sprintId: taskData.sprintId }
        })
      }
    }

    return await this.prismaService.task.update({
      where: {
        id,
        deletedAt: null
      },
      data: {
        ...taskData,
        updatedById: userId,
        assignees: assigneeIds ? {
          deleteMany: {},
          create: assigneeIds.map((userId) => ({
            userId
          }))
        } : undefined,
        updatedAt: new Date()
      }
    })
  }

  async delete({ id, userId }: { id: number; userId: number }, isHard?: boolean): Promise<TaskType> {
    return isHard
      ? await this.prismaService.task.delete({
          where: {
            id
          }
        })
      : await this.prismaService.task.update({
          where: {
            id,
            deletedAt: null
          },
          data: {
            deletedAt: new Date(),
            deletedById: userId
          }
        })
  }

  async createDependency(
    predecessorId: number,
    successorId: number,
    type: DependencyType,
    lag: number
  ) {
    return await this.prismaService.taskDependency.create({
      data: {
        predecessorId,
        successorId,
        type,
        lag
      }
    })
  }

  async deleteDependency(dependencyId: number) {
    return await this.prismaService.taskDependency.delete({
      where: {
        id: dependencyId
      }
    })
  }

  async findDependencyById(id: number) {
    return await this.prismaService.taskDependency.findUnique({
      where: { id }
    })
  }

  async findDependencyByTasks(predecessorId: number, successorId: number) {
    return await this.prismaService.taskDependency.findFirst({
      where: { predecessorId, successorId }
    })
  }

  async getDependenciesByPredecessorId(predecessorId: number) {
    return await this.prismaService.taskDependency.findMany({
      where: { predecessorId }
    })
  }

  async getDependenciesBySprintId(sprintId: number) {
    return await this.prismaService.taskDependency.findMany({
      where: {
        predecessor: { sprintId, deletedAt: null },
        successor: { sprintId, deletedAt: null }
      },
      include: {
        predecessor: { select: { id: true, title: true } },
        successor: { select: { id: true, title: true } }
      }
    })
  }

  async getTasksWithAssigneesBySprintId(sprintId: number) {
    return await this.prismaService.task.findMany({
      where: {
        sprintId,
        deletedAt: null
      },
      include: {
        assignees: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                displayName: true,
                roleId: true,
                totpSecret: true,
                status: true,
                phoneNumber: true,
                address: true,
                dob: true,
                bio: true,
                gender: true,
                avatar: true,
                avatarPublicId: true,
                createdById: true,
                updatedById: true,
                deletedById: true,
                createdAt: true,
                updatedAt: true,
                deletedAt: true
              }
            }
          }
        }
      }
    })
  }

  async addComment(taskId: number, memberId: number, body: AddTaskCommentBodyType): Promise<TaskCommentType> {
    return await this.prismaService.taskComment.create({
      data: {
        taskId,
        memberId,
        memberDisplayName: body.memberDisplayName,
        memberAvatar: body.memberAvatar ?? null,
        content: body.content
      }
    })
  }

  async addAttachment(taskId: number, body: AddTaskAttachmentBodyType): Promise<TaskAttachmentType> {
    return await this.prismaService.taskAttachment.create({
      data: {
        taskId,
        fileName: body.fileName,
        fileType: body.fileType,
        fileUrl: body.fileUrl
      }
    })
  }

  async findBoardColumnById(boardColumnId: number) {
    return await this.prismaService.boardColumn.findFirst({
      where: { id: boardColumnId, deletedAt: null }
    })
  }

  async findActiveTasksByColumnId(boardColumnId: number) {
    return await this.prismaService.task.findMany({
      where: {
        boardColumnId,
        deletedAt: null
      }
    })
  }

  async reorderTasks(boardColumnId: number, taskOrderIds: number[]): Promise<void> {
    await this.prismaService.$transaction([
      this.prismaService.boardColumnTaskOrder.deleteMany({
        where: { boardColumnId }
      }),
      this.prismaService.boardColumnTaskOrder.createMany({
        data: taskOrderIds.map((taskId, index) => ({
          boardColumnId,
          taskId,
          sortOrder: index
        }))
      })
    ])
  }
}

