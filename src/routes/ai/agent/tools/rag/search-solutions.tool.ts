import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { OpenRouterService } from '~/shared/services/openrouter.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

export interface TaskSolutionItem {
  taskId: string
  title: string
  similarityPercent: number
  isDone: boolean
  sprintName: string
  columnName: string
  solvedBy: string[]
  resolutionSummary: string
  relevantComments: string[]
}

@Injectable()
export class SearchTaskSolutionsTool implements IAgentTool {
  private readonly logger = new Logger(SearchTaskSolutionsTool.name)

  readonly name = 'searchTaskSolutions'
  readonly description =
    'Kho Tri Thức Giải Pháp Kỹ Thuật (Solution & Knowledge Base): Tìm kiếm ngữ nghĩa trong các công việc đã hoàn thành (Done), ' +
    'kho thảo luận kỹ thuật (Task Comments) và tài liệu giải pháp trước đây của dự án để gợi ý cách giải quyết bài toán, ' +
    'hướng dẫn xử lý bug tương tự, hoặc các mẫu thiết kế kiến trúc đã áp dụng thành công.'

  readonly category: ToolCategory = 'RAG'
  readonly riskLevel: ToolRiskLevel = 'READ'
  readonly level: ToolActionLevel = 'READ'

  readonly parameters = {
    type: 'object',
    properties: {
      problemDescription: {
        type: 'string',
        description: 'Mô tả vấn đề kỹ thuật, thông báo lỗi (error stacktrace) hoặc yêu cầu tính năng cần tìm giải pháp tương tự (bắt buộc)'
      },
      limit: {
        type: 'number',
        description: 'Số lượng giải pháp đề xuất tối đa trả về (mặc định: 4)'
      }
    },
    required: ['problemDescription']
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
      problemDescription: string
      limit?: number
    },
    context: AgentContext
  ): Promise<ToolExecutionResult> {
    const { problemDescription, limit = 4 } = args
    const targetProjectId = context.targetProjectId

    if (!targetProjectId) {
      return {
        output: 'Không tìm thấy ID dự án (projectId) để tra cứu giải pháp kỹ thuật.',
        status: 'ERROR',
        summary: 'Thiếu projectId'
      }
    }

    if (!problemDescription || problemDescription.trim().length < 4) {
      return {
        output: 'Vui lòng mô tả vấn đề hoặc lỗi kỹ thuật chi tiết hơn (tối thiểu 4 ký tự).',
        status: 'ERROR',
        summary: 'Mô tả vấn đề quá ngắn'
      }
    }

    try {
      // 1. Tạo vector embedding từ mô tả vấn đề
      const queryVector = await this.openRouterService.createEmbedding(problemDescription.trim())
      const vectorStr = `[${queryVector.join(',')}]`

      // 2. Tìm kiếm trong task_document_embeddings với pgvector
      const rawMatches = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id, "taskId", content,
                round(cast(1 - (embedding <=> $1::vector) as numeric), 4) AS similarity
         FROM task_document_embeddings
         WHERE "projectId" = $2
           AND (1 - (embedding <=> $1::vector)) >= 0.25
         ORDER BY embedding <=> $1::vector
         LIMIT $3`,
        vectorStr,
        targetProjectId,
        limit * 2 // Lấy dư để lọc ưu tiên task đã Done
      )

      if (!rawMatches || rawMatches.length === 0) {
        return {
          output: `ℹ️ **Không tìm thấy giải pháp tương tự:** Chưa có công việc hoặc cuộc thảo luận nào trong dự án có nội dung kỹ thuật tương đồng với vấn đề "${problemDescription}". Hãy tham khảo tài liệu kỹ thuật hoặc hỏi Tech Lead.`,
          status: 'SUCCESS',
          summary: `Không tìm thấy giải pháp cho "${problemDescription.slice(0, 40)}..."`
        }
      }

      // 3. Truy vấn chi tiết task cùng comments và cột
      const taskIds = rawMatches.map((r) => r.taskId).filter(Boolean) as string[]
      const tasks = await this.prisma.task.findMany({
        where: { id: { in: taskIds }, deletedAt: null },
        include: {
          sprint: { select: { name: true, status: true } },
          boardColumn: { select: { title: true, isDone: true } },
          assignees: { include: { user: { select: { displayName: true } } } },
          comments: {
            where: { deletedAt: null },
            include: { member: { select: { displayName: true } } },
            orderBy: { createdAt: 'desc' },
            take: 5
          }
        }
      })

      const taskMap = new Map(tasks.map((t) => [t.id, t]))

      // 4. Trích xuất và định dạng danh sách giải pháp (Ưu tiên task đã Done)
      const solutions: TaskSolutionItem[] = []

      for (const m of rawMatches) {
        const t = taskMap.get(m.taskId)
        if (!t) continue

        const sim = parseFloat(m.similarity) || 0
        const simPercent = Math.round(sim * 100)

        // Trích xuất các comment có giá trị giải pháp (chứa fix, resolve, error, api, patch, v.v.)
        const relevantComments = t.comments.map(
          (c) => `${c.memberDisplayName || c.member?.displayName || 'Thành viên'}: "${c.content.trim()}"`
        )

        let resolutionSummary = t.description ? t.description.slice(0, 300) : 'Không có mô tả chi tiết.'
        if (t.description && t.description.length > 300) {
          resolutionSummary += '...'
        }

        solutions.push({
          taskId: t.id,
          title: t.title,
          similarityPercent: simPercent,
          isDone: Boolean(t.boardColumn?.isDone),
          sprintName: t.sprint?.name || 'Backlog',
          columnName: t.boardColumn?.title || 'Chưa định',
          solvedBy: t.assignees.map((a) => a.user.displayName),
          resolutionSummary,
          relevantComments
        })
      }

      // Sắp xếp ưu tiên: Task đã Done lên trước, sau đó theo độ tương đồng similarityPercent
      solutions.sort((a, b) => {
        if (a.isDone && !b.isDone) return -1
        if (!a.isDone && b.isDone) return 1
        return b.similarityPercent - a.similarityPercent
      })

      const topSolutions = solutions.slice(0, limit)

      // 5. Định dạng Markdown trực quan
      let md = `### 💡 Gợi Ý Giải Pháp & Kinh Nghiệm Kỹ Thuật (Knowledge Base)\n\n`
      md += `* **Bài toán tra cứu:** "${problemDescription}"\n`
      md += `* **Số giải pháp phù hợp tìm thấy:** **${topSolutions.length} bài học kinh nghiệm**\n\n`

      topSolutions.forEach((sol, idx) => {
        const statusBadge = sol.isDone ? '🟢 **Đã Giải Quyết (Done)**' : '🔵 Đang Thực Hiện'
        const solvedByStr = sol.solvedBy.length > 0 ? sol.solvedBy.join(', ') : 'Chưa gán'

        md += `#### ${idx + 1}. [${sol.title}] (${statusBadge} · Độ khớp: **${sol.similarityPercent}%**)\n`
        md += `* **Sprint:** ${sol.sprintName} · **Cột:** \`${sol.columnName}\` · **Người phụ trách:** ${solvedByStr}\n`
        md += `* **Mô tả & Hướng dẫn kỹ thuật:**\n`
        md += `  > ${sol.resolutionSummary.replace(/\n/g, '\n  > ')}\n`

        if (sol.relevantComments.length > 0) {
          md += `* **Trao đổi / Ghi chú từ thành viên:**\n`
          sol.relevantComments.forEach((c) => {
            md += `  * 💬 ${c}\n`
          })
        }
        md += `\n`
      })

      const payload = {
        problemDescription,
        foundSolutionsCount: topSolutions.length,
        solutions: topSolutions
      }

      return {
        output: `${md}\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        status: 'SUCCESS',
        summary: `Đã tìm thấy ${topSolutions.length} giải pháp tương đồng cho "${problemDescription.slice(0, 35)}..." (Độ khớp cao nhất: ${topSolutions[0]?.similarityPercent || 0}%)`
      }
    } catch (err: any) {
      this.logger.error(`SearchTaskSolutionsTool error: ${err?.message}`, err?.stack)
      return {
        output: `Lỗi khi tìm kiếm giải pháp kỹ thuật: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Lỗi tìm kiếm giải pháp'
      }
    }
  }
}
