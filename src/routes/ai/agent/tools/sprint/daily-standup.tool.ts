import { Injectable } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

@Injectable()
export class DailyStandupTool implements IAgentTool {
  readonly name = 'generateDailyStandup'
  readonly description =
    'Tự động tổng hợp báo cáo Daily Standup cho toàn bộ team theo 3 câu hỏi kinh điển của Scrum: ' +
    '(1) Task đã hoàn thành hôm qua, (2) Task đang làm hôm nay, (3) Blockers / Điểm nghẽn cần tháo gỡ. ' +
    'Quét dữ liệu 24h qua và các task tồn đọng quá hạn để tạo báo cáo đầy đủ, giảm 70% thời gian họp hàng ngày.'
  readonly category: ToolCategory = 'SPRINT'
  readonly riskLevel: ToolRiskLevel = 'SUGGEST'
  readonly level: ToolActionLevel = 'SUGGEST'
  readonly parameters = {
    type: 'object',
    properties: {
      sprintId: {
        type: 'string',
        description: 'ID của Sprint cần tổng hợp Daily Standup (nếu bỏ trống, dùng Sprint đang Active)'
      },
      lookbackHours: {
        type: 'number',
        description: 'Số giờ nhìn lại để xác định "hôm qua" (mặc định: 24 giờ)'
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

  async execute(args: { sprintId?: string; lookbackHours?: number }, context: AgentContext): Promise<ToolExecutionResult> {
    const targetSprintId = args.sprintId || context.activeSprintId
    if (!targetSprintId) {
      return {
        output: 'Không tìm thấy sprintId để tổng hợp Daily Standup.',
        status: 'ERROR',
        summary: 'Thiếu ID Sprint'
      }
    }

    const lookbackHours = typeof args.lookbackHours === 'number' && args.lookbackHours > 0 ? args.lookbackHours : 24
    const lookbackCutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000)

    try {
      // 1. Lấy Sprint + tasks + assignees
      const sprint = await this.prisma.sprint.findUnique({
        where: { id: targetSprintId },
        include: {
          tasks: {
            where: { deletedAt: null },
            include: {
              assignees: {
                include: {
                  user: { select: { id: true, displayName: true, email: true } }
                }
              },
              boardColumn: { select: { id: true, title: true, isDone: true, isWip: true } }
            }
          },
          boardColumns: { select: { id: true, isDone: true, isWip: true, isBlocked: true, title: true } }
        }
      })

      if (!sprint) {
        return { output: 'Không tìm thấy Sprint tương ứng.', status: 'ERROR', summary: 'Sprint không tồn tại' }
      }

      const doneColIds = new Set(sprint.boardColumns.filter((c) => c.isDone).map((c) => c.id))
      const wipColIds = new Set(sprint.boardColumns.filter((c) => c.isWip).map((c) => c.id))
      const blockedColIds = new Set(sprint.boardColumns.filter((c) => c.isBlocked).map((c) => c.id))

      const now = new Date()

      // Phân loại task theo từng category
      // Q1: Đã hoàn thành trong 24h qua (updatedAt trong khung lookback VÀ cột isDone)
      const completedYesterday = sprint.tasks.filter(
        (t) => doneColIds.has(t.boardColumnId) && t.updatedAt != null && new Date(t.updatedAt) >= lookbackCutoff
      )

      // Q2: Đang làm hôm nay (cột isWip)
      const inProgressToday = sprint.tasks.filter((t) => wipColIds.has(t.boardColumnId))

      // Q3: Blockers - task ở cột isBlocked HOẶC task quá hạn (dueDate đã qua) và chưa hoàn thành
      const blockers = sprint.tasks.filter((t) => {
        const isInBlockedCol = blockedColIds.has(t.boardColumnId)
        const isOverdue = t.dueDate && new Date(t.dueDate) < now && !doneColIds.has(t.boardColumnId)
        return isInBlockedCol || isOverdue
      })

      // Task chưa có Assignee (tiềm ẩn rủi ro)
      const unassignedTasks = sprint.tasks.filter((t) => t.assignees.length === 0 && !doneColIds.has(t.boardColumnId))

      // 2. Tổng hợp theo từng thành viên
      const memberStandupMap = new Map<
        string,
        {
          name: string
          email: string
          completed: string[]
          inProgress: string[]
          blockers: string[]
        }
      >()

      const getOrCreateMember = (userId: string, name: string, email: string) => {
        if (!memberStandupMap.has(userId)) {
          memberStandupMap.set(userId, { name, email, completed: [], inProgress: [], blockers: [] })
        }
        return memberStandupMap.get(userId)!
      }

      for (const task of completedYesterday) {
        for (const a of task.assignees) {
          const user = (a as any).user
          if (user) {
            const m = getOrCreateMember(user.id, user.displayName || user.email, user.email)
            m.completed.push(task.title)
          }
        }
      }

      for (const task of inProgressToday) {
        for (const a of task.assignees) {
          const user = (a as any).user
          if (user) {
            const m = getOrCreateMember(user.id, user.displayName || user.email, user.email)
            m.inProgress.push(task.title)
          }
        }
      }

      for (const task of blockers) {
        for (const a of task.assignees) {
          const user = (a as any).user
          if (user) {
            const m = getOrCreateMember(user.id, user.displayName || user.email, user.email)
            const reason = blockedColIds.has(task.boardColumnId)
              ? `[BLOCKED] ${task.title}`
              : `[OVERDUE ${task.dueDate ? new Date(task.dueDate).toLocaleDateString('vi-VN') : 'N/A'}] ${task.title}`
            m.blockers.push(reason)
          }
        }
      }

      const memberReports = Array.from(memberStandupMap.values())

      // 3. Sprint-level summary
      const totalTasks = sprint.tasks.length
      const totalDone = sprint.tasks.filter((t) => doneColIds.has(t.boardColumnId)).length
      const totalSP = sprint.tasks.reduce((s, t) => s + (t.storyPoint || 0), 0)
      const doneSP = sprint.tasks.filter((t) => doneColIds.has(t.boardColumnId)).reduce((s, t) => s + (t.storyPoint || 0), 0)

      const sprintEndDate = new Date(sprint.endDate)
      const daysRemaining = Math.max(0, Math.ceil((sprintEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))

      const output = JSON.stringify({
        sprintName: sprint.name,
        reportDate: now.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        reportTime: now.toLocaleTimeString('vi-VN'),
        lookbackPeriodHours: lookbackHours,
        sprintProgress: {
          totalTasks,
          doneTasks: totalDone,
          completionRate: `${totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0}%`,
          totalStoryPoints: totalSP,
          doneStoryPoints: doneSP,
          daysRemaining
        },
        dailyStandup: {
          q1_completedYesterday: {
            count: completedYesterday.length,
            tasks: completedYesterday.map((t) => ({
              title: t.title,
              storyPoint: t.storyPoint,
              assignees: t.assignees.map((a) => (a as any).user?.displayName || (a as any).user?.email).filter(Boolean)
            }))
          },
          q2_inProgressToday: {
            count: inProgressToday.length,
            tasks: inProgressToday.map((t) => ({
              title: t.title,
              storyPoint: t.storyPoint,
              column: t.boardColumn?.title,
              assignees: t.assignees.map((a) => (a as any).user?.displayName || (a as any).user?.email).filter(Boolean)
            }))
          },
          q3_blockersAndImpediments: {
            count: blockers.length,
            tasks: blockers.map((t) => ({
              title: t.title,
              column: t.boardColumn?.title,
              dueDate: t.dueDate ? new Date(t.dueDate).toLocaleDateString('vi-VN') : null,
              isBlocked: blockedColIds.has(t.boardColumnId),
              isOverdue: !!t.dueDate && new Date(t.dueDate) < now,
              assignees: t.assignees.map((a) => (a as any).user?.displayName || (a as any).user?.email).filter(Boolean)
            }))
          }
        },
        perMemberStandup: memberReports,
        alerts: [
          ...(unassignedTasks.length > 0
            ? [`⚠️ ${unassignedTasks.length} task chưa có người phụ trách: ${unassignedTasks.map((t) => t.title).join(', ')}`]
            : []),
          ...(blockers.length >= 3 ? [`🚨 ${blockers.length} tasks đang bị block - cần tháo gỡ ngay để không làm trễ Sprint`] : []),
          ...(daysRemaining <= 2 && totalDone < totalTasks * 0.7 ? [`🔴 Sprint sắp kết thúc (còn ${daysRemaining} ngày) nhưng mới hoàn thành ${Math.round((totalDone / totalTasks) * 100)}% tasks`] : [])
        ]
      })

      return {
        output,
        status: 'SUCCESS',
        summary: `Daily Standup "${sprint.name}": ${completedYesterday.length} task hoàn thành hôm qua, ${inProgressToday.length} đang làm, ${blockers.length} điểm nghẽn cần giải quyết`
      }
    } catch (err: any) {
      return {
        output: `Lỗi khi tổng hợp Daily Standup: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Tổng hợp Daily Standup thất bại'
      }
    }
  }
}
