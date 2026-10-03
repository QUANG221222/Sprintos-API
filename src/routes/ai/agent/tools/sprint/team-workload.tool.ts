import { Injectable } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

// Ngưỡng phân loại tải công việc (Story Points)
const WORKLOAD_THRESHOLDS = {
  OVERLOADED: 15, // > 15 SP: Quá tải
  OPTIMAL_MIN: 8, // 8-15 SP: Tối ưu
  AVAILABLE_MAX: 5 // < 5 SP: Còn dư lực
} as const

@Injectable()
export class TeamWorkloadTool implements IAgentTool {
  readonly name = 'getTeamWorkload'
  readonly description =
    'Truy vấn và phân tích tải công việc (workload) của từng thành viên trong Sprint hiện tại. ' +
    'Phân loại 3 mức tải: 🔴 Overloaded (>15 SP), 🟢 Optimal (8-15 SP), ⚪ Available (<5 SP). ' +
    'Hỗ trợ PM cân bằng phân bổ công việc và tránh gán thêm việc cho người đang quá tải.'
  readonly category: ToolCategory = 'SPRINT'
  readonly riskLevel: ToolRiskLevel = 'READ'
  readonly level: ToolActionLevel = 'READ'
  readonly parameters = {
    type: 'object',
    properties: {
      sprintId: {
        type: 'string',
        description: 'ID của Sprint cần xem phân bổ tải nhân lực (nếu bỏ trống, dùng Sprint đang Active)'
      }
    }
  }

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

  async execute(args: { sprintId?: string }, context: AgentContext): Promise<ToolExecutionResult> {
    const targetSprintId = args.sprintId || context.activeSprintId
    if (!targetSprintId) {
      return {
        output: 'Không tìm thấy sprintId để phân tích tải nhân lực.',
        status: 'ERROR',
        summary: 'Thiếu ID Sprint'
      }
    }

    try {
      // 1. Lấy Sprint + tasks + assignees đầy đủ
      const sprint = await this.prisma.sprint.findUnique({
        where: { id: targetSprintId },
        include: {
          tasks: {
            where: { deletedAt: null },
            include: {
              assignees: {
                include: {
                  user: {
                    select: { id: true, displayName: true, email: true, avatar: true }
                  }
                }
              },
              boardColumn: { select: { isDone: true, title: true } }
            }
          },
          boardColumns: { select: { id: true, isDone: true } }
        }
      })

      if (!sprint) {
        return { output: 'Không tìm thấy Sprint tương ứng.', status: 'ERROR', summary: 'Sprint không tồn tại' }
      }

      const doneColIds = new Set(sprint.boardColumns.filter((c) => c.isDone).map((c) => c.id))

      // 2. Tổng hợp tải theo từng thành viên
      const memberMap = new Map<
        string,
        {
          userId: string
          name: string
          email: string
          totalTasks: number
          completedTasks: number
          totalStoryPoints: number
          completedStoryPoints: number
          tasks: Array<{ id: string; title: string; storyPoint: number; isDone: boolean; column: string }>
        }
      >()

      let unassignedTasks = 0
      let unassignedSP = 0

      for (const task of sprint.tasks) {
        const isDone = doneColIds.has(task.boardColumnId)
        const sp = task.storyPoint || 0

        if (task.assignees.length === 0) {
          unassignedTasks++
          unassignedSP += sp
          continue
        }

        for (const assignee of task.assignees) {
          const user = (assignee as any).user
          if (!user) continue

          const userId = user.id
          if (!memberMap.has(userId)) {
            memberMap.set(userId, {
              userId,
              name: user.displayName || user.email?.split('@')[0] || 'Unknown',
              email: user.email || '',
              totalTasks: 0,
              completedTasks: 0,
              totalStoryPoints: 0,
              completedStoryPoints: 0,
              tasks: []
            })
          }

          const member = memberMap.get(userId)!
          member.totalTasks++
          member.totalStoryPoints += sp
          if (isDone) {
            member.completedTasks++
            member.completedStoryPoints += sp
          }
          member.tasks.push({
            id: task.id,
            title: task.title,
            storyPoint: sp,
            isDone,
            column: task.boardColumn?.title || 'Unknown'
          })
        }
      }

      // 3. Phân loại mức tải và sắp xếp
      const members = Array.from(memberMap.values()).map((m) => {
        let workloadStatus: '🔴 Overloaded' | '🟢 Optimal' | '🟡 Moderate' | '⚪ Available'
        const remaining = m.totalStoryPoints - m.completedStoryPoints
        if (remaining > WORKLOAD_THRESHOLDS.OVERLOADED) {
          workloadStatus = '🔴 Overloaded'
        } else if (remaining >= WORKLOAD_THRESHOLDS.OPTIMAL_MIN) {
          workloadStatus = '🟢 Optimal'
        } else if (remaining >= WORKLOAD_THRESHOLDS.AVAILABLE_MAX) {
          workloadStatus = '🟡 Moderate'
        } else {
          workloadStatus = '⚪ Available'
        }

        return {
          ...m,
          remainingStoryPoints: remaining,
          completionRate: m.totalStoryPoints > 0 ? `${Math.round((m.completedStoryPoints / m.totalStoryPoints) * 100)}%` : '0%',
          workloadStatus
        }
      })

      members.sort((a, b) => b.remainingStoryPoints - a.remainingStoryPoints)

      const overloadedCount = members.filter((m) => m.workloadStatus === '🔴 Overloaded').length
      const availableCount = members.filter((m) => m.workloadStatus === '⚪ Available').length

      const output = JSON.stringify({
        sprintName: sprint.name,
        totalMembers: members.length,
        overloadedCount,
        availableCount,
        unassignedTasks,
        unassignedStoryPoints: unassignedSP,
        teamMembers: members.map((m) => ({
          name: m.name,
          email: m.email,
          workloadStatus: m.workloadStatus,
          totalStoryPoints: m.totalStoryPoints,
          completedStoryPoints: m.completedStoryPoints,
          remainingStoryPoints: m.remainingStoryPoints,
          completionRate: m.completionRate,
          totalTasks: m.totalTasks,
          taskList: m.tasks.slice(0, 5) // Giới hạn để tránh quá nhiều token
        })),
        recommendation:
          overloadedCount > 0 && availableCount > 0
            ? `⚠️ Phát hiện ${overloadedCount} thành viên quá tải và ${availableCount} thành viên còn dư lực. Khuyến nghị tái phân bổ các task chưa hoàn thành từ Overloaded sang Available.`
            : overloadedCount > 0
              ? `⚠️ ${overloadedCount} thành viên đang quá tải. Không có thành viên dư lực để hỗ trợ - cân nhắc chuyển task sang Sprint tiếp theo.`
              : '✅ Tải nhân lực trong Sprint đang cân bằng tốt.'
      })

      return {
        output,
        status: 'SUCCESS',
        summary: `Phân tích tải ${members.length} thành viên Sprint "${sprint.name}": ${overloadedCount} quá tải, ${availableCount} dư lực`
      }
    } catch (err: any) {
      return {
        output: `Lỗi khi phân tích tải nhân lực: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Lỗi truy vấn dữ liệu workload'
      }
    }
  }
}
