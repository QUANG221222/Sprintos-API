import { Injectable } from '@nestjs/common'
import OpenAI from 'openai'
import { EmbeddingService } from '~/routes/ai/embedding/embedding.service'
import { PrismaService } from '~/shared/services/prisma.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

@Injectable()
export class RagKnowledgeTool implements IAgentTool {
  readonly name = 'searchProjectKnowledge'
  readonly description =
    'Tìm kiếm ngữ nghĩa (RAG Vector Search) trong cơ sở tri thức của dự án: tìm tasks, tiêu chí nghiệm thu, mô tả kỹ thuật hoặc tài liệu liên quan đến câu hỏi.'
  readonly category: ToolCategory = 'RAG'
  readonly riskLevel: ToolRiskLevel = 'READ'
  readonly level: ToolActionLevel = 'READ'
  readonly parameters = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Từ khóa hoặc câu hỏi tìm kiếm ngữ nghĩa' }
    },
    required: ['query']
  }

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly prisma: PrismaService
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

  async execute(args: { query?: string }, context: AgentContext): Promise<ToolExecutionResult> {
    const query = args.query
    const targetProjectId = context.targetProjectId

    if (!query || !targetProjectId) {
      return {
        output: 'Thiếu query hoặc không xác định được Project ID để tìm kiếm.',
        status: 'ERROR',
        summary: 'Thiếu từ khóa tìm kiếm'
      }
    }

    try {
      const searchResults = await this.embeddingService.semanticSearch(targetProjectId, query, 5)

      if (searchResults.length === 0) {
        const countRes = await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT count(*)::int as count FROM task_document_embeddings WHERE "projectId" = $1`,
          targetProjectId
        )
        const totalIndexed = countRes?.[0]?.count || 0

        if (totalIndexed === 0) {
          const output = JSON.stringify({
            found: 0,
            reason: 'EMPTY_DATABASE',
            message:
              'Cơ sở dữ liệu Vector của dự án này hiện chưa có dữ liệu nào. Hãy hướng dẫn người dùng nhấn nút "Sync Knowledge" (biểu tượng mũi tên xoay tròn ở thanh tiêu đề drawer) để đồng bộ hóa toàn bộ công việc vào AI trước khi tra cứu.'
          })
          return {
            output,
            status: 'SUCCESS',
            summary: 'Chưa đồng bộ tri thức vector (0 tài liệu)'
          }
        }

        const output = JSON.stringify({
          found: 0,
          reason: 'NO_MATCH',
          message: `Đã tìm kiếm trong ${totalIndexed} tài liệu/task của dự án nhưng không có mục nào khớp ngữ nghĩa với từ khóa "${query}".`
        })
        return {
          output,
          status: 'SUCCESS',
          summary: `Tìm kiếm tri thức: Không tìm thấy mục khớp "${query}"`
        }
      }

      const output = JSON.stringify({
        found: searchResults.length,
        results: searchResults
      })
      return {
        output,
        status: 'SUCCESS',
        summary: `Đã tìm kiếm tri thức: "${query}" (${searchResults.length} kết quả)`
      }
    } catch (e: any) {
      return {
        output: `Lỗi khi tìm kiếm ngữ nghĩa: ${e?.message || e}`,
        status: 'ERROR',
        summary: 'Lỗi tìm kiếm ngữ nghĩa RAG'
      }
    }
  }
}
