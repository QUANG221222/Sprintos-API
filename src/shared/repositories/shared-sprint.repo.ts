import { Injectable } from '@nestjs/common'
import { PrismaService } from '~/shared/services/prisma.service'
import { SprintBoardDetailType } from '~/shared/models/shared-sprint-board.model'
import { SprintNotFoundError } from '~/shared/error'

@Injectable()
export class SharedSprintRepo {
  constructor(private readonly prismaService: PrismaService) {}

  async getSprintBoardDetail(sprintId: number): Promise<SprintBoardDetailType> {
    const sprint = await this.prismaService.sprint.findUnique({
      where: { id: sprintId, deletedAt: null },
      include: {
        boardColumns: {
          where: { deletedAt: null },
          include: {
            tasks: {
              where: { deletedAt: null },
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
            }
          }
        }
      }
    })
    if (!sprint) {
      throw SprintNotFoundError
    }
    // Sort columns based on boardColumnIds order
    const sortedColumns = [...sprint.boardColumns].sort((a, b) => {
      const indexA = sprint.boardColumnIds.indexOf(a.id)
      const indexB = sprint.boardColumnIds.indexOf(b.id)
      return (indexA === -1 ? 9999 : indexA) - (indexB === -1 ? 9999 : indexB)
    })
    return {
      ...sprint,
      boardColumns: sortedColumns
    } as any
  }
}
