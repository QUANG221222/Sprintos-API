import { Injectable } from '@nestjs/common'
import { PrismaService } from '~/shared/services/prisma.service'

@Injectable()
export class ReportRepo {
  constructor(private readonly prismaService: PrismaService) {}

  async findSprintWithTasks(sprintId: string) {
    return this.prismaService.sprint.findFirst({
      where: {
        id: sprintId,
        deletedAt: null
      },
      include: {
        boardColumns: {
          where: { deletedAt: null }
        },
        tasks: {
          where: { deletedAt: null },
          include: {
            boardColumn: true,
            assignees: {
              where: { deletedAt: null },
              include: {
                user: true
              }
            }
          }
        }
      }
    })
  }

  async findProjectSprintsWithTasks(projectId: string) {
    return this.prismaService.sprint.findMany({
      where: {
        projectId,
        deletedAt: null
      },
      orderBy: {
        startDate: 'asc'
      },
      include: {
        boardColumns: {
          where: { deletedAt: null }
        },
        tasks: {
          where: { deletedAt: null },
          include: {
            boardColumn: true
          }
        }
      }
    })
  }

  async findSprintProjectMembers(sprintId: string) {
    const sprint = await this.prismaService.sprint.findUnique({
      where: { id: sprintId },
      select: { projectId: true }
    })

    if (!sprint) return { members: [], tasks: [] }

    const [members, tasks] = await Promise.all([
      this.prismaService.projectMember.findMany({
        where: {
          projectId: sprint.projectId,
          deletedAt: null
        },
        include: {
          member: true
        }
      }),
      this.prismaService.task.findMany({
        where: {
          sprintId,
          deletedAt: null
        },
        include: {
          boardColumn: true,
          assignees: {
            where: { deletedAt: null },
            include: {
              user: true
            }
          }
        }
      })
    ])

    return { members, tasks }
  }

  async getDependenciesBySprintId(sprintId: string) {
    return this.prismaService.taskDependency.findMany({
      where: {
        predecessor: {
          sprintId,
          deletedAt: null
        },
        successor: {
          sprintId,
          deletedAt: null
        }
      }
    })
  }

  async getTasksWithFullDetailsBySprintId(sprintId: string) {
    return this.prismaService.task.findMany({
      where: {
        sprintId,
        deletedAt: null
      },
      include: {
        boardColumn: true,
        assignees: {
          where: { deletedAt: null },
          include: {
            user: true
          }
        },
        predecessors: true,
        successors: true
      }
    })
  }

  async findSprintSnapshots(sprintId: string) {
    return this.prismaService.sprintDailySnapshot.findMany({
      where: { sprintId },
      orderBy: { date: 'asc' }
    })
  }

  async upsertSprintDailySnapshot(data: {
    sprintId: string
    date: Date
    remainingStoryPoints: number
    completedStoryPoints: number
    totalStoryPoints: number
  }) {
    return this.prismaService.sprintDailySnapshot.upsert({
      where: {
        sprintId_date: {
          sprintId: data.sprintId,
          date: data.date
        }
      },
      update: {
        remainingStoryPoints: data.remainingStoryPoints,
        completedStoryPoints: data.completedStoryPoints,
        totalStoryPoints: data.totalStoryPoints
      },
      create: data
    })
  }

  async findTasksForWorkTypeReport(sprintId: string) {
    return this.prismaService.task.findMany({
      where: {
        sprintId,
        deletedAt: null
      },
      select: {
        id: true,
        title: true,
        type: true,
        storyPoint: true,
        priority: true,
        boardColumn: {
          select: {
            id: true,
            title: true,
            isDone: true
          }
        }
      }
    })
  }
}
