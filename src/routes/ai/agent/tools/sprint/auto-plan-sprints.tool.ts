import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'
import { inferTechnicalRole, TechnicalRole } from './analyze-backlog.tool'

export interface PlannedSprintPackage {
  sprintIndex: number
  name: string
  goal: string
  startDate: string
  endDate: string
  totalStoryPoints: number
  totalDurationDays: number
  tasksCount: number
  tasks: Array<{
    id: string
    title: string
    storyPoint: number
    duration: number
    role: TechnicalRole
    priority: string
  }>
}

const DEFAULT_BOARD_COLUMNS = [
  { title: 'To Do', isDone: false, isWip: false, isBlocked: false, isCancelled: false, color: '#64748B' },
  { title: 'In Progress', isDone: false, isWip: true, isBlocked: false, isCancelled: false, color: '#0EA5E9' },
  { title: 'Code Review', isDone: false, isWip: true, isBlocked: false, isCancelled: false, color: '#F59E0B' },
  { title: 'Done', isDone: true, isWip: false, isBlocked: false, isCancelled: false, color: '#10B981' }
]

@Injectable()
export class AutoPlanSprintsTool implements IAgentTool {
  readonly name = 'planSprintsFromBacklog'
  readonly description =
    'Tự động gom nhóm và đóng gói các task từ Backlog thành các chu kỳ Sprint tối ưu: ' +
    'Sắp xếp theo thứ tự phụ thuộc kỹ thuật (Topological Sort CPM: nền tảng API/DB lên trước, UI/Test theo sau), ' +
    'tôn trọng trần Velocity của team (mặc định 35-40 SP/sprint), ' +
    'tự động đặt tên Sprint và mục tiêu (Sprint Goal) ý nghĩa. ' +
    'Mặc định chạy ở chế độ dryRun: true (xem trước kế hoạch, KHÔNG ghi DB trừ khi dryRun: false).'
  readonly category: ToolCategory = 'SPRINT'
  readonly riskLevel: ToolRiskLevel = 'WRITE'
  readonly level: ToolActionLevel = 'WRITE'
  readonly parameters = {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'Mã dự án (nếu để trống sẽ tự lấy từ ngữ cảnh hiện tại)'
      },
      targetVelocityPerSprint: {
        type: 'number',
        description: 'Tổng Story Points tối đa cho mỗi Sprint (mặc định 35-40 SP)'
      },
      sprintDurationWeeks: {
        type: 'number',
        description: 'Thời lượng mỗi Sprint tính theo tuần (mặc định 2 tuần)'
      },
      startDate: {
        type: 'string',
        description: 'Ngày bắt đầu Sprint đầu tiên (định dạng YYYY-MM-DD, mặc định thứ Hai tới)'
      },
      dryRun: {
        type: 'boolean',
        description:
          'Chế độ xem trước (Mặc định true: chỉ tính toán kế hoạch để người dùng duyệt, false: tạo Sprint và di chuyển task thật vào DB)'
      }
    }
  }

  private readonly logger = new Logger(AutoPlanSprintsTool.name)

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
    args: {
      projectId?: string
      targetVelocityPerSprint?: number
      sprintDurationWeeks?: number
      startDate?: string
      dryRun?: boolean
    },
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

    const dryRun = args.dryRun !== false // Mặc định true
    const velocityCap = Math.max(15, args.targetVelocityPerSprint || 35)
    const durationWeeks = Math.max(1, args.sprintDurationWeeks || 2)

    try {
      // 1. Lấy tất cả các task thuộc các Sprint PLANNED
      const plannedSprints = await this.prisma.sprint.findMany({
        where: {
          projectId: targetProjectId,
          status: 'PLANNED',
          deletedAt: null
        },
        select: { id: true }
      })

      if (plannedSprints.length === 0) {
        return {
          output: JSON.stringify({
            error: 'Không tìm thấy Sprint nào ở trạng thái PLANNED trong Backlog để lập kế hoạch.'
          }),
          status: 'ERROR',
          summary: 'Không có Sprint Planned trong Backlog'
        }
      }

      const tasks = await this.prisma.task.findMany({
        where: {
          sprintId: { in: plannedSprints.map((s) => s.id) },
          deletedAt: null
        },
        include: {
          predecessors: { select: { predecessorId: true } }
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }]
      })

      if (tasks.length === 0) {
        return {
          output: JSON.stringify({
            error: 'Các Sprint Planned hiện không có task nào để lập kế hoạch.'
          }),
          status: 'ERROR',
          summary: 'Không có task trong Backlog'
        }
      }

      // 2. Phân loại Role & Sắp xếp Topological Sort CPM
      // Đếm số phụ thuộc nội bộ trong backlog
      const taskMap = new Map(tasks.map((t) => [t.id, t]))
      const inDegree = new Map<string, number>()
      for (const t of tasks) {
        // Chỉ đếm predecessor nếu predecessor cũng nằm trong tập tasks cần chia
        const internalPredecessors = t.predecessors.filter((p) => taskMap.has(p.predecessorId))
        inDegree.set(t.id, internalPredecessors.length)
      }

      // Sắp xếp ưu tiên:
      // (1) In-degree ít hơn (task độc lập / tiền nhiệm lên trước)
      // (2) Backend/DB ưu tiên trước Frontend/Test
      // (3) Priority cao hơn (URGENT > HIGH > MEDIUM > LOW)
      const priorityOrder: Record<string, number> = {
        URGENT: 4,
        HIGH: 3,
        MEDIUM: 2,
        LOW: 1
      }

      const sortedTasks = [...tasks].sort((a, b) => {
        const degA = inDegree.get(a.id) || 0
        const degB = inDegree.get(b.id) || 0
        if (degA !== degB) return degA - degB

        const roleA = inferTechnicalRole(a.title, a.description)
        const roleB = inferTechnicalRole(b.title, b.description)
        const isCoreA = roleA === 'BACKEND' || roleA === 'DEVOPS' ? 1 : 0
        const isCoreB = roleB === 'BACKEND' || roleB === 'DEVOPS' ? 1 : 0
        if (isCoreA !== isCoreB) return isCoreB - isCoreA

        const prioA = priorityOrder[a.priority || 'MEDIUM'] || 2
        const prioB = priorityOrder[b.priority || 'MEDIUM'] || 2
        return prioB - prioA
      })

      // 3. Đóng gói vào từng Sprint
      // Tính ngày bắt đầu: nếu không truyền, lấy Thứ 2 tuần tới
      let currentStartDate = args.startDate ? new Date(args.startDate) : new Date()
      if (!args.startDate) {
        // Tìm Thứ 2 gần nhất kế tiếp
        const dayOfWeek = currentStartDate.getDay()
        const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7
        currentStartDate.setDate(currentStartDate.getDate() + daysUntilMonday)
      }

      const plannedSprintsPackages: PlannedSprintPackage[] = []
      let currentSprintTasks: PlannedSprintPackage['tasks'] = []
      let currentSprintSP = 0
      let currentSprintDur = 0
      let sprintIndex = 1

      for (const t of sortedTasks) {
        const sp = t.storyPoint || 1
        const dur = t.duration || 1
        const role = inferTechnicalRole(t.title, t.description)

        // Nếu thêm task này mà vượt quá trần Velocity và sprint hiện tại đã có task
        if (currentSprintSP + sp > velocityCap && currentSprintTasks.length > 0) {
          const endDate = new Date(currentStartDate)
          endDate.setDate(endDate.getDate() + durationWeeks * 7 - 1)

          plannedSprintsPackages.push(
            this.buildSprintPackage(
              sprintIndex,
              currentSprintTasks,
              currentSprintSP,
              currentSprintDur,
              currentStartDate,
              endDate
            )
          )

          // Reset cho sprint kế tiếp
          sprintIndex++
          currentSprintTasks = []
          currentSprintSP = 0
          currentSprintDur = 0

          currentStartDate = new Date(endDate)
          currentStartDate.setDate(currentStartDate.getDate() + 1)
        }

        currentSprintTasks.push({
          id: t.id,
          title: t.title,
          storyPoint: sp,
          duration: dur,
          role,
          priority: t.priority || 'MEDIUM'
        })
        currentSprintSP += sp
        currentSprintDur += dur
      }

      // Đóng gói sprint cuối cùng nếu còn task dở
      if (currentSprintTasks.length > 0) {
        const endDate = new Date(currentStartDate)
        endDate.setDate(endDate.getDate() + durationWeeks * 7 - 1)
        plannedSprintsPackages.push(
          this.buildSprintPackage(
            sprintIndex,
            currentSprintTasks,
            currentSprintSP,
            currentSprintDur,
            currentStartDate,
            endDate
          )
        )
      }

      // 4. Nếu dryRun === false: Commit thật vào DB
      if (!dryRun) {
        const createdSprintResults: Array<{ id: string; name: string; tasksMoved: number }> = []

        await this.prisma.$transaction(async (tx) => {
          for (const pkg of plannedSprintsPackages) {
            // 4.1. Tạo Sprint mới
            const newSprint = await tx.sprint.create({
              data: {
                projectId: targetProjectId,
                name: pkg.name,
                goal: pkg.goal,
                startDate: new Date(pkg.startDate),
                endDate: new Date(pkg.endDate),
                maxStoryPoint: pkg.totalStoryPoints,
                status: 'PLANNED'
              }
            })

            // 4.2. Tạo 4 BoardColumns chuẩn cho Sprint này
            const createdColumns: any[] = []
            for (const col of DEFAULT_BOARD_COLUMNS) {
              const c = await tx.boardColumn.create({
                data: {
                  sprintId: newSprint.id,
                  title: col.title,
                  isDone: col.isDone,
                  isWip: col.isWip,
                  isBlocked: col.isBlocked,
                  isCancelled: col.isCancelled,
                  color: col.color
                }
              })
              createdColumns.push(c)
            }

            const defaultColumn = createdColumns[0] // Cột To Do

            // 4.3. Di chuyển các tasks vào Sprint mới và cột To Do
            const taskIds = pkg.tasks.map((t) => t.id)
            if (taskIds.length > 0 && defaultColumn) {
              await tx.task.updateMany({
                where: { id: { in: taskIds } },
                data: {
                  sprintId: newSprint.id,
                  boardColumnId: defaultColumn.id
                }
              })
            }

            createdSprintResults.push({
              id: newSprint.id,
              name: newSprint.name,
              tasksMoved: taskIds.length
            })
          }
        })

        this.logger.log(
          `✅ AutoPlanSprints: Đã tạo thật ${createdSprintResults.length} Sprints vào DB thành công!`
        )

        return {
          output: JSON.stringify({
            status: 'COMMITTED',
            message: `Đã khởi tạo thành công ${createdSprintResults.length} Sprints mới từ Backlog.`,
            sprints: createdSprintResults
          }),
          status: 'SUCCESS',
          summary: `Đã tạo ${createdSprintResults.length} Sprints mới và phân bổ ${tasks.length} tasks`
        }
      }

      // 5. Nếu dryRun === true: Trả về Preview cho người dùng xem và duyệt
      const previewPayload = {
        status: 'DRY_RUN_PREVIEW',
        message: 'Kế hoạch phân chia Sprint dự kiến (Chưa lưu vào DB). Vui lòng xem xét trước khi xác nhận.',
        targetProjectId,
        totalTasksPlanned: tasks.length,
        totalSprintsProposed: plannedSprintsPackages.length,
        sprints: plannedSprintsPackages
      }

      return {
        output: JSON.stringify(previewPayload),
        status: 'SUCCESS',
        summary: `Đề xuất chia ${plannedSprintsPackages.length} Sprints (${tasks.length} tasks) · DryRun: true`
      }
    } catch (err: any) {
      this.logger.error(`AutoPlanSprintsTool error: ${err?.message}`, err?.stack)
      return {
        output: `Lỗi lập kế hoạch Sprint: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Lỗi chia Sprint tự động'
      }
    }
  }

  private buildSprintPackage(
    index: number,
    tasks: PlannedSprintPackage['tasks'],
    totalSP: number,
    totalDur: number,
    startDate: Date,
    endDate: Date
  ): PlannedSprintPackage {
    // Xác định vai trò chiếm đa số trong sprint để đặt tên và goal
    const roleCounts: Record<string, number> = {}
    for (const t of tasks) {
      roleCounts[t.role] = (roleCounts[t.role] || 0) + 1
    }

    let dominantRole = 'Tính Năng Cốt Lõi'
    if (roleCounts.BACKEND && roleCounts.BACKEND >= tasks.length * 0.5) {
      dominantRole = 'Nền Tảng & Xác Thực (Foundation & Core APIs)'
    } else if (roleCounts.FRONTEND && roleCounts.FRONTEND >= tasks.length * 0.5) {
      dominantRole = 'Giao Diện & Trải Nghiệm Người Dùng (UI/UX & Components)'
    } else if (roleCounts.QA_TEST && roleCounts.QA_TEST >= tasks.length * 0.4) {
      dominantRole = 'Tích Hợp & Kiểm Thử Chất Lượng (Integration & QA)'
    }

    const sprintName = `Sprint ${index}: ${dominantRole}`
    const sprintGoal = `Hoàn thành ${tasks.length} nhiệm vụ trọng tâm (${totalSP} SP) bao gồm: ${tasks
      .slice(0, 3)
      .map((t) => t.title)
      .join(', ')}${tasks.length > 3 ? '...' : ''}`

    return {
      sprintIndex: index,
      name: sprintName,
      goal: sprintGoal,
      startDate: startDate.toISOString().split('T')[0] || '',
      endDate: endDate.toISOString().split('T')[0] || '',
      totalStoryPoints: totalSP,
      totalDurationDays: totalDur,
      tasksCount: tasks.length,
      tasks
    }
  }
}
