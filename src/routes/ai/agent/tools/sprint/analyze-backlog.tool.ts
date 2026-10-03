import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

export type TechnicalRole =
  | 'BACKEND'
  | 'FRONTEND'
  | 'FULLSTACK'
  | 'QA_TEST'
  | 'DEVOPS'
  | 'DESIGN'
  | 'OTHER'

const ROLE_KEYWORDS: Record<TechnicalRole, string[]> = {
  BACKEND: [
    'api',
    'endpoint',
    'controller',
    'service',
    'prisma',
    'database',
    'db',
    'migration',
    'jwt',
    'auth',
    'oauth',
    'token',
    'redis',
    's3',
    'queue',
    'bullmq',
    'cpm',
    'algorithm',
    'cron',
    'email',
    'otp',
    'rest',
    'webhook',
    'backend',
    'be',
    'server',
    'logic',
    'hash',
    'bcrypt'
  ],
  FRONTEND: [
    'ui',
    'component',
    'tailwind',
    'page',
    'layout',
    'modal',
    'dialog',
    'responsive',
    'css',
    'animation',
    'form',
    'hook',
    'zustand',
    'next.js',
    'react',
    'client',
    'drawer',
    'tab',
    'kanban',
    'gantt',
    'frontend',
    'fe',
    'view',
    'dropdown',
    'button',
    'card',
    'toast'
  ],
  QA_TEST: [
    'test',
    'unit test',
    'e2e',
    'cypress',
    'jest',
    'testcase',
    'test case',
    'qa',
    'verify',
    'bug',
    'regression',
    'automation test',
    'kiem thu',
    'check'
  ],
  DEVOPS: [
    'docker',
    'ci/cd',
    'pipeline',
    'deploy',
    'nginx',
    'cloudflare',
    'env',
    'linux',
    'devops',
    'aws',
    'vps',
    'build',
    'monitoring'
  ],
  DESIGN: [
    'design',
    'figma',
    'wireframe',
    'prototype',
    'icon',
    'logo',
    'ui/ux',
    'mockup',
    'banner'
  ],
  FULLSTACK: [],
  OTHER: []
}

/**
 * Suy luận Technical Role từ Tiêu đề và Mô tả task
 */
export function inferTechnicalRole(title: string, description?: string | null): TechnicalRole {
  const text = `${title} ${description || ''}`.toLowerCase()

  const scores: Record<TechnicalRole, number> = {
    BACKEND: 0,
    FRONTEND: 0,
    QA_TEST: 0,
    DEVOPS: 0,
    DESIGN: 0,
    FULLSTACK: 0,
    OTHER: 0
  }

  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
    for (const kw of keywords) {
      if (kw.length <= 4) {
        const regex = new RegExp(`\\b${kw}\\b`, 'i')
        if (regex.test(text)) {
          scores[role as TechnicalRole] += 1
        }
      } else if (text.includes(kw)) {
        scores[role as TechnicalRole] += 1
      }
    }
  }

  // Nếu cả Backend và Frontend đều có điểm cân bằng
  if (scores.BACKEND > 0 && scores.FRONTEND > 0 && Math.abs(scores.BACKEND - scores.FRONTEND) <= 1) {
    return 'FULLSTACK'
  }

  let highestRole: TechnicalRole = 'OTHER'
  let maxScore = 0

  for (const [role, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score
      highestRole = role as TechnicalRole
    }
  }

  return highestRole
}

/**
 * Ước lượng Story Points dự kiến theo độ dài và độ phức tạp
 */
export function estimateSuggestedStoryPoint(title: string, description?: string | null): number {
  const text = `${title} ${description || ''}`
  if (text.length > 250 || text.includes('tích hợp') || text.includes('toàn diện') || text.includes('hệ thống')) {
    return 5
  }
  if (text.length > 100) {
    return 3
  }
  if (text.length > 40) {
    return 2
  }
  return 1
}

/**
 * Ước lượng Duration (ngày làm việc) dự kiến
 */
export function estimateSuggestedDuration(storyPoint: number): number {
  if (storyPoint >= 8) return 5
  if (storyPoint >= 5) return 3
  if (storyPoint >= 3) return 2
  return 1
}

@Injectable()
export class AnalyzeBacklogTool implements IAgentTool {
  readonly name = 'analyzeBacklogTasks'
  readonly description =
    'Phân tích toàn bộ danh sách task trong Backlog hoặc các Sprint Planned của dự án: ' +
    'Tự động phân loại chuyên môn kỹ thuật theo Role (BACKEND, FRONTEND, QA_TEST, DEVOPS, DESIGN, FULLSTACK), ' +
    'rà soát các task thiếu Story Point hoặc Duration để đưa ra ước lượng gợi ý, ' +
    'và thống kê tổng số Story Points theo từng mảng kỹ thuật để phục vụ lập kế hoạch Sprint.'
  readonly category: ToolCategory = 'SPRINT'
  readonly riskLevel: ToolRiskLevel = 'READ'
  readonly level: ToolActionLevel = 'READ'
  readonly parameters = {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'Mã dự án (nếu để trống sẽ tự lấy từ ngữ cảnh hiện tại)'
      },
      sprintId: {
        type: 'string',
        description: 'Mã Sprint cụ thể cần phân tích (nếu để trống sẽ quét tất cả các Sprint Planned trong dự án)'
      }
    }
  }

  private readonly logger = new Logger(AnalyzeBacklogTool.name)

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
    args: { projectId?: string; sprintId?: string },
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
      // 1. Xác định danh sách Sprint mục tiêu
      let targetSprintIds: string[] = []

      if (args.sprintId) {
        targetSprintIds = [args.sprintId]
      } else {
        const plannedSprints = await this.prisma.sprint.findMany({
          where: {
            projectId: targetProjectId,
            status: 'PLANNED',
            deletedAt: null
          },
          select: { id: true }
        })
        targetSprintIds = plannedSprints.map((s) => s.id)
      }

      if (targetSprintIds.length === 0) {
        return {
          output: JSON.stringify({
            totalTasks: 0,
            message: 'Dự án hiện không có Sprint nào ở trạng thái PLANNED để phân tích Backlog.'
          }),
          status: 'SUCCESS',
          summary: 'Không có Sprint Planned nào trong Backlog'
        }
      }

      // 2. Lấy tất cả các task thuộc các Sprint này
      const tasks = await this.prisma.task.findMany({
        where: {
          sprintId: { in: targetSprintIds },
          deletedAt: null
        },
        include: {
          sprint: { select: { id: true, name: true, status: true } },
          assignees: {
            include: {
              user: { select: { id: true, displayName: true, email: true } }
            }
          },
          labels: { select: { id: true, label: true } },
          predecessors: { select: { predecessorId: true, type: true } },
          successors: { select: { successorId: true, type: true } }
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }]
      })

      if (tasks.length === 0) {
        return {
          output: JSON.stringify({
            totalTasks: 0,
            message: 'Các Sprint Planned hiện đang trống (0 task).'
          }),
          status: 'SUCCESS',
          summary: 'Backlog trống (0 task)'
        }
      }

      // 3. Phân loại kỹ thuật và kiểm tra khiếm khuyết
      const roleCounts: Record<TechnicalRole, { count: number; totalSP: number }> = {
        BACKEND: { count: 0, totalSP: 0 },
        FRONTEND: { count: 0, totalSP: 0 },
        FULLSTACK: { count: 0, totalSP: 0 },
        QA_TEST: { count: 0, totalSP: 0 },
        DEVOPS: { count: 0, totalSP: 0 },
        DESIGN: { count: 0, totalSP: 0 },
        OTHER: { count: 0, totalSP: 0 }
      }

      let totalSP = 0
      let missingSpCount = 0
      let missingDurationCount = 0
      let unassignedCount = 0

      const analyzedTasks = tasks.map((t) => {
        const inferredRole = inferTechnicalRole(t.title, t.description)
        const sp = t.storyPoint || 0
        const duration = t.duration || 0
        const isMissingSP = sp === 0
        const isMissingDuration = duration === 0
        const isUnassigned = t.assignees.length === 0

        if (isMissingSP) missingSpCount++
        if (isMissingDuration) missingDurationCount++
        if (isUnassigned) unassignedCount++

        totalSP += sp
        roleCounts[inferredRole].count += 1
        roleCounts[inferredRole].totalSP += sp

        const suggestedSP = isMissingSP ? estimateSuggestedStoryPoint(t.title, t.description) : sp
        const suggestedDur = isMissingDuration ? estimateSuggestedDuration(suggestedSP) : duration

        return {
          id: t.id,
          title: t.title,
          type: t.type,
          priority: t.priority || 'MEDIUM',
          storyPoint: sp,
          duration: duration,
          sprintName: t.sprint?.name || 'Chưa định',
          inferredRole,
          hasAssignee: !isUnassigned,
          assignees: t.assignees.map((a) => a.user.displayName),
          hasPredecessors: t.predecessors.length > 0,
          predecessorsCount: t.predecessors.length,
          missingFields: {
            storyPoint: isMissingSP,
            duration: isMissingDuration,
            assignee: isUnassigned
          },
          suggestedStoryPoint: suggestedSP,
          suggestedDuration: suggestedDur
        }
      })

      const resultPayload = {
        targetProjectId,
        analyzedSprintsCount: targetSprintIds.length,
        totalTasks: tasks.length,
        totalStoryPoints: totalSP,
        healthCheck: {
          missingStoryPointTasks: missingSpCount,
          missingDurationTasks: missingDurationCount,
          unassignedTasks: unassignedCount
        },
        roleBreakdown: roleCounts,
        tasks: analyzedTasks
      }

      this.logger.log(
        `✅ AnalyzeBacklog: Phân tích thành công ${tasks.length} tasks trong ${targetSprintIds.length} Sprints (Total SP: ${totalSP})`
      )

      return {
        output: JSON.stringify(resultPayload),
        status: 'SUCCESS',
        summary: `Phân tích Backlog: ${tasks.length} tasks (${totalSP} SP) · Phân bổ: BE=${roleCounts.BACKEND.count}, FE=${roleCounts.FRONTEND.count}, QA=${roleCounts.QA_TEST.count}`
      }
    } catch (err: any) {
      this.logger.error(`AnalyzeBacklogTool error: ${err?.message}`, err?.stack)
      return {
        output: `Lỗi truy vấn Backlog: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Lỗi phân tích Backlog'
      }
    }
  }
}
