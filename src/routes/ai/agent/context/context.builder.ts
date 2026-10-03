import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '~/shared/services/prisma.service'
import { AgentContext, UserProjectRole } from '../agent.types'

@Injectable()
export class ContextBuilder {
  private readonly logger = new Logger(ContextBuilder.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tự động xác định targetProjectId, activeSprintId, và phân quyền RBAC của người dùng
   */
  async resolveContext(
    projectId?: string,
    sprintId?: string,
    userId?: string,
    currentScreen?: string,
    dryRun?: boolean,
    webSearchMode?: 'auto' | 'always' | 'disabled',
    hasImages?: boolean
  ): Promise<AgentContext> {
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

    // Xác định vai trò của người dùng trong dự án (RBAC)
    let userRole: UserProjectRole = 'VIEWER'

    if (targetProjectId && userId) {
      try {
        const project = await this.prisma.project.findUnique({
          where: { id: targetProjectId },
          select: { ownerId: true }
        })

        if (project && project.ownerId === userId) {
          userRole = 'OWNER'
        } else {
          const member = await this.prisma.projectMember.findFirst({
            where: {
              projectId: targetProjectId,
              memberId: userId,
              deletedAt: null,
              status: 'ACTIVE'
            },
            include: { role: true }
          })

          if (member) {
            const roleName = (member.role?.name || '').toUpperCase()
            if (roleName.includes('OWNER') || roleName.includes('ADMIN')) {
              userRole = 'ADMIN'
            } else if (roleName.includes('VIEWER')) {
              userRole = 'VIEWER'
            } else {
              userRole = 'MEMBER'
            }
          } else {
            // Nếu không tìm thấy membership, mặc định là VIEWER để bảo vệ an toàn dữ liệu
            userRole = 'VIEWER'
          }
        }
      } catch (err: any) {
        this.logger.warn(`Lỗi khi truy vấn vai trò RBAC của user ${userId}: ${err?.message}`)
        userRole = 'VIEWER'
      }
    }

    this.logger.log(
      `Resolved Context: Project=${targetProjectId}, Sprint=${activeSprintId || 'None'}, User=${userId || 'Anonymous'}, Role=${userRole}, Screen=${currentScreen || 'ALL'}, HasImages=${Boolean(hasImages)}`
    )

    return {
      targetProjectId,
      activeSprintId,
      userId,
      userRole,
      currentScreen: currentScreen || 'ALL',
      dryRun: Boolean(dryRun),
      webSearchMode: webSearchMode || 'auto',
      hasImages: Boolean(hasImages)
    }
  }
}
