import { Injectable } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

@Injectable()
export class RetroAdvisorTool implements IAgentTool {
  readonly name = 'sprintRetroAdvisor'
  readonly description =
    'Tổng hợp báo cáo Retrospective cuối Sprint: So sánh Story Points cam kết ban đầu (Committed) vs thực tế hoàn thành (Delivered), ' +
    'tính tỷ lệ phát sinh scope ngoài kế hoạch (Scope Creep Index), phân tích Velocity thực tế, ' +
    'và đưa ra khuyến nghị cải tiến quy trình cho Sprint tiếp theo. ' +
    'Hoạt động tốt nhất trên Sprint có trạng thái ACTIVE hoặc COMPLETED.'
  readonly category: ToolCategory = 'SPRINT'
  readonly riskLevel: ToolRiskLevel = 'SUGGEST'
  readonly level: ToolActionLevel = 'SUGGEST'
  readonly parameters = {
    type: 'object',
    properties: {
      sprintId: {
        type: 'string',
        description: 'ID của Sprint cần tổng kết Retrospective (nếu bỏ trống, dùng Sprint gần nhất Active hoặc Completed)'
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
    if (!targetSprintId && !context.targetProjectId) {
      return {
        output: 'Không tìm thấy sprintId hoặc projectId để tổng kết Retrospective.',
        status: 'ERROR',
        summary: 'Thiếu tham số Sprint'
      }
    }

    try {
      // 1. Lấy Sprint cần phân tích (hoặc tìm Sprint gần nhất nếu không có ID)
      let sprint: any = null

      if (targetSprintId) {
        sprint = await this.prisma.sprint.findUnique({
          where: { id: targetSprintId },
          include: {
            tasks: {
              where: { deletedAt: null },
              include: {
                assignees: { include: { user: { select: { displayName: true, email: true } } } },
                boardColumn: { select: { isDone: true, title: true } },
                labels: { select: { label: true } }
              }
            },
            boardColumns: { select: { id: true, isDone: true, isWip: true, title: true } },
            dailySnapshots: { orderBy: { date: 'asc' } }
          }
        })
      } else {
        sprint = await this.prisma.sprint.findFirst({
          where: {
            projectId: context.targetProjectId,
            status: { in: ['ACTIVE', 'COMPLETED'] },
            deletedAt: null
          },
          include: {
            tasks: {
              where: { deletedAt: null },
              include: {
                assignees: { include: { user: { select: { displayName: true, email: true } } } },
                boardColumn: { select: { isDone: true, title: true } },
                labels: { select: { label: true } }
              }
            },
            boardColumns: { select: { id: true, isDone: true, isWip: true, title: true } },
            dailySnapshots: { orderBy: { date: 'asc' } }
          },
          orderBy: { endDate: 'desc' }
        })
      }

      if (!sprint) {
        return {
          output: 'Không tìm thấy Sprint phù hợp để tổng kết Retrospective.',
          status: 'ERROR',
          summary: 'Sprint không tìm thấy'
        }
      }

      const doneColIds = new Set(sprint.boardColumns.filter((c: any) => c.isDone).map((c: any) => c.id))

      // 2. Tính toán các chỉ số cốt lõi
      const totalTasks = sprint.tasks.length
      const completedTasks = sprint.tasks.filter((t: any) => doneColIds.has(t.boardColumnId))
      const incompleteTasks = sprint.tasks.filter((t: any) => !doneColIds.has(t.boardColumnId))

      const totalCommittedSP = sprint.tasks.reduce((s: number, t: any) => s + (t.storyPoint || 0), 0)
      const deliveredSP = completedTasks.reduce((s: number, t: any) => s + (t.storyPoint || 0), 0)
      const incompleteSP = incompleteTasks.reduce((s: number, t: any) => s + (t.storyPoint || 0), 0)

      const velocityActual = deliveredSP
      const deliveryRate = totalCommittedSP > 0 ? Math.round((deliveredSP / totalCommittedSP) * 100) : 0

      // 3. Tính Scope Creep - Lấy snapshot đầu tiên để so sánh
      // Giả định: tasks được tạo sau ngày startDate của Sprint là "scope creep"
      const sprintStartDate = new Date(sprint.startDate)
      const scopeCreepTasks = sprint.tasks.filter((t: any) => {
        const createdAt = new Date(t.createdAt)
        return createdAt > sprintStartDate
      })

      const scopeCreepSP = scopeCreepTasks.reduce((s: number, t: any) => s + (t.storyPoint || 0), 0)
      const originalCommittedSP = totalCommittedSP - scopeCreepSP
      const scopeCreepIndex =
        originalCommittedSP > 0 ? Math.round((scopeCreepSP / originalCommittedSP) * 100) : 0

      // 4. Phân tích theo thành viên
      const memberDeliveryMap = new Map<
        string,
        { name: string; email: string; completedSP: number; totalSP: number; completedTasks: number; totalTasks: number }
      >()

      for (const task of sprint.tasks) {
        const isDone = doneColIds.has(task.boardColumnId)
        const sp = task.storyPoint || 0
        for (const a of task.assignees) {
          const user = (a as any).user
          if (!user) continue
          const key = user.email || user.displayName
          if (!memberDeliveryMap.has(key)) {
            memberDeliveryMap.set(key, {
              name: user.displayName || user.email,
              email: user.email || '',
              completedSP: 0,
              totalSP: 0,
              completedTasks: 0,
              totalTasks: 0
            })
          }
          const m = memberDeliveryMap.get(key)!
          m.totalSP += sp
          m.totalTasks++
          if (isDone) {
            m.completedSP += sp
            m.completedTasks++
          }
        }
      }

      const memberPerformance = Array.from(memberDeliveryMap.values()).map((m) => ({
        ...m,
        deliveryRate: m.totalSP > 0 ? `${Math.round((m.completedSP / m.totalSP) * 100)}%` : 'N/A'
      }))

      // 5. Phân tích Burndown từ daily snapshots (nếu có)
      const burndownAnalysis =
        sprint.dailySnapshots && sprint.dailySnapshots.length > 0
          ? {
              available: true,
              totalSnapshots: sprint.dailySnapshots.length,
              firstSnapshot: sprint.dailySnapshots[0],
              lastSnapshot: sprint.dailySnapshots[sprint.dailySnapshots.length - 1],
              trendNote:
                sprint.dailySnapshots.length >= 2
                  ? sprint.dailySnapshots[sprint.dailySnapshots.length - 1].remaining < sprint.dailySnapshots[0].remaining
                    ? 'Downward trend (tốt - đang giảm tải)'
                    : 'Flat/Upward trend (cảnh báo - tải không giảm)'
                  : 'Không đủ dữ liệu để phân tích xu hướng'
            }
          : { available: false, note: 'Không có SprintDailySnapshot để phân tích biểu đồ Burndown' }

      // 6. Sinh khuyến nghị cải tiến
      const recommendations: string[] = []

      if (deliveryRate < 70) {
        recommendations.push(`📉 Tỷ lệ hoàn thành thấp (${deliveryRate}%): Cân nhắc giảm scope Sprint tiếp theo hoặc tăng thêm nguồn lực.`)
      }
      if (scopeCreepIndex > 20) {
        recommendations.push(`⚠️ Scope Creep cao (${scopeCreepIndex}%): Tăng cường kiểm soát thay đổi scope trong Sprint Planning. Mọi task mới phải được PM duyệt trước khi thêm vào Sprint đang chạy.`)
      }
      if (incompleteTasks.length > 0) {
        recommendations.push(`📋 ${incompleteTasks.length} task chưa hoàn thành (${incompleteSP} SP): Di chuyển về Backlog và ưu tiên cao cho Sprint tiếp theo.`)
      }
      if (sprint.tasks.filter((t: any) => t.assignees.length === 0).length > 0) {
        const unassignedCount = sprint.tasks.filter((t: any) => t.assignees.length === 0).length
        recommendations.push(`👤 ${unassignedCount} task trong Sprint không có Assignee: Đảm bảo mọi task đều có người phụ trách ngay từ Sprint Planning.`)
      }
      if (deliveryRate >= 90) {
        recommendations.push(`✅ Hiệu suất xuất sắc (${deliveryRate}%)! Có thể tăng nhẹ scope Sprint tiếp theo. Ghi nhận và khen thưởng team.`)
      }

      const now = new Date()
      const sprintDuration = Math.round((new Date(sprint.endDate).getTime() - new Date(sprint.startDate).getTime()) / (1000 * 60 * 60 * 24))

      const output = JSON.stringify({
        sprintName: sprint.name,
        sprintStatus: sprint.status,
        sprintDuration: `${sprintDuration} ngày`,
        retroDate: now.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        coreMetrics: {
          committedStoryPoints: totalCommittedSP,
          deliveredStoryPoints: deliveredSP,
          deliveryRate: `${deliveryRate}%`,
          velocityActual,
          totalTasks,
          completedTasksCount: completedTasks.length,
          incompleteTasksCount: incompleteTasks.length,
          incompleteSP
        },
        scopeCreepAnalysis: {
          originalCommittedSP,
          addedDuringSprintSP: scopeCreepSP,
          addedDuringSprintTasks: scopeCreepTasks.length,
          scopeCreepIndex: `${scopeCreepIndex}%`,
          riskLevel: scopeCreepIndex > 30 ? 'HIGH' : scopeCreepIndex > 15 ? 'MEDIUM' : 'LOW'
        },
        burndownAnalysis,
        memberPerformance: memberPerformance.sort((a, b) => b.completedSP - a.completedSP),
        incompleteTasks: incompleteTasks.slice(0, 10).map((t: any) => ({
          title: t.title,
          storyPoint: t.storyPoint,
          column: t.boardColumn?.title,
          assignees: t.assignees.map((a: any) => a.user?.displayName || a.user?.email).filter(Boolean)
        })),
        recommendations,
        retrospectiveSummary: `Sprint "${sprint.name}" ${sprint.status === 'COMPLETED' ? 'đã hoàn thành' : 'đang chạy'}: Velocity thực tế = ${velocityActual} SP, Tỷ lệ hoàn thành = ${deliveryRate}%, Scope Creep = ${scopeCreepIndex}%.`
      })

      return {
        output,
        status: 'SUCCESS',
        summary: `Retrospective Sprint "${sprint.name}": ${deliveredSP}/${totalCommittedSP} SP hoàn thành (${deliveryRate}%), Scope Creep ${scopeCreepIndex}%, ${recommendations.length} khuyến nghị cải tiến`
      }
    } catch (err: any) {
      return {
        output: `Lỗi khi tổng hợp Retrospective: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Tổng kết Retrospective thất bại'
      }
    }
  }
}
