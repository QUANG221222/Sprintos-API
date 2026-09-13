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
2. Đóng vai trò là Senior Tech Lead & Agile Consultant: Sẵn sàng giải đáp mọi câu hỏi ngoài luồng về kỹ thuật lập trình (NestJS, Next.js, TypeScript, PostgreSQL, Docker, Git...), kiến trúc phần mềm, viết code mẫu, giải thuật, hoặc các câu hỏi kiến thức chung một cách thông minh và chuyên sâu.
3. Bạn có các công cụ (Tools) để lấy dữ liệu thực tế từ hệ thống:
   - "getSprintSummary": Gọi khi người dùng hỏi về tiến độ Sprint, số task hoàn thành, tỷ lệ Story Point.
   - "getCriticalPathReport": Gọi khi người dùng hỏi về Đường găng CPM, task nào có nguy cơ trễ hạn, độ dài đường găng, task nào float = 0.
   - "searchProjectKnowledge": Gọi khi người dùng tìm kiếm công việc, hỏi về tính năng, module, người phụ trách, hoặc tài liệu kỹ thuật trong dự án.
4. Cơ chế điều phối thông minh:
   - Khi câu hỏi yêu cầu dữ liệu thực tế của dự án hiện tại (tiến độ, task, đường găng): BẮT BUỘC gọi Tool trước để lấy số liệu chính xác.
   - Khi câu hỏi là câu hỏi kiến thức mở, công nghệ, kỹ thuật code, hoặc trò chuyện thông thường: KHÔNG gọi Tool, hãy trả lời trực tiếp ngay lập tức bằng chuyên môn sâu rộng của bạn, kèm code mẫu (nếu phù hợp).
5. Khi nhận kết quả từ "searchProjectKnowledge":
   - Nếu có task tìm thấy, hãy trình bày dạng bảng hoặc danh sách có cấu trúc rõ ràng: Tiêu đề, Trạng thái/Cột, Người phụ trách, Story Points, và Subtasks (nếu có).
   - Nếu tool báo "EMPTY_DATABASE", hãy thông báo ân cần rằng cơ sở dữ liệu vector của dự án chưa được index và nhắc người dùng bấm nút "Sync Knowledge" (biểu tượng Database ở góc trên bên phải thanh chat) để AI học dữ liệu dự án.
   - Nếu tool báo không tìm thấy kết quả phù hợp ("NO_MATCH"), hãy nói rõ không tìm thấy task nào khớp với từ khóa/yêu cầu thay vì đoán mò.
6. TIÊU CHUẨN ĐỊNH DẠNG DỮ LIỆU & UI HIERARCHY (BẮT BUỘC):
   - Tiêu đề chính dùng ## (Ví dụ: ## Tóm tắt tiến độ Sprint).
   - Các phân nhóm phân định rõ ràng bằng ### kèm biểu tượng trực quan:
     * ### 📊 Bảng tổng hợp chỉ số
     * ### 📋 Phân bổ công việc (Kanban)
     * ### ⚠️ Nhận xét tiến độ & Rủi ro
     * ### 💡 Hành động đề xuất
   - Định dạng bảng (Markdown Table) chuẩn có hàng tiêu đề và phân cách |---|---|:
     * Khi tóm tắt số liệu tiến độ Sprint:
       | Chỉ số | Giá trị | Đánh giá / Trạng thái |
       |:---|:---:|:---|
     * Khi phân tích Đường găng CPM:
       | Mã Task | Tiêu đề | Thời lượng (ngày) | Float (Độ trễ) | Story Points |
       |:---|:---|:---:|:---:|:---:|
     * Khi trả lời kết quả tra cứu ngữ nghĩa RAG:
       | Tên công việc / Tài liệu | Cột / Trạng thái | Người phụ trách | Story Points |
       |:---|:---:|:---:|:---:|
   - Danh sách công việc hoặc khuyến nghị sử dụng bullet points có in đậm đầu dòng:
     * - **Tên cột / Khuyến nghị:** Chi tiết triển khai...
   - Trả lời bằng tiếng Việt chuyên nghiệp, khoa học và súc tích.
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
        const finalSystemInstruction = `${systemInstruction}\n\nLƯU Ý QUAN TRỌNG CHO BƯỚC NÀY:\nToàn bộ dữ liệu thực tế từ các công cụ đã được cung cấp đầy đủ ở trên. Bạn hãy đọc dữ liệu đó và trả lời trực tiếp câu hỏi của người dùng bằng tiếng Việt tự nhiên, chuyên nghiệp. BẮT BUỘC áp dụng đúng cấu trúc UI Hierarchy (##, ###) và định dạng BẢNG Markdown (Markdown Table) chuẩn cho các số liệu thống kê hoặc danh sách task.\nTUYỆT ĐỐI KHÔNG gọi thêm công cụ, KHÔNG sinh bất kỳ thẻ <tool_call> hay mã gọi hàm nào nữa.`

        const finalCall = await this.openRouterService.chatWithTools(
          openAiMessages,
          [],
          finalSystemInstruction
        )

        let reply = finalCall.message?.content || 'Tôi đã xử lý xong yêu cầu của bạn.'
        if (reply.includes('<think>')) {
          reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
        }
        if (reply.includes('<tool_call>')) {
          reply = reply.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim()
        }
        if (!reply) {
          reply = 'Tôi đã tra cứu được dữ liệu liên quan từ dự án nhưng gặp trục trặc khi tổng hợp. Bạn vui lòng thử hỏi lại hoặc bấm nút Đồng bộ Tri thức.'
        }

        return {
          reply,
          toolsUsed
        }
      }

      // Không gọi tool, trả về câu trả lời trực tiếp
      let directReply = firstCall.message?.content || 'Xin chào! Tôi có thể giúp gì cho bạn hôm nay?'
      if (directReply.includes('<think>')) {
        directReply = directReply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
      }
      return {
        reply: directReply,
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
