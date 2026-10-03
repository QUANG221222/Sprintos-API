import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { OpenRouterService } from '~/shared/services/openrouter.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

export type DuplicateRiskLevel = 'CRITICAL_DUPLICATE' | 'HIGH_OVERLAP' | 'MODERATE_SIMILARITY'

export interface DuplicateTaskItem {
  taskId: string
  title: string
  similarityPercent: number
  similarityScore: number
  riskLevel: DuplicateRiskLevel
  sprintName: string
  columnName: string
  isDone: boolean
  storyPoint: number
  priority: string
  assignees: string[]
  snippet: string
}

@Injectable()
export class FindDuplicateTasksTool implements IAgentTool {
  private readonly logger = new Logger(FindDuplicateTasksTool.name)

  readonly name = 'findDuplicateTasks'
  readonly description =
    'Chống trùng lặp thông minh (Duplicate Guard): Sử dụng cơ sở dữ liệu vector pgvector tính toán cosine similarity ' +
    'giữa công việc chuẩn bị tạo (hoặc task chỉ định) với toàn bộ kho công việc hiện có trong Backlog/Sprint của dự án. ' +
    'Cảnh báo sớm nếu phát hiện task trùng lặp hoặc tương đồng ngữ nghĩa cao (> 75-80%) để ngăn chặn tạo việc trùng thừa lãng phí tài nguyên.'

  readonly category: ToolCategory = 'RAG'
  readonly riskLevel: ToolRiskLevel = 'READ'
  readonly level: ToolActionLevel = 'READ'

  readonly parameters = {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Tiêu đề công việc cần kiểm tra chống trùng lặp (bắt buộc)'
      },
      description: {
        type: 'string',
        description: 'Mô tả chi tiết hoặc tiêu chí nghiệm thu để tăng độ chính xác so khớp vector'
      },
      threshold: {
        type: 'number',
        description: 'Ngưỡng tương đồng cosine similarity tối thiểu từ 0.0 đến 1.0 (mặc định: 0.75 tức 75%)'
      },
      limit: {
        type: 'number',
        description: 'Số lượng kết quả tương đồng tối đa trả về (mặc định: 5)'
      },
      excludeTaskId: {
        type: 'string',
        description: 'ID của task cần loại trừ khỏi kết quả (dùng khi đang kiểm tra chính task đó để chỉnh sửa)'
      }
    },
    required: ['title']
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly openRouterService: OpenRouterService
  ) {}

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
      title: string
      description?: string
      threshold?: number
      limit?: number
      excludeTaskId?: string
    },
    context: AgentContext
  ): Promise<ToolExecutionResult> {
    const { title, description = '', threshold = 0.75, limit = 5, excludeTaskId } = args
    const targetProjectId = context.targetProjectId

    if (!targetProjectId) {
      return {
        output: 'Không tìm thấy ID dự án (projectId) trong ngữ cảnh để kiểm tra trùng lặp.',
        status: 'ERROR',
        summary: 'Thiếu projectId'
      }
    }

    if (!title || title.trim().length < 3) {
      return {
        output: 'Vui lòng cung cấp tiêu đề công việc có ít nhất 3 ký tự.',
        status: 'ERROR',
        summary: 'Tiêu đề quá ngắn'
      }
    }

    try {
      // 1. Tạo vector embedding từ tiêu đề và mô tả
      const textToEmbed = `${title.trim()}\n${description.trim()}`
      const queryVector = await this.openRouterService.createEmbedding(textToEmbed)
      const vectorStr = `[${queryVector.join(',')}]`

      // 2. Truy vấn cosine distance trong pgvector
      const rawMatches = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id, "taskId", content,
                round(cast(1 - (embedding <=> $1::vector) as numeric), 4) AS similarity
         FROM task_document_embeddings
         WHERE "projectId" = $2
           AND ($3::text IS NULL OR "taskId" != $3)
           AND (1 - (embedding <=> $1::vector)) >= $4
         ORDER BY embedding <=> $1::vector
         LIMIT $5`,
        vectorStr,
        targetProjectId,
        excludeTaskId || null,
        Math.max(0.5, threshold),
        limit
      )

      if (!rawMatches || rawMatches.length === 0) {
        return {
          output: `✅ **An toàn (Không phát hiện trùng lặp):** Không có công việc nào trong dự án có độ tương đồng ngữ nghĩa vượt quá ngưỡng ${(threshold * 100).toFixed(0)}% so với "${title}". Bạn có thể tự tin tạo mới công việc này.`,
          status: 'SUCCESS',
          summary: `Không phát hiện trùng lặp cho "${title}" (< ${(threshold * 100).toFixed(0)}%)`
        }
      }

      // 3. Lấy thông tin chi tiết các task trùng khớp từ cơ sở dữ liệu
      const taskIds = rawMatches.map((r) => r.taskId).filter(Boolean) as string[]
      const tasks = await this.prisma.task.findMany({
        where: { id: { in: taskIds }, deletedAt: null },
        include: {
          sprint: { select: { id: true, name: true, status: true } },
          boardColumn: { select: { id: true, title: true, isDone: true } },
          assignees: { include: { user: { select: { displayName: true } } } }
        }
      })

      const taskMap = new Map(tasks.map((t) => [t.id, t]))

      // 4. Đánh giá mức độ rủi ro trùng lặp
      const duplicates: DuplicateTaskItem[] = []
      let criticalCount = 0

      for (const m of rawMatches) {
        const t = taskMap.get(m.taskId)
        if (!t) continue

        const sim = parseFloat(m.similarity) || 0
        const simPercent = Math.round(sim * 100)

        let riskLevel: DuplicateRiskLevel = 'MODERATE_SIMILARITY'
        if (sim >= 0.85) {
          riskLevel = 'CRITICAL_DUPLICATE'
          criticalCount++
        } else if (sim >= 0.75) {
          riskLevel = 'HIGH_OVERLAP'
        }

        duplicates.push({
          taskId: t.id,
          title: t.title,
          similarityScore: sim,
          similarityPercent: simPercent,
          riskLevel,
          sprintName: t.sprint?.name || 'Backlog',
          columnName: t.boardColumn?.title || 'Chưa định',
          isDone: Boolean(t.boardColumn?.isDone),
          storyPoint: t.storyPoint || 0,
          priority: t.priority || 'MEDIUM',
          assignees: t.assignees.map((a) => a.user.displayName),
          snippet: m.content ? m.content.slice(0, 180) + '...' : ''
        })
      }

      if (duplicates.length === 0) {
        return {
          output: `✅ **Không có task trùng lặp hoạt động:** Các bản ghi tương đồng trước đây đều đã bị xóa.`,
          status: 'SUCCESS',
          summary: 'Không có task trùng lặp hoạt động'
        }
      }

      // 5. Định dạng Markdown báo cáo trực quan
      let md = `### 🛡️ Báo Cáo Kiểm Tra Chống Trùng Lặp (Duplicate Guard)\n\n`
      md += `* **Công việc kiểm tra:** **"${title}"**\n`
      md += `* **Ngưỡng nhạy cảm thiết lập:** ${(threshold * 100).toFixed(0)}%\n`
      md += `* **Số lượng công việc tương đồng phát hiện:** **${duplicates.length} task**\n\n`

      if (criticalCount > 0) {
        md += `> 🚨 **CẢNH BÁO ĐỎ (CRITICAL DUPLICATE):** Phát hiện ${criticalCount} công việc có độ tương đồng $\\ge 85\\%$ với công việc bạn định tạo! Rất có thể công việc này đã tồn tại trong Sprint hoặc Backlog. Vui lòng kiểm tra lại trước khi tạo mới để tránh lãng phí nỗ lực.\n\n`
      } else {
        md += `> ⚠️ **LƯU Ý:** Phát hiện các công việc có phạm vi tương tự (${duplicates[0].similarityPercent}%). Cân nhắc gộp yêu cầu hoặc liên kết phụ thuộc thay vì tạo mới.\n\n`
      }

      md += `| Mức độ | Task tương đồng hiện có | Độ khớp | Sprint | Cột Kanban | Trạng thái | Phụ trách |\n`
      md += `| :---: | :--- | :---: | :---: | :---: | :---: | :--- |\n`

      duplicates.forEach((d) => {
        const badge =
          d.riskLevel === 'CRITICAL_DUPLICATE'
            ? '🔴 **TRÙNG LẶP CAO**'
            : d.riskLevel === 'HIGH_OVERLAP'
              ? '🟠 **GẦN TƯƠNG ĐỒNG**'
              : '🟡 **LIÊN QUAN**'

        const statusBadge = d.isDone ? '🟢 Đã xong' : '🔵 Đang làm'
        const assignees = d.assignees.length > 0 ? d.assignees.join(', ') : '_Chưa gán_'

        md += `| ${badge} | **${d.title}**<br>\`ID: ${d.taskId}\` | **${d.similarityPercent}%** | ${d.sprintName} | \`${d.columnName}\` | ${statusBadge} | ${assignees} |\n`
      })

      const payload = {
        checkedTitle: title,
        threshold,
        totalFound: duplicates.length,
        hasCriticalDuplicate: criticalCount > 0,
        duplicates
      }

      return {
        output: `${md}\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        status: 'SUCCESS',
        summary: `Duplicate Guard: Phát hiện ${duplicates.length} task tương đồng (Cao nhất: ${duplicates[0]?.similarityPercent || 0}%)${criticalCount > 0 ? ' [CẢNH BÁO ĐỎ]' : ''}`
      }
    } catch (err: any) {
      this.logger.error(`FindDuplicateTasksTool error: ${err?.message}`, err?.stack)
      return {
        output: `Lỗi khi kiểm tra trùng lặp công việc: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Lỗi kiểm tra trùng lặp'
      }
    }
  }
}
