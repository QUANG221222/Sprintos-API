import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

export interface ColumnTaskSummary {
  taskId: string
  title: string
  storyPoint: number
  duration: number
  priority: string
  sortOrder: number
  assignees: string[]
}

export interface BoardColumnDetail {
  id: string
  title: string
  color: string | null
  isDone: boolean
  isWip: boolean
  isBlocked: boolean
  isCancelled: boolean
  tasksCount: number
  totalStoryPoints: number
  isWipExceeded: boolean
  tasks: ColumnTaskSummary[]
}

@Injectable()
export class GetBoardColumnsTool implements IAgentTool {
  private readonly logger = new Logger(GetBoardColumnsTool.name)

  readonly name = 'getBoardColumns'
  readonly description =
    'Lấy cấu trúc toàn diện các cột Kanban của Sprint: Danh sách các cột trạng thái theo thứ tự hiển thị, màu sắc, ' +
    'cờ trạng thái (isDone, isWip, isBlocked, isCancelled), số lượng công việc hiện có, tổng Story Points từng cột, ' +
    'danh sách thẻ công việc trong cột (kèm người phụ trách, độ ưu tiên, sortOrder) và cảnh báo quá tải WIP Limit.'

  readonly category: ToolCategory = 'KANBAN'
  readonly riskLevel: ToolRiskLevel = 'READ'
  readonly level: ToolActionLevel = 'READ'

  readonly parameters = {
    type: 'object',
    properties: {
      sprintId: {
        type: 'string',
        description: 'ID của Sprint cần lấy cấu trúc cột Kanban (nếu bỏ trống, dùng Sprint ACTIVE hiện tại)'
      },
      wipLimit: {
        type: 'number',
        description: 'Ngưỡng giới hạn số lượng công việc đang làm (WIP limit) cho các cột isWip (mặc định: 5)'
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

  async execute(
    args: {
      sprintId?: string
      wipLimit?: number
    },
    context: AgentContext
  ): Promise<ToolExecutionResult> {
    const { wipLimit = 5 } = args
    const targetProjectId = context.targetProjectId

    try {
      // 1. Xác định Sprint mục tiêu
      let sprintId = args.sprintId || context.activeSprintId

      if (!sprintId && targetProjectId) {
        const activeSprint = await this.prisma.sprint.findFirst({
          where: { projectId: targetProjectId, status: 'ACTIVE', deletedAt: null },
          orderBy: { createdAt: 'desc' }
        })
        sprintId = activeSprint?.id
      }

      if (!sprintId && targetProjectId) {
        const anySprint = await this.prisma.sprint.findFirst({
          where: { projectId: targetProjectId, deletedAt: null },
          orderBy: { createdAt: 'desc' }
        })
        sprintId = anySprint?.id
      }

      if (!sprintId) {
        return {
          output: 'Không tìm thấy Sprint phù hợp để lấy cấu trúc các cột Kanban.',
          status: 'ERROR',
          summary: 'Thiếu Sprint ID'
        }
      }

      // 2. Truy vấn Sprint và các cột BoardColumn
      const sprint = await this.prisma.sprint.findUnique({
        where: { id: sprintId, deletedAt: null },
        include: {
          project: { select: { id: true, name: true } },
          boardColumns: {
            where: { deletedAt: null },
            include: {
              tasks: {
                where: { deletedAt: null },
                include: {
                  assignees: {
                    include: {
                      user: { select: { displayName: true } }
                    }
                  },
                  boardColumnTaskOrders: {
                    select: { boardColumnId: true, sortOrder: true }
                  }
                }
              }
            },
            orderBy: { createdAt: 'asc' }
          }
        }
      })

      if (!sprint) {
        return {
          output: `Không tìm thấy Sprint với ID "${sprintId}".`,
          status: 'ERROR',
          summary: 'Sprint không tồn tại'
        }
      }

      if (sprint.boardColumns.length === 0) {
        return {
          output: `Sprint "${sprint.name}" hiện chưa có bất kỳ cột Kanban nào.`,
          status: 'SUCCESS',
          summary: 'Sprint chưa có Board Columns'
        }
      }

      // 3. Xử lý và tính toán từng cột
      let totalSprintTasks = 0
      let totalSprintSP = 0
      const bottleneckWarnings: string[] = []

      const columnsDetail: BoardColumnDetail[] = sprint.boardColumns.map((col) => {
        const activeTasks = col.tasks.filter((t) => !t.deletedAt)

        // Sắp xếp các tasks theo sortOrder trong cột
        const taskSummaries: ColumnTaskSummary[] = activeTasks
          .map((t) => {
            const orderObj = t.boardColumnTaskOrders.find((o) => o.boardColumnId === col.id)
            const sortOrder = orderObj?.sortOrder ?? 999
            return {
              taskId: t.id,
              title: t.title,
              storyPoint: t.storyPoint || 0,
              duration: t.duration || 0,
              priority: t.priority || 'MEDIUM',
              sortOrder,
              assignees: t.assignees.map((a) => a.user.displayName)
            }
          })
          .sort((a, b) => a.sortOrder - b.sortOrder)

        const colSP = taskSummaries.reduce((sum, t) => sum + t.storyPoint, 0)
        const isWipExceeded = Boolean(col.isWip && taskSummaries.length > wipLimit)

        if (isWipExceeded) {
          bottleneckWarnings.push(
            `⚠️ **Cảnh báo nghẽn cổ chai tại cột [${col.title}]:** Đang có ${taskSummaries.length} tasks (vượt ngưỡng WIP khuyến nghị là ${wipLimit} tasks). Đội ngũ nên tập trung hoàn thành các task đang dang dở trước khi kéo thêm việc mới.`
          )
        }

        totalSprintTasks += taskSummaries.length
        totalSprintSP += colSP

        return {
          id: col.id,
          title: col.title,
          color: col.color,
          isDone: col.isDone,
          isWip: col.isWip,
          isBlocked: col.isBlocked,
          isCancelled: col.isCancelled,
          tasksCount: taskSummaries.length,
          totalStoryPoints: colSP,
          isWipExceeded,
          tasks: taskSummaries
        }
      })

      // 4. Định dạng Markdown trực quan
      const markdown = this.formatMarkdownReport(
        sprint,
        columnsDetail,
        totalSprintTasks,
        totalSprintSP,
        wipLimit,
        bottleneckWarnings
      )

      const payload = {
        sprintId: sprint.id,
        sprintName: sprint.name,
        totalColumns: columnsDetail.length,
        totalTasks: totalSprintTasks,
        totalStoryPoints: totalSprintSP,
        wipLimitConfig: wipLimit,
        bottleneckWarnings,
        columns: columnsDetail
      }

      return {
        output: `${markdown}\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        status: 'SUCCESS',
        summary: `Cấu trúc bảng Kanban "${sprint.name}": ${columnsDetail.length} cột · ${totalSprintTasks} tasks (${totalSprintSP} SP)${bottleneckWarnings.length > 0 ? ` · Có ${bottleneckWarnings.length} cảnh báo WIP` : ''}`
      }
    } catch (err: any) {
      this.logger.error(`GetBoardColumnsTool error: ${err?.message}`, err?.stack)
      return {
        output: `Lỗi khi truy vấn cấu trúc cột Kanban: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Lỗi truy vấn Board Columns'
      }
    }
  }

  private formatMarkdownReport(
    sprint: any,
    columns: BoardColumnDetail[],
    totalTasks: number,
    totalSP: number,
    wipLimit: number,
    warnings: string[]
  ): string {
    let md = `### 📋 Cấu Trúc Bảng Kanban (Kanban Board Workflow)\n\n`
    md += `* **Sprint:** **${sprint.name}** (Trạng thái: \`${sprint.status}\`)\n`
    md += `* **Dự án:** ${sprint.project?.name || 'N/A'}\n`
    md += `* **Tổng số cột:** ${columns.length} cột · **Tổng công việc:** ${totalTasks} tasks (${totalSP} Story Points)\n`
    md += `* **Cấu hình giới hạn WIP:** ${wipLimit} tasks / cột đang làm\n\n`

    if (warnings.length > 0) {
      md += `#### 🚨 Cảnh Báo Giới Hạn Làm Việc Đồng Thời (WIP Limit Guard)\n`
      warnings.forEach((w) => {
        md += `* ${w}\n`
      })
      md += `\n`
    }

    md += `#### 📊 Thống Kê Các Cột Trạng Thái\n`
    md += `| # | Cột Kanban | Loại trạng thái | Số lượng Task | Story Points | Tình trạng WIP |\n`
    md += `| :---: | :--- | :---: | :---: | :---: | :---: |\n`

    columns.forEach((c, idx) => {
      let typeBadge = '⚪ Chờ xử lý'
      if (c.isDone) typeBadge = '🟢 Done'
      else if (c.isWip) typeBadge = '🔵 In Progress (WIP)'
      else if (c.isBlocked) typeBadge = '🔴 Blocked'
      else if (c.isCancelled) typeBadge = '⚫ Cancelled'

      const wipBadge = c.isWip
        ? c.isWipExceeded
          ? `🔴 **Vượt WIP (${c.tasksCount}/${wipLimit})**`
          : `🟢 An toàn (${c.tasksCount}/${wipLimit})`
        : '—'

      md += `| ${idx + 1} | **${c.title}** | ${typeBadge} | **${c.tasksCount}** | **${c.totalStoryPoints} SP** | ${wipBadge} |\n`
    })

    md += `\n#### 🗂️ Danh Sách Thẻ Công Việc Theo Thứ Tự Hiển Thị Trong Cột\n`
    columns.forEach((c) => {
      md += `\n##### 📌 Cột: **${c.title}** (${c.tasksCount} tasks · ${c.totalStoryPoints} SP)\n`
      if (c.tasks.length === 0) {
        md += `_Cột này hiện đang trống (0 task)._\n`
      } else {
        md += `| Vị trí | Task | SP | Duration | Ưu tiên | Người phụ trách |\n`
        md += `| :---: | :--- | :---: | :---: | :---: | :--- |\n`
        c.tasks.forEach((t, tIdx) => {
          const assignees = t.assignees.length > 0 ? t.assignees.join(', ') : '_Chưa gán_'
          md += `| #${tIdx + 1} | **${t.title}** (ID: \`${t.taskId}\`) | ${t.storyPoint} SP | ${t.duration}d | ${t.priority} | ${assignees} |\n`
        })
      }
    })

    return md
  }
}
