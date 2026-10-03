import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

export type SortCriteria = 'PRIORITY_DESC' | 'DUE_DATE_ASC' | 'STORY_POINT_DESC' | 'STORY_POINT_ASC'

export interface ReorderedTaskComparison {
  taskId: string
  title: string
  storyPoint: number
  duration: number
  priority: string
  dueDate: string | null
  oldOrder: number
  newOrder: number
  assignees: string[]
}

export interface ColumnReorderResult {
  columnId: string
  columnTitle: string
  tasksCount: number
  tasks: ReorderedTaskComparison[]
}

@Injectable()
export class ReorderColumnTasksTool implements IAgentTool {
  private readonly logger = new Logger(ReorderColumnTasksTool.name)

  readonly name = 'reorderColumnTasks'
  readonly description =
    'Tự động sắp xếp lại thứ tự ưu tiên các thẻ công việc (Task Cards) trong cùng một cột Kanban (hoặc toàn bộ các cột trong Sprint) ' +
    'theo tiêu chuẩn Agile: độ ưu tiên cao nhất trước (PRIORITY_DESC), hạn chót gần nhất trước (DUE_DATE_ASC), ' +
    'hoặc Story Point lớn trước (STORY_POINT_DESC) / nhỏ trước (STORY_POINT_ASC - Quick wins). ' +
    'Tự động đánh lại chỉ số sortOrder tuần tự (1, 2, 3...) trong bảng BoardColumnTaskOrder. Hỗ trợ dryRun: true để xem trước.'

  readonly category: ToolCategory = 'KANBAN'
  readonly riskLevel: ToolRiskLevel = 'WRITE'
  readonly level: ToolActionLevel = 'WRITE'

  readonly parameters = {
    type: 'object',
    properties: {
      sprintId: {
        type: 'string',
        description: 'ID của Sprint cần sắp xếp các thẻ (nếu bỏ trống, dùng Sprint ACTIVE hiện tại)'
      },
      columnName: {
        type: 'string',
        description: 'Tên cột cụ thể cần sắp xếp (ví dụ: "To Do", "In Progress"). Nếu bỏ trống, áp dụng cho tất cả các cột chưa Done.'
      },
      columnId: {
        type: 'string',
        description: 'ID của cột cụ thể cần sắp xếp (tùy chọn nếu đã cung cấp columnName)'
      },
      sortBy: {
        type: 'string',
        enum: ['PRIORITY_DESC', 'DUE_DATE_ASC', 'STORY_POINT_DESC', 'STORY_POINT_ASC'],
        description:
          'Tiêu chí sắp xếp: PRIORITY_DESC (Độ ưu tiên cao nhất trước), DUE_DATE_ASC (Hạn chót gần nhất trước), STORY_POINT_DESC (Task lớn trước), STORY_POINT_ASC (Task nhỏ trước - Quick wins). Mặc định: PRIORITY_DESC'
      },
      dryRun: {
        type: 'boolean',
        description: 'Mặc định false: Nếu true, chỉ sinh danh sách thứ tự đề xuất để xem trước mà không ghi vào DB.'
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
      columnName?: string
      columnId?: string
      sortBy?: SortCriteria
      dryRun?: boolean
    },
    context: AgentContext
  ): Promise<ToolExecutionResult> {
    const { sortBy = 'PRIORITY_DESC', dryRun = false, columnName, columnId } = args
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
          output: 'Không tìm thấy Sprint phù hợp để sắp xếp thứ tự thẻ công việc.',
          status: 'ERROR',
          summary: 'Thiếu Sprint ID'
        }
      }

      // 2. Truy vấn Sprint và các cột Kanban
      const sprint = await this.prisma.sprint.findUnique({
        where: { id: sprintId, deletedAt: null },
        include: {
          project: { select: { id: true, name: true } },
          boardColumns: {
            where: {
              deletedAt: null,
              ...(columnId ? { id: columnId } : {})
            },
            include: {
              tasks: {
                where: { deletedAt: null },
                include: {
                  assignees: { include: { user: { select: { displayName: true } } } },
                  boardColumnTaskOrders: true
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

      // 3. Lọc danh sách cột mục tiêu
      let targetColumns = sprint.boardColumns

      if (columnName) {
        const qName = columnName.toLowerCase().trim()
        targetColumns = targetColumns.filter(
          (c) => c.title.toLowerCase().trim() === qName || c.title.toLowerCase().includes(qName)
        )
        if (targetColumns.length === 0) {
          const availableCols = sprint.boardColumns.map((c) => `"${c.title}"`).join(', ')
          return {
            output: `Không tìm thấy cột có tên "${columnName}" trong Sprint "${sprint.name}". Các cột hiện có: ${availableCols}.`,
            status: 'ERROR',
            summary: 'Cột không tồn tại'
          }
        }
      } else {
        // Mặc định không sắp xếp cột Done (trừ khi user chỉ định cụ thể)
        targetColumns = targetColumns.filter((c) => !c.isDone)
      }

      // 4. Áp dụng thuật toán sắp xếp
      const results: ColumnReorderResult[] = []
      const priorityWeights: Record<string, number> = {
        CRITICAL: 4,
        HIGH: 3,
        MEDIUM: 2,
        LOW: 1
      }

      for (const col of targetColumns) {
        if (col.tasks.length === 0) continue

        // Thu thập thông tin tasks kèm sortOrder hiện tại
        const currentTasks = col.tasks.map((t) => {
          const orderObj = t.boardColumnTaskOrders.find((o) => o.boardColumnId === col.id)
          return {
            task: t,
            oldOrder: orderObj?.sortOrder ?? 999
          }
        })

        // Tiến hành sắp xếp theo tiêu chí
        currentTasks.sort((a, b) => {
          const tA = a.task
          const tB = b.task

          if (sortBy === 'PRIORITY_DESC') {
            const pA = priorityWeights[tA.priority || 'MEDIUM'] || 2
            const pB = priorityWeights[tB.priority || 'MEDIUM'] || 2
            if (pA !== pB) return pB - pA

            // Tầng 2: dueDate gần nhất trước
            if (tA.dueDate && tB.dueDate) return new Date(tA.dueDate).getTime() - new Date(tB.dueDate).getTime()
            if (tA.dueDate && !tB.dueDate) return -1
            if (!tA.dueDate && tB.dueDate) return 1
            return new Date(tA.createdAt).getTime() - new Date(tB.createdAt).getTime()
          }

          if (sortBy === 'DUE_DATE_ASC') {
            if (tA.dueDate && tB.dueDate) return new Date(tA.dueDate).getTime() - new Date(tB.dueDate).getTime()
            if (tA.dueDate && !tB.dueDate) return -1
            if (!tA.dueDate && tB.dueDate) return 1

            // Tầng 2: Ưu tiên cao hơn trước
            const pA = priorityWeights[tA.priority || 'MEDIUM'] || 2
            const pB = priorityWeights[tB.priority || 'MEDIUM'] || 2
            return pB - pA
          }

          if (sortBy === 'STORY_POINT_DESC') {
            const spA = tA.storyPoint || 0
            const spB = tB.storyPoint || 0
            if (spA !== spB) return spB - spA

            const pA = priorityWeights[tA.priority || 'MEDIUM'] || 2
            const pB = priorityWeights[tB.priority || 'MEDIUM'] || 2
            return pB - pA
          }

          if (sortBy === 'STORY_POINT_ASC') {
            const spA = tA.storyPoint || 0
            const spB = tB.storyPoint || 0
            if (spA !== spB) return spA - spB

            const pA = priorityWeights[tA.priority || 'MEDIUM'] || 2
            const pB = priorityWeights[tB.priority || 'MEDIUM'] || 2
            return pB - pA
          }

          return 0
        })

        // Tạo mảng kết quả so sánh
        const comparisons: ReorderedTaskComparison[] = currentTasks.map((item, index) => {
          const newOrder = index + 1
          return {
            taskId: item.task.id,
            title: item.task.title,
            storyPoint: item.task.storyPoint || 0,
            duration: item.task.duration || 0,
            priority: item.task.priority || 'MEDIUM',
            dueDate: item.task.dueDate ? new Date(item.task.dueDate).toISOString() : null,
            oldOrder: item.oldOrder,
            newOrder,
            assignees: item.task.assignees.map((a) => a.user.displayName)
          }
        })

        results.push({
          columnId: col.id,
          columnTitle: col.title,
          tasksCount: comparisons.length,
          tasks: comparisons
        })
      }

      if (results.length === 0) {
        return {
          output: `Các cột được chọn trong Sprint "${sprint.name}" hiện không có công việc nào để sắp xếp.`,
          status: 'SUCCESS',
          summary: 'Không có task để sắp xếp'
        }
      }

      // 5. Nếu dryRun === false -> Ghi cập nhật vào database
      if (!dryRun) {
        await this.prisma.$transaction(async (tx) => {
          for (const colRes of results) {
            for (const taskComp of colRes.tasks) {
              const existingOrder = await tx.boardColumnTaskOrder.findFirst({
                where: { taskId: taskComp.taskId }
              })

              if (existingOrder) {
                await tx.boardColumnTaskOrder.update({
                  where: { id: existingOrder.id },
                  data: {
                    boardColumnId: colRes.columnId,
                    sortOrder: taskComp.newOrder
                  }
                })
              } else {
                await tx.boardColumnTaskOrder.create({
                  data: {
                    boardColumnId: colRes.columnId,
                    taskId: taskComp.taskId,
                    sortOrder: taskComp.newOrder
                  }
                })
              }
            }
          }
        })
      }

      // 6. Định dạng Markdown trực quan
      const markdown = this.formatMarkdownReport(sprint, results, sortBy, dryRun)

      const payload = {
        sprintId: sprint.id,
        sprintName: sprint.name,
        sortBy,
        dryRun,
        columnsReorderedCount: results.length,
        totalTasksReordered: results.reduce((sum, r) => sum + r.tasksCount, 0),
        results
      }

      return {
        output: `${markdown}\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        status: 'SUCCESS',
        summary: `Đã sắp xếp thứ tự ${payload.totalTasksReordered} tasks trong ${results.length} cột theo tiêu chí [${sortBy}]${dryRun ? ' (Xem trước)' : ' (Đã lưu vào DB)'}`
      }
    } catch (err: any) {
      this.logger.error(`ReorderColumnTasksTool error: ${err?.message}`, err?.stack)
      return {
        output: `Lỗi khi sắp xếp thứ tự thẻ công việc: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Lỗi sắp xếp thẻ công việc'
      }
    }
  }

  private formatMarkdownReport(
    sprint: any,
    results: ColumnReorderResult[],
    sortBy: SortCriteria,
    isDryRun: boolean
  ): string {
    const sortCriteriaText: Record<SortCriteria, string> = {
      PRIORITY_DESC: '🎯 **Độ ưu tiên cao nhất lên đầu (Critical ➡️ High ➡️ Medium ➡️ Low)**',
      DUE_DATE_ASC: '⏰ **Hạn chót gần nhất lên đầu (Earliest Deadline first)**',
      STORY_POINT_DESC: '📦 **Độ phức tạp lớn nhất trước (Heavy tasks first)**',
      STORY_POINT_ASC: '⚡ **Chiến thuật Quick Wins: Thẻ nhỏ Story Point thấp làm trước**'
    }

    let md = `### 📶 Sắp Xếp Thứ Tự Thẻ Công Việc (Kanban Card Prioritization)\n\n`
    md += `* **Sprint:** **${sprint.name}**\n`
    md += `* **Tiêu chí tối ưu:** ${sortCriteriaText[sortBy]}\n`
    md += `* **Trạng thái thực thi:** ${isDryRun ? '🔍 **Xem trước gợi ý (dryRun = true)**' : '✅ **Đã cập nhật vị trí trong Database (sortOrder)**'}\n\n`

    results.forEach((col) => {
      md += `#### 📌 Cột: **${col.columnTitle}** (${col.tasksCount} tasks)\n\n`
      md += `| Vị trí mới | Vị trí cũ | Thẻ công việc | Ưu tiên | SP | Hạn chót | Phụ trách |\n`
      md += `| :---: | :---: | :--- | :---: | :---: | :---: | :--- |\n`

      col.tasks.forEach((t) => {
        const orderChange =
          t.newOrder < t.oldOrder
            ? `🟢 ⬆️ (${t.oldOrder})`
            : t.newOrder > t.oldOrder
              ? `🔴 ⬇️ (${t.oldOrder})`
              : `⚪ ➡️ (${t.oldOrder})`

        const dueStr = t.dueDate ? new Date(t.dueDate).toLocaleDateString('vi-VN') : '—'
        const assigneesStr = t.assignees.length > 0 ? t.assignees.join(', ') : '_Chưa gán_'

        md += `| **#${t.newOrder}** | ${orderChange} | **${t.title}** | \`${t.priority}\` | ${t.storyPoint} SP | ${dueStr} | ${assigneesStr} |\n`
      })
      md += `\n`
    })

    if (isDryRun) {
      md += `> 💡 **Gợi ý:** Để áp dụng thứ tự sắp xếp này vào hệ thống và đồng bộ lên giao diện Kanban Board, hãy gọi lại tool \`reorderColumnTasks\` với tham số \`{ dryRun: false }\`.`
    }

    return md
  }
}
