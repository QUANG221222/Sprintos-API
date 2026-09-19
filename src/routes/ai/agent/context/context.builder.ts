import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '~/shared/services/prisma.service'
import { AgentContext } from '../agent.types'

@Injectable()
export class ContextBuilder {
  private readonly logger = new Logger(ContextBuilder.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tự động xác định targetProjectId và activeSprintId
   */
  async resolveContext(projectId?: string, sprintId?: string): Promise<AgentContext> {
    let targetProjectId = projectId || ''

    if (!targetProjectId || targetProjectId === 'default') {
      const recentProject = await this.prisma.project.findFirst({
        orderBy: { updatedAt: 'desc' },
        select: { id: true, name: true }
      })
      if (recentProject) {
        targetProjectId = recentProject.id
      }
    }

    let activeSprintId = sprintId
    if (!activeSprintId && targetProjectId) {
      const activeSprint = await this.prisma.sprint.findFirst({
        where: { projectId: targetProjectId, status: 'ACTIVE' },
        select: { id: true, name: true }
      })
      if (activeSprint) {
        activeSprintId = activeSprint.id
      }
    }

    return {
      targetProjectId,
      activeSprintId
    }
  }
}
