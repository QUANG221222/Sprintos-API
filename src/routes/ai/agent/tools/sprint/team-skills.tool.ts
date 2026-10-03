import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'
import { inferTechnicalRole, TechnicalRole } from './analyze-backlog.tool'

export interface MemberSkillProfile {
  memberId: string
  userId: string
  name: string
  email: string
  projectRole: string
  technicalRole: TechnicalRole
  inferredSkillRole: TechnicalRole
  skillBreakdown: Record<TechnicalRole, number>
  totalHistoricalTasks: number
  activeSprintLoad: {
    activeTasksCount: number
    activeStoryPoints: number
    loadStatus: 'OVERLOADED' | 'OPTIMAL' | 'MODERATE' | 'AVAILABLE'
    remainingCapacitySP: number
  }
}

@Injectable()
export class TeamSkillsTool implements IAgentTool {
  readonly name = 'getProjectTeamSkills'
  readonly description =
    'Truy vấn hồ sơ chuyên môn và dung lượng tải của toàn bộ thành viên trong dự án: ' +
    'Tự động phân tích lịch sử công việc để suy luận chuyên môn kỹ thuật nổi trội (Backend, Frontend, QA, DevOps, Design), ' +
    'tính toán số Story Points hiện đang nhận trong Sprint Active và dung lượng còn trống (Remaining Capacity) để phân công task tối ưu.'
  readonly category: ToolCategory = 'SPRINT'
  readonly riskLevel: ToolRiskLevel = 'READ'
  readonly level: ToolActionLevel = 'READ'
  readonly parameters = {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'Mã dự án (nếu để trống sẽ tự lấy từ ngữ cảnh hiện tại)'
      }
    }
  }

  private readonly logger = new Logger(TeamSkillsTool.name)

  constructor(private readonly prisma: PrismaService) {}

  toOpenAiTool(): OpenAI.Chat.ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters
      }
    }
  }

  async execute(
    args: { projectId?: string },
    context: AgentContext
  ): Promise<ToolExecutionResult> {
    const targetProjectId = args.projectId || context.targetProjectId
    if (!targetProjectId) {
      return {
        output: 'Lỗi: Không xác định được projectId. Vui lòng cung cấp projectId.',
        status: 'ERROR',
        summary: 'Thiếu projectId'
      }
    }

    try {
      // 1. Lấy tất cả thành viên ACTIVE của dự án
      const members = await this.prisma.projectMember.findMany({
        where: {
          projectId: targetProjectId,
          status: 'ACTIVE',
          deletedAt: null
        },
        include: {
          member: {
            select: { id: true, displayName: true, email: true }
          },
          role: {
            select: { id: true, name: true }
          }
        }
      })

      if (members.length === 0) {
        return {
          output: JSON.stringify({
            totalMembers: 0,
            message: 'Dự án hiện chưa có thành viên hoạt động nào.'
          }),
          status: 'SUCCESS',
          summary: 'Dự án chưa có thành viên'
        }
      }

      // 2. Tìm Sprint đang ACTIVE (nếu có) để tính tải thực tế
      const activeSprint = await this.prisma.sprint.findFirst({
        where: {
          projectId: targetProjectId,
          status: 'ACTIVE',
          deletedAt: null
        },
        select: { id: true, name: true }
      })

      // 3. Phân tích lịch sử làm việc của từng thành viên
      const profiles: MemberSkillProfile[] = []
      let teamTotalRemainingCapacity = 0

      for (const pm of members) {
        const userId = pm.memberId

        // Lấy tất cả assignments của user này trong dự án
        const taskAssignments = await this.prisma.taskAssignee.findMany({
          where: {
            userId,
            task: {
              sprint: { projectId: targetProjectId },
              deletedAt: null
            }
          },
          include: {
            task: {
              select: {
                id: true,
                title: true,
                description: true,
                storyPoint: true,
                sprintId: true,
                boardColumn: { select: { isDone: true } }
              }
            }
          }
        })

        // Đếm skill breakdown từ lịch sử
        const skillCounts: Record<TechnicalRole, number> = {
          BACKEND: 0,
          FRONTEND: 0,
          FULLSTACK: 0,
          QA_TEST: 0,
          DEVOPS: 0,
          DESIGN: 0,
          OTHER: 0
        }

        let activeSp = 0
        let activeTasksCount = 0

        for (const ta of taskAssignments) {
          const t = ta.task
          const role = inferTechnicalRole(t.title, t.description)
          skillCounts[role] += 1

          // Nếu task thuộc active sprint và chưa Done -> tính vào tải hiện tại
          if (activeSprint && t.sprintId === activeSprint.id && !t.boardColumn?.isDone) {
            activeSp += t.storyPoint || 0
            activeTasksCount += 1
          }
        }

        // Lấy Technical Role được gán cấu hình từ ProjectMember
        const configuredRole = (pm.technicalRole as TechnicalRole) || 'FULLSTACK'
        let bestRole: TechnicalRole = configuredRole

        // Nếu role cấu hình là FULLSTACK hoặc OTHER, xem xét thêm lịch sử task nếu có xu hướng chuyên biệt
        if (configuredRole === 'FULLSTACK' || configuredRole === 'OTHER') {
          let maxCount = 0
          for (const [role, count] of Object.entries(skillCounts)) {
            if (count > maxCount && role !== 'OTHER') {
              maxCount = count
              bestRole = role as TechnicalRole
            }
          }

          // Nếu chưa có lịch sử task, suy từ tên
          if (maxCount === 0) {
            const lowerName = (pm.member.displayName || '').toLowerCase()
            if (lowerName.includes('fe') || lowerName.includes('front')) bestRole = 'FRONTEND'
            else if (lowerName.includes('be') || lowerName.includes('back')) bestRole = 'BACKEND'
            else if (lowerName.includes('qa') || lowerName.includes('test')) bestRole = 'QA_TEST'
          }
        }

        // Đánh giá trạng thái tải
        let loadStatus: 'OVERLOADED' | 'OPTIMAL' | 'MODERATE' | 'AVAILABLE' = 'AVAILABLE'
        if (activeSp > 15) loadStatus = 'OVERLOADED'
        else if (activeSp >= 8) loadStatus = 'OPTIMAL'
        else if (activeSp >= 5) loadStatus = 'MODERATE'

        const remainingCapacitySP = Math.max(0, 15 - activeSp)
        teamTotalRemainingCapacity += remainingCapacitySP

        profiles.push({
          memberId: pm.id,
          userId: pm.member.id,
          name: pm.member.displayName,
          email: pm.member.email,
          projectRole: pm.role.name,
          technicalRole: configuredRole,
          inferredSkillRole: bestRole,
          skillBreakdown: skillCounts,
          totalHistoricalTasks: taskAssignments.length,
          activeSprintLoad: {
            activeTasksCount,
            activeStoryPoints: activeSp,
            loadStatus,
            remainingCapacitySP
          }
        })
      }

      const payload = {
        targetProjectId,
        activeSprintName: activeSprint?.name || 'Không có Sprint ACTIVE',
        totalMembers: profiles.length,
        teamTotalRemainingCapacitySP: teamTotalRemainingCapacity,
        teamRecommendedSprintVelocitySP: Math.min(
          profiles.length * 10,
          teamTotalRemainingCapacity || profiles.length * 10
        ),
        members: profiles
      }

      this.logger.log(
        `✅ TeamSkillsTool: Đã phân tích ${profiles.length} thành viên dự án (Total Capacity: ${teamTotalRemainingCapacity} SP)`
      )

      return {
        output: JSON.stringify(payload),
        status: 'SUCCESS',
        summary: `Hồ sơ ${profiles.length} thành viên dự án · Capacity còn trống: ${teamTotalRemainingCapacity} SP`
      }
    } catch (err: any) {
      this.logger.error(`TeamSkillsTool error: ${err?.message}`, err?.stack)
      return {
        output: `Lỗi truy vấn hồ sơ thành viên: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Lỗi phân tích kỹ năng team'
      }
    }
  }
}
