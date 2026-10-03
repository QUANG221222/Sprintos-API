import { Injectable } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

// Thuật toán Kahn - Topological Sort để phát hiện chu trình DAG
function detectCycleKahn(nodes: string[], edges: Array<{ from: string; to: string }>): { hasCycle: boolean; cycle?: string[] } {
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()

  for (const n of nodes) {
    inDegree.set(n, 0)
    adj.set(n, [])
  }

  for (const e of edges) {
    adj.get(e.from)?.push(e.to)
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1)
  }

  const queue: string[] = []
  for (const [node, deg] of inDegree) {
    if (deg === 0) queue.push(node)
  }

  let processed = 0
  while (queue.length > 0) {
    const cur = queue.shift()!
    processed++
    for (const neighbor of adj.get(cur) || []) {
      const newDeg = (inDegree.get(neighbor) || 0) - 1
      inDegree.set(neighbor, newDeg)
      if (newDeg === 0) queue.push(neighbor)
    }
  }

  if (processed < nodes.length) {
    // Có chu trình - tìm ra các node tạo thành chu trình
    const cycleNodes = nodes.filter((n) => (inDegree.get(n) || 0) > 0)
    return { hasCycle: true, cycle: cycleNodes }
  }

  return { hasCycle: false }
}

@Injectable()
export class ManageDependencyTool implements IAgentTool {
  readonly name = 'manageTaskDependency'
  readonly description =
    'Thêm hoặc xóa mối quan hệ phụ thuộc kỹ thuật (FS, SS, FF, SF + lag) giữa 2 task trong Sprint. ' +
    'Tích hợp thuật toán Kahn (Topological Sort) để kiểm tra và ngăn chặn chu trình phụ thuộc kín (Cycle Detection) trước khi ghi vào bảng TaskDependency. ' +
    'FS = Finish-to-Start (task B bắt đầu sau khi A kết thúc), SS = Start-to-Start, FF = Finish-to-Finish, SF = Start-to-Finish.'
  readonly category: ToolCategory = 'TASK'
  readonly riskLevel: ToolRiskLevel = 'WRITE'
  readonly level: ToolActionLevel = 'WRITE'
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['ADD', 'REMOVE'],
        description: 'ADD: Thêm quan hệ phụ thuộc mới. REMOVE: Gỡ bỏ quan hệ phụ thuộc hiện có.'
      },
      predecessorTaskId: {
        type: 'string',
        description: 'ID của task tiền nhiệm (task phải hoàn thành TRƯỚC)'
      },
      successorTaskId: {
        type: 'string',
        description: 'ID của task kế nhiệm (task bắt đầu SAU)'
      },
      dependencyType: {
        type: 'string',
        enum: ['FS', 'SS', 'FF', 'SF'],
        description: 'Loại quan hệ phụ thuộc: FS (Finish-Start, mặc định), SS (Start-Start), FF (Finish-Finish), SF (Start-Finish)'
      },
      lagDays: {
        type: 'number',
        description: 'Số ngày trễ (lag) sau quan hệ phụ thuộc, mặc định = 0'
      },
      dryRun: {
        type: 'boolean',
        description: 'Nếu true, chỉ chạy thuật toán kiểm tra chu trình và xem trước mà KHÔNG ghi vào DB. Mặc định: false'
      }
    },
    required: ['action', 'predecessorTaskId', 'successorTaskId']
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
      action: 'ADD' | 'REMOVE'
      predecessorTaskId: string
      successorTaskId: string
      dependencyType?: 'FS' | 'SS' | 'FF' | 'SF'
      lagDays?: number
    },
    context: AgentContext
  ): Promise<ToolExecutionResult> {
    const { action, predecessorTaskId, successorTaskId } = args
    const depType = args.dependencyType || 'FS'
    const lag = typeof args.lagDays === 'number' ? Math.max(0, Math.round(args.lagDays)) : 0

    if (!predecessorTaskId || !successorTaskId) {
      return {
        output: 'Bắt buộc phải cung cấp cả predecessorTaskId và successorTaskId.',
        status: 'ERROR',
        summary: 'Thiếu tham số ID task'
      }
    }

    if (predecessorTaskId === successorTaskId) {
      return {
        output: 'Không thể tạo quan hệ phụ thuộc tự tham chiếu (task phụ thuộc vào chính nó).',
        status: 'ERROR',
        summary: 'Chu trình tự tham chiếu'
      }
    }

    try {
      // 1. Kiểm tra task tồn tại
      const [predecessor, successor] = await Promise.all([
        this.prisma.task.findUnique({ where: { id: predecessorTaskId, deletedAt: null } }),
        this.prisma.task.findUnique({ where: { id: successorTaskId, deletedAt: null } })
      ])

      if (!predecessor) {
        return { output: `Task tiền nhiệm (${predecessorTaskId}) không tồn tại.`, status: 'ERROR', summary: 'Task tiền nhiệm không tìm thấy' }
      }
      if (!successor) {
        return { output: `Task kế nhiệm (${successorTaskId}) không tồn tại.`, status: 'ERROR', summary: 'Task kế nhiệm không tìm thấy' }
      }

      // --- REMOVE action ---
      if (action === 'REMOVE') {
        const existing = await this.prisma.taskDependency.findFirst({
          where: { predecessorId: predecessorTaskId, successorId: successorTaskId }
        })

        if (!existing) {
          return {
            output: `Không tìm thấy quan hệ phụ thuộc giữa task "${predecessor.title}" → "${successor.title}" để xóa.`,
            status: 'ERROR',
            summary: 'Quan hệ phụ thuộc không tồn tại'
          }
        }

        await this.prisma.taskDependency.delete({ where: { id: existing.id } })
        return {
          output: JSON.stringify({ action: 'REMOVED', predecessorTitle: predecessor.title, successorTitle: successor.title }),
          status: 'SUCCESS',
          summary: `Đã gỡ quan hệ phụ thuộc: "${predecessor.title}" → "${successor.title}"`
        }
      }

      // --- ADD action ---
      // 2. Lấy tất cả dependency hiện có trong cùng Sprint để chạy Kahn
      const sprintId = predecessor.sprintId || successor.sprintId
      let allDeps = await this.prisma.taskDependency.findMany({
        where: {
          predecessor: { sprintId: sprintId || undefined, deletedAt: null },
          successor: { sprintId: sprintId || undefined, deletedAt: null }
        },
        select: { predecessorId: true, successorId: true }
      })

      // Lấy tất cả task IDs trong Sprint
      const sprintTasks = sprintId
        ? await this.prisma.task.findMany({
            where: { sprintId, deletedAt: null },
            select: { id: true }
          })
        : [{ id: predecessorTaskId }, { id: successorTaskId }]

      const nodeIds = sprintTasks.map((t) => t.id)
      const edges = allDeps.map((d) => ({ from: d.predecessorId, to: d.successorId }))

      // Thêm edge mới vào để kiểm tra trước khi ghi
      edges.push({ from: predecessorTaskId, to: successorTaskId })

      // 3. Kiểm tra chu trình bằng Kahn Algorithm
      const cycleCheck = detectCycleKahn(nodeIds, edges)
      if (cycleCheck.hasCycle) {
        return {
          output: JSON.stringify({
            error: 'Quan hệ phụ thuộc này tạo ra chu trình kín (Dependency Cycle) trong đồ thị DAG của Sprint.',
            cycleNodes: cycleCheck.cycle,
            instruction: 'Vui lòng kiểm tra lại logic phụ thuộc. Chu trình kín sẽ làm sập thuật toán CPM và Gantt Chart.'
          }),
          status: 'ERROR',
          summary: `Phát hiện chu trình phụ thuộc kín! Các task liên quan: ${cycleCheck.cycle?.join(', ')}`
        }
      }

      if ((args as any).dryRun || context.dryRun) {
        return {
          output: `### 🔍 [Xem Trước Mô Phỏng - Chưa Lưu DB] Kiểm Tra Quan Hệ Phụ Thuộc\n\n* **Tiền nhiệm:** "${predecessor.title}" (ID: \`${predecessorTaskId}\`)\n* **Kế nhiệm:** "${successor.title}" (ID: \`${successorTaskId}\`)\n* **Loại quan hệ:** ${depType} (Lag: ${lag} ngày)\n* **Kiểm tra Chu trình DAG (Kahn):** ✅ Hợp lệ, không phát hiện chu trình kín.\n\n*⚠️ Thao tác đang chạy ở chế độ xem trước (Dry-Run). Cơ sở dữ liệu CHƯA thay đổi.*`,
          status: 'SUCCESS',
          summary: `[Mô phỏng] Quan hệ phụ thuộc hợp lệ: "${predecessor.title}" -> "${successor.title}"`,
          diff: { mode: 'DRY_RUN_PREVIEW', predecessorTaskId, successorTaskId, depType, lag, hasCycle: false }
        }
      }

      // 4. Kiểm tra đã tồn tại chưa
      const existing = await this.prisma.taskDependency.findFirst({
        where: { predecessorId: predecessorTaskId, successorId: successorTaskId }
      })

      if (existing) {
        // Cập nhật loại phụ thuộc nếu đã tồn tại
        await this.prisma.taskDependency.update({
          where: { id: existing.id },
          data: { type: depType, lag }
        })
        return {
          output: JSON.stringify({
            action: 'UPDATED',
            predecessorTitle: predecessor.title,
            successorTitle: successor.title,
            dependencyType: depType,
            lagDays: lag
          }),
          status: 'SUCCESS',
          summary: `Đã cập nhật quan hệ phụ thuộc: "${predecessor.title}" → "${successor.title}" (${depType}, lag=${lag} ngày)`
        }
      }

      // 5. Ghi vào DB
      const newDep = await this.prisma.taskDependency.create({
        data: {
          predecessorId: predecessorTaskId,
          successorId: successorTaskId,
          type: depType,
          lag
        }
      })

      return {
        output: JSON.stringify({
          id: newDep.id,
          action: 'ADDED',
          predecessorTitle: predecessor.title,
          successorTitle: successor.title,
          dependencyType: depType,
          lagDays: lag,
          dagValidation: 'PASSED - Không phát hiện chu trình kín'
        }),
        status: 'SUCCESS',
        summary: `Đã thêm quan hệ phụ thuộc ${depType}: "${predecessor.title}" → "${successor.title}" (lag=${lag} ngày, DAG hợp lệ ✅)`
      }
    } catch (err: any) {
      return {
        output: `Lỗi khi thao tác quan hệ phụ thuộc: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Thao tác phụ thuộc task thất bại'
      }
    }
  }
}
