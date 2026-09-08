import { Injectable, Logger } from '@nestjs/common'
import { OpenRouterService } from '~/shared/services/openrouter.service'
import { ReportService } from '~/routes/report/report.service'
import { EmbeddingService } from '../embedding/embedding.service'
import { PrismaService } from '~/shared/services/prisma.service'
import OpenAI from 'openai'

export interface AgentChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AgentChatResponse {
  reply: string
  toolsUsed: Array<{ name: string; args: any; summary?: string }>
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name)

  constructor(
    private readonly openRouterService: OpenRouterService,
    private readonly reportService: ReportService,
    private readonly embeddingService: EmbeddingService,
    private readonly prisma: PrismaService
  ) {}

  /**
   * Định nghĩa các Tools hỗ trợ Function Calling
   */
  private getAvailableTools(): OpenAI.Chat.ChatCompletionTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'getSprintSummary',
          description:
            'Lấy thông tin tổng quan tiến độ của Sprint: số lượng task hoàn thành, tổng Story Points, tỷ lệ % hoàn thành và phân bổ theo các cột Kanban.',
          parameters: {
            type: 'object',
            properties: {
              sprintId: { type: 'string', description: 'ID của Sprint cần xem tiến độ' }
            },
            required: ['sprintId']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'getCriticalPathReport',
          description:
            'Lấy báo cáo Đường găng CPM (Critical Path Method) của Sprint: độ dài đường găng, các task găng có float = 0 có nguy cơ làm trễ dự án, và các quan hệ phụ thuộc.',
          parameters: {
            type: 'object',
            properties: {
              sprintId: { type: 'string', description: 'ID của Sprint cần tra cứu đường găng' }
            },
            required: ['sprintId']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'searchProjectKnowledge',
          description:
            'Tìm kiếm ngữ nghĩa (RAG Vector Search) trong cơ sở tri thức của dự án: tìm tasks, tiêu chí nghiệm thu, mô tả kỹ thuật hoặc tài liệu liên quan đến câu hỏi.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Từ khóa hoặc câu hỏi tìm kiếm ngữ nghĩa' }
            },
            required: ['query']
          }
        }
      }
    ]
  }

  /**
   * Vòng lặp Agent Dispatcher: Tiếp nhận câu hỏi -> Quyết định gọi Tool -> Thực thi Tool -> Trả lời
   */
  async chat(
    messages: AgentChatMessage[],
    projectId: string,
    sprintId?: string
  ): Promise<AgentChatResponse> {
    const tools = this.getAvailableTools()
    const toolsUsed: Array<{ name: string; args: any; summary?: string }> = []

    // Tự động nhận diện Project ID nếu frontend không truyền hoặc truyền 'default'
    let targetProjectId = projectId
    if (!targetProjectId || targetProjectId === 'default') {
      const recentProject = await this.prisma.project.findFirst({
        orderBy: { updatedAt: 'desc' },
        select: { id: true, name: true }
      })
      if (recentProject) {
        targetProjectId = recentProject.id
      }
    }

    // Nếu không có sprintId truyền lên, thử tìm Active Sprint của Project
    let activeSprintId = sprintId
    if (!activeSprintId && targetProjectId) {
      const activeSprint = await this.prisma.sprint.findFirst({
        where: { projectId: targetProjectId, status: 'ACTIVE' },
        select: { id: true, name: true }
      })
      if (activeSprint) {
        activeSprintId = activeSprint.id
      }
    }

    const systemInstruction = `
Bạn là Sprintos AI Copilot - Trợ lý điều phối dự án thông minh và Senior Scrum Master kiêm Agile Coach hàng đầu trong nền tảng Sprintos.
Bối cảnh hiện tại:
- Project ID: ${targetProjectId || 'Chưa xác định'}
- Sprint ID hiện tại: ${activeSprintId || 'Chưa có Sprint kích hoạt'}

Nhiệm vụ của bạn:
1. Hỗ trợ người dùng tra cứu tiến độ, giải đáp thắc mắc về công việc, tài liệu và quy trình Agile.
2. Bạn có các công cụ (Tools) để lấy dữ liệu thực tế từ hệ thống:
   - "getSprintSummary": Gọi khi người dùng hỏi về tiến độ Sprint, số task hoàn thành, tỷ lệ Story Point.
   - "getCriticalPathReport": Gọi khi người dùng hỏi về Đường găng CPM, task nào có nguy cơ trễ hạn, độ dài đường găng, task nào float = 0.
   - "searchProjectKnowledge": Gọi khi người dùng tìm kiếm công việc, hỏi về tính năng, module, người phụ trách, hoặc tài liệu kỹ thuật.
3. Khi người dùng hỏi nội dung liên quan tới các công cụ trên, BẮT BUỘC gọi Tool trước để có dữ liệu chính xác, KHÔNG tự bịa đặt số liệu.
4. Khi nhận kết quả từ "searchProjectKnowledge":
   - Nếu có task tìm thấy, hãy trình bày rõ ràng: Tiêu đề, Trạng thái/Cột, Người phụ trách, Story Points, và Subtasks (nếu có).
   - Nếu tool báo "EMPTY_DATABASE", hãy thông báo ân cần rằng cơ sở dữ liệu vector của dự án chưa được index và nhắc người dùng bấm nút "Sync Knowledge" (nút xoay ở góc trên bên phải thanh chat) để AI học dữ liệu dự án.
   - Nếu tool báo không tìm thấy kết quả phù hợp ("NO_MATCH"), hãy nói rõ không tìm thấy task nào khớp với từ khóa/yêu cầu thay vì đoán mò.
5. Trả lời bằng tiếng Việt chuyên nghiệp, súc tích, định dạng Markdown rõ ràng, có bullet points.
`

    const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content
    }))

    try {
      // 1. Lần gọi đầu tiên để LLM quyết định có dùng Tool không
      const firstCall = await this.openRouterService.chatWithTools(
        openAiMessages,
        tools,
        systemInstruction
      )

      if (firstCall.toolCalls && firstCall.toolCalls.length > 0) {
        // Có Tool được yêu cầu thực thi
        openAiMessages.push(firstCall.message)

        for (const toolCall of firstCall.toolCalls) {
          const fnName = (toolCall as any).function?.name
          let fnArgs: any = {}
          try {
            fnArgs = JSON.parse((toolCall as any).function?.arguments || '{}')
          } catch {
            fnArgs = {}
          }

          this.logger.log(`⚙️ Agent kích hoạt tool: ${fnName} với tham số:`, fnArgs)

          let toolOutput = ''

          if (fnName === 'getSprintSummary') {
            const targetSprintId = fnArgs.sprintId || activeSprintId
            if (targetSprintId) {
              try {
                const sprint = await this.prisma.sprint.findUnique({
                  where: { id: targetSprintId },
                  include: {
                    tasks: { where: { deletedAt: null } },
                    boardColumns: true
                  }
                })

                if (sprint) {
                  const totalTasks = sprint.tasks.length
                  let totalStoryPoints = 0
                  let completedStoryPoints = 0
                  let completedTasks = 0
                  const doneColIds = new Set(sprint.boardColumns.filter((c) => c.isDone).map((c) => c.id))

                  for (const t of sprint.tasks) {
                    totalStoryPoints += t.storyPoint || 0
                    if (doneColIds.has(t.boardColumnId)) {
                      completedTasks += 1
                      completedStoryPoints += t.storyPoint || 0
                    }
                  }

                  const completionRate = totalStoryPoints > 0 ? Math.round((completedStoryPoints / totalStoryPoints) * 100) : 0

                  toolOutput = JSON.stringify({
                    sprintName: sprint.name,
                    totalTasks,
                    completedTasks,
                    completionRate: `${completionRate}%`,
                    totalStoryPoints,
                    completedStoryPoints,
                    columns: sprint.boardColumns.map((c) => ({
                      name: c.title,
                      taskCount: sprint.tasks.filter((t) => t.boardColumnId === c.id).length
                    }))
                  })
                  toolsUsed.push({
                    name: fnName,
                    args: fnArgs,
                    summary: `Đã tra cứu tiến độ Sprint "${sprint.name}" (${completionRate}%)`
                  })
                } else {
                  toolOutput = 'Không tìm thấy thông tin Sprint tương ứng.'
                }
              } catch (e: any) {
                toolOutput = `Lỗi khi lấy tiến độ Sprint: ${e?.message || e}`
              }
            } else {
              toolOutput = 'Không tìm thấy sprintId để tra cứu tiến độ.'
            }
          } else if (fnName === 'getCriticalPathReport') {
            const targetSprintId = fnArgs.sprintId || activeSprintId
            if (targetSprintId) {
              try {
                const network = await this.reportService.getSprintNetworkDiagram(targetSprintId)
                const criticalTasks = network.tasks
                  .filter((t) => t.isCritical)
                  .map((t) => ({
                    id: t.id,
                    title: t.title,
                    duration: t.duration,
                    float: t.float,
                    storyPoint: t.storyPoint
                  }))

                toolOutput = JSON.stringify({
                  criticalPathLengthDays: network.criticalPathLength,
                  totalCriticalTasks: criticalTasks.length,
                  criticalTasks
                })
                toolsUsed.push({
                  name: fnName,
                  args: fnArgs,
                  summary: `Đã phân tích Đường găng CPM (${network.criticalPathLength} ngày, ${criticalTasks.length} tasks găng)`
                })
              } catch (e: any) {
                toolOutput = `Lỗi khi phân tích đường găng: ${e?.message || e}`
              }
            } else {
              toolOutput = 'Không tìm thấy sprintId để phân tích đường găng.'
            }
          } else if (fnName === 'searchProjectKnowledge') {
            const query = fnArgs.query
            if (query && targetProjectId) {
              try {
                const searchResults = await this.embeddingService.semanticSearch(targetProjectId, query, 5)

                if (searchResults.length === 0) {
                  // Kiểm tra xem project đã có vector nào được lưu chưa
                  const countRes = await this.prisma.$queryRawUnsafe<any[]>(
                    `SELECT count(*)::int as count FROM task_document_embeddings WHERE "projectId" = $1`,
                    targetProjectId
                  )
                  const totalIndexed = countRes?.[0]?.count || 0

                  if (totalIndexed === 0) {
                    toolOutput = JSON.stringify({
                      found: 0,
                      reason: 'EMPTY_DATABASE',
                      message:
                        'Cơ sở dữ liệu Vector của dự án này hiện chưa có dữ liệu nào. Hãy hướng dẫn người dùng nhấn nút "Sync Knowledge" (biểu tượng mũi tên xoay tròn ở thanh tiêu đề drawer) để đồng bộ hóa toàn bộ công việc vào AI trước khi tra cứu.'
                    })
                  } else {
                    toolOutput = JSON.stringify({
                      found: 0,
                      reason: 'NO_MATCH',
                      message: `Đã tìm kiếm trong ${totalIndexed} tài liệu/task của dự án nhưng không có mục nào khớp ngữ nghĩa với từ khóa "${query}".`
                    })
                  }
                } else {
                  toolOutput = JSON.stringify({
                    found: searchResults.length,
                    results: searchResults
                  })
                }

                toolsUsed.push({
                  name: fnName,
                  args: fnArgs,
                  summary: `Đã tìm kiếm tri thức ngữ nghĩa: "${query}" (${searchResults.length} kết quả)`
                })
              } catch (e: any) {
                toolOutput = `Lỗi khi tìm kiếm ngữ nghĩa: ${e?.message || e}`
              }
            } else {
              toolOutput = 'Thiếu query hoặc không xác định được Project ID để tìm kiếm.'
            }
          }

          // Đẩy kết quả Tool vào messages
          openAiMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolOutput
          } as any)
        }

        // 2. Lần gọi thứ hai: LLM tổng hợp câu trả lời cuối cùng từ dữ liệu Tool
        const finalCall = await this.openRouterService.chatWithTools(
          openAiMessages,
          [],
          systemInstruction
        )

        return {
          reply: finalCall.message?.content || 'Tôi đã xử lý xong yêu cầu của bạn.',
          toolsUsed
        }
      }

      // Không gọi tool, trả về câu trả lời trực tiếp
      return {
        reply: firstCall.message?.content || 'Xin chào! Tôi có thể giúp gì cho bạn hôm nay?',
        toolsUsed: []
      }
    } catch (err: any) {
      this.logger.error('Lỗi trong Agent Dispatcher:', err)
      return {
        reply: `Xin lỗi, hệ thống gặp gián đoạn khi xử lý yêu cầu: ${err?.message || err}. Vui lòng thử lại.`,
        toolsUsed: []
      }
    }
  }
}
