import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

export type OrphanAnomalyType =
  | 'BROKEN_PARENT_HIERARCHY'
  | 'MISMATCHED_COLUMN_SPRINT'
  | 'ZOMBIE_COMPLETED_SPRINT'
  | 'CPM_ISOLATED_NODE'

export interface OrphanTaskIssue {
  taskId: string
  taskTitle: string
  sprintName: string
  sprintStatus: string
  columnTitle: string
  issueType: OrphanAnomalyType
  description: string
  remediation: string
}

@Injectable()
export class DetectOrphanTasksTool implements IAgentTool {
  private readonly logger = new Logger(DetectOrphanTasksTool.name)

  readonly name = 'detectOrphanTasks'
  readonly description =
    'Phát hiện Công việc "Mồ côi" & Cô lập trong Dự án: Quét 4 loại bất thường cấu trúc: ' +
    '(1) Subtasks có parentId trỏ tới task không tồn tại hoặc đã bị xóa (Broken Hierarchy), ' +
    '(2) Tasks có cột Kanban không thuộc về Sprint hiện tại (Mismatched Column), ' +
    '(3) Zombie Tasks: Công việc chưa hoàn thành bị bỏ quên trong Sprint đã COMPLETED, ' +
    '(4) CPM Isolated Tasks: Công việc cô lập hoàn toàn khỏi mạng đường găng CPM. ' +
    'Hỗ trợ tùy chọn "autoFix: true" để tự động sửa chữa an toàn các liên kết hỏng.'

  readonly category: ToolCategory = 'TASK'
  readonly riskLevel: ToolRiskLevel = 'READ'
  readonly level: ToolActionLevel = 'READ'

  readonly parameters = {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'ID dự án cần quét (nếu bỏ trống, dùng targetProjectId trong ngữ cảnh hiện tại)'
      },
      sprintId: {
        type: 'string',
        description: 'Thu hẹp phạm vi quét vào 1 Sprint cụ thể (tùy chọn)'
      },
      autoFix: {
        type: 'boolean',
        description:
          'Mặc định false: Nếu true, hệ thống tự động sửa chữa an toàn (gỡ parentId hỏng, chuyển Zombie tasks từ Sprint đã hoàn thành sang Sprint mới hoặc Backlog).'
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
      projectId?: string
      sprintId?: string
      autoFix?: boolean
    },
    context: AgentContext
  ): Promise<ToolExecutionResult> {
    const { autoFix = false, sprintId } = args
    const targetProjectId = args.projectId || context.targetProjectId

    if (!targetProjectId) {
      return {
        output: 'Không tìm thấy ID dự án (projectId) để thực hiện quét công việc mồ côi.',
        status: 'ERROR',
        summary: 'Thiếu projectId'
      }
    }

    try {
      // 1. Lấy danh sách Sprints hợp lệ của dự án
      const sprints = await this.prisma.sprint.findMany({
        where: { projectId: targetProjectId, deletedAt: null },
        select: { id: true, name: true, status: true, createdAt: true }
      })

      if (sprints.length === 0) {
        return {
          output: 'Dự án hiện chưa có bất kỳ Sprint nào được khởi tạo.',
          status: 'SUCCESS',
          summary: 'Dự án chưa có Sprint'
        }
      }

      const validSprintIds = sprints.map((s) => s.id)

      // 2. Lấy toàn bộ tasks trong phạm vi quét
      const tasks = await this.prisma.task.findMany({
        where: {
          deletedAt: null,
          sprintId: sprintId ? sprintId : { in: validSprintIds }
        },
        include: {
          sprint: { select: { id: true, name: true, status: true } },
          boardColumn: { select: { id: true, title: true, isDone: true, sprintId: true } },
          predecessors: { select: { id: true, predecessorId: true } },
          successors: { select: { id: true, successorId: true } }
        }
      })

      const taskIdSet = new Set(tasks.map((t) => t.id))
      const issues: OrphanTaskIssue[] = []

      // Đếm số lượng task có quan hệ dependency trong dự án để xác định mạng CPM
      const totalCpmDependencies = tasks.reduce((sum, t) => sum + t.predecessors.length + t.successors.length, 0)
      const hasActiveCpmNetwork = totalCpmDependencies >= 4

      // 3. Phân tích 4 loại khiếm khuyết
      for (const t of tasks) {
        // Loại 1: Broken Parent Hierarchy (Subtask có parentId không tồn tại hoặc đã xóa)
        if (t.parentId && !taskIdSet.has(t.parentId)) {
          issues.push({
            taskId: t.id,
            taskTitle: t.title,
            sprintName: t.sprint.name,
            sprintStatus: t.sprint.status,
            columnTitle: t.boardColumn.title,
            issueType: 'BROKEN_PARENT_HIERARCHY',
            description: `Task con chỉ định parentId "${t.parentId}" nhưng task cha không tồn tại hoặc đã bị xóa vĩnh viễn.`,
            remediation: 'Gỡ bỏ parentId hỏng để chuyển task thành công việc độc lập độc lập.'
          })
        }

        // Loại 2: Cột Kanban thuộc Sprint khác với Sprint của Task
        if (t.boardColumn.sprintId !== t.sprintId) {
          issues.push({
            taskId: t.id,
            taskTitle: t.title,
            sprintName: t.sprint.name,
            sprintStatus: t.sprint.status,
            columnTitle: t.boardColumn.title,
            issueType: 'MISMATCHED_COLUMN_SPRINT',
            description: `Task thuộc Sprint "${t.sprint.name}" nhưng cột "${t.boardColumn.title}" lại thuộc về một Sprint khác.`,
            remediation: 'Di chuyển task vào cột Kanban tương ứng của đúng Sprint hiện tại.'
          })
        }

        // Loại 3: Zombie Task (Chưa xong kẹt lại trong Sprint đã COMPLETED)
        if (t.sprint.status === 'COMPLETED' && !t.boardColumn.isDone) {
          issues.push({
            taskId: t.id,
            taskTitle: t.title,
            sprintName: t.sprint.name,
            sprintStatus: t.sprint.status,
            columnTitle: t.boardColumn.title,
            issueType: 'ZOMBIE_COMPLETED_SPRINT',
            description: `Task chưa hoàn thành (${t.boardColumn.title}) bị bỏ quên trong Sprint đã kết thúc (COMPLETED) mà không được chuyển sang Backlog.`,
            remediation: 'Tự động chuyển task về Sprint Planned gần nhất hoặc Sprint Active hiện tại.'
          })
        }

        // Loại 4: CPM Isolated Node (Cô lập hoàn toàn trong mạng CPM đường găng của Sprint Active)
        if (
          hasActiveCpmNetwork &&
          t.sprint.status === 'ACTIVE' &&
          !t.boardColumn.isDone &&
          !t.parentId &&
          t.predecessors.length === 0 &&
          t.successors.length === 0 &&
          (t.duration || 0) > 0
        ) {
          issues.push({
            taskId: t.id,
            taskTitle: t.title,
            sprintName: t.sprint.name,
            sprintStatus: t.sprint.status,
            columnTitle: t.boardColumn.title,
            issueType: 'CPM_ISOLATED_NODE',
            description: `Task có thời gian thi công (${t.duration} ngày) nhưng không có bất kỳ tiền nhiệm (predecessor) hay kế thừa (successor) nào, đứng ngoài sơ đồ mạng CPM.`,
            remediation: 'Thiết lập mối quan hệ phụ thuộc kỹ thuật (FS, SS) với các task liên quan để thuật toán đường găng tối ưu hóa.'
          })
        }
      }

      // 4. Nếu autoFix: true -> Tiến hành tự động khắc phục an toàn
      const fixedReports: string[] = []
      if (autoFix && issues.length > 0) {
        // Tìm Sprint đích để chuyển Zombie tasks (ưu tiên ACTIVE, sau đó PLANNED)
        const destinationSprint =
          (await this.prisma.sprint.findFirst({
            where: { projectId: targetProjectId, status: 'ACTIVE', deletedAt: null },
            orderBy: { createdAt: 'desc' }
          })) ||
          (await this.prisma.sprint.findFirst({
            where: { projectId: targetProjectId, status: 'PLANNED', deletedAt: null },
            orderBy: { createdAt: 'desc' }
          }))

        await this.prisma.$transaction(async (tx) => {
          for (const issue of issues) {
            if (issue.issueType === 'BROKEN_PARENT_HIERARCHY') {
              await tx.task.update({
                where: { id: issue.taskId },
                data: { parentId: null }
              })
              fixedReports.push(`✅ Đã gỡ parentId hỏng cho task "${issue.taskTitle}" (ID: ${issue.taskId})`)
            } else if (issue.issueType === 'ZOMBIE_COMPLETED_SPRINT' && destinationSprint) {
              // Tìm cột To Do đầu tiên của Sprint đích
              const destCol = await tx.boardColumn.findFirst({
                where: { sprintId: destinationSprint.id, isDone: false, deletedAt: null },
                orderBy: { createdAt: 'asc' }
              })

              if (destCol) {
                await tx.task.update({
                  where: { id: issue.taskId },
                  data: {
                    sprintId: destinationSprint.id,
                    boardColumnId: destCol.id
                  }
                })

                // Cập nhật hoặc tạo sort order mới
                await tx.boardColumnTaskOrder.upsert({
                  where: { id: `fix_${issue.taskId}` },
                  update: { boardColumnId: destCol.id },
                  create: {
                    boardColumnId: destCol.id,
                    taskId: issue.taskId,
                    sortOrder: 999
                  }
                })

                fixedReports.push(
                  `✅ Đã di chuyển Zombie task "${issue.taskTitle}" sang Sprint "${destinationSprint.name}" (cột: ${destCol.title})`
                )
              }
            } else if (issue.issueType === 'MISMATCHED_COLUMN_SPRINT') {
              // Tìm cột đầu tiên của đúng sprint của task
              const taskObj = tasks.find((tk) => tk.id === issue.taskId)
              if (taskObj) {
                const correctCol = await tx.boardColumn.findFirst({
                  where: { sprintId: taskObj.sprintId, isDone: false, deletedAt: null },
                  orderBy: { createdAt: 'asc' }
                })
                if (correctCol) {
                  await tx.task.update({
                    where: { id: issue.taskId },
                    data: { boardColumnId: correctCol.id }
                  })
                  fixedReports.push(
                    `✅ Đã chỉnh cột hợp lệ cho "${issue.taskTitle}" về cột "${correctCol.title}" thuộc đúng Sprint.`
                  )
                }
              }
            }
          }
        })
      }

      // 5. Định dạng Markdown trực quan
      const markdown = this.formatMarkdownReport(issues, fixedReports, autoFix, tasks.length)

      const payload = {
        scannedTasksCount: tasks.length,
        totalIssuesFound: issues.length,
        autoFixApplied: autoFix,
        fixesCount: fixedReports.length,
        issueCounts: {
          brokenParentCount: issues.filter((i) => i.issueType === 'BROKEN_PARENT_HIERARCHY').length,
          mismatchedColumnCount: issues.filter((i) => i.issueType === 'MISMATCHED_COLUMN_SPRINT').length,
          zombieTasksCount: issues.filter((i) => i.issueType === 'ZOMBIE_COMPLETED_SPRINT').length,
          cpmIsolatedCount: issues.filter((i) => i.issueType === 'CPM_ISOLATED_NODE').length
        },
        issues,
        fixedReports
      }

      return {
        output: `${markdown}\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        status: 'SUCCESS',
        summary: `Quét Orphan Tasks: ${issues.length} bất thường phát hiện trên ${tasks.length} tasks${autoFix ? ` (Đã tự động sửa ${fixedReports.length} lỗi)` : ''}`
      }
    } catch (err: any) {
      this.logger.error(`DetectOrphanTasksTool error: ${err?.message}`, err?.stack)
      return {
        output: `Lỗi khi quét công việc mồ côi: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Lỗi quét orphan tasks'
      }
    }
  }

  private formatMarkdownReport(
    issues: OrphanTaskIssue[],
    fixedReports: string[],
    autoFix: boolean,
    scannedCount: number
  ): string {
    let md = `### 🔍 Báo Cáo Kiểm Tra Công Việc "Mồ Côi" & Dị Thường Cấu Trúc (Orphan Tasks Audit)\n\n`
    md += `* **Tổng số công việc đã quét:** ${scannedCount} tasks\n`
    md += `* **Số bất thường phát hiện:** **${issues.length} vấn đề**\n`
    md += `* **Trạng thái Tự Động Sửa Chữa (autoFix):** ${autoFix ? '🟢 **Đang bật (Đã thực thi)**' : '⚪ **Tắt (Chỉ báo cáo)**'}\n\n`

    if (fixedReports.length > 0) {
      md += `#### 🛠️ Kết Quả Tự Động Sửa Chữa Đã Thực Hiện\n`
      fixedReports.forEach((fr) => {
        md += `* ${fr}\n`
      })
      md += `\n`
    }

    if (issues.length === 0) {
      md += `> ✅ **Không có công việc mồ côi!** Toàn bộ phân cấp Subtask, liên kết Cột Kanban, và mạng phụ thuộc CPM đều hợp lệ và toàn vẹn.\n`
      return md
    }

    md += `#### 📋 Danh Sách Chi Tiết Các Bất Thường Phát Hiện Được\n`
    md += `| # | Task | Sprint | Vấn đề | Chi tiết | Hướng khắc phục |\n`
    md += `| :---: | :--- | :---: | :---: | :--- | :--- |\n`

    issues.forEach((iss, index) => {
      const badge =
        iss.issueType === 'BROKEN_PARENT_HIERARCHY'
          ? '🔴 Phân cấp hỏng'
          : iss.issueType === 'ZOMBIE_COMPLETED_SPRINT'
            ? '🟠 Zombie Task'
            : iss.issueType === 'MISMATCHED_COLUMN_SPRINT'
              ? '🟡 Sai cột'
              : '🔵 CPM Cô lập'

      md += `| ${index + 1} | **${iss.taskTitle}**<br>\`${iss.taskId}\` | ${iss.sprintName} | ${badge} | ${iss.description} | ${iss.remediation} |\n`
    })

    if (!autoFix) {
      md += `\n> 💡 **Gợi ý tự động hóa:** Để hệ thống tự động gỡ các liên kết cha hỏng và đưa Zombie tasks về Sprint hoạt động mới nhất, hãy gọi lại tool với tham số \`{ autoFix: true }\`.`
    }

    return md
  }
}
