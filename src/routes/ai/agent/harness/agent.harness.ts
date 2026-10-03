import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { OpenRouterService } from '~/shared/services/openrouter.service'
import { ActionProposal, AgentChatMessage, AgentContext, AgentStreamEvent, ToolExecutionDetail } from '../agent.types'
import { ToolRegistry } from '../tools/tool.registry'
import { ToolInputValidator } from '../validators/tool-input.validator'

import { buildFinalSystemInstruction, buildSystemInstruction } from '../prompts/system.prompt'
import { HarnessOptions, HarnessResult, HarnessStreamCallback } from './harness.types'

const DEFAULT_MAX_ITERATIONS = 3
const DEFAULT_TIMEOUT_MS = 45000

@Injectable()
export class AgentHarness {
  private readonly logger = new Logger(AgentHarness.name)

  constructor(
    private readonly openRouterService: OpenRouterService,
    private readonly toolRegistry: ToolRegistry
  ) {}

  /**
   * Helper bóc tách chuỗi suy luận (thinking/reasoning) và làm sạch câu trả lời
   */
  private extractThinkingAndCleanReply(
    rawContent: string,
    messageObj?: any
  ): { reply: string; thinking?: string } {
    let thinking: string | undefined =
      messageObj?.reasoning || messageObj?.reasoning_content || undefined
    let reply = rawContent || ''

    if (reply.includes('<think>')) {
      const match = reply.match(/<think>([\s\S]*?)<\/think>/i)
      if (match) {
        if (!thinking) {
          thinking = match[1].trim()
        }
        reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
      }
    }

    if (reply.includes('<tool_call>')) {
      reply = reply.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim()
    }

    return { reply, thinking }
  }

  /**
   * Lấy danh sách công cụ khả dụng theo RBAC, màn hình hiện tại và cấu hình webSearchMode
   */
  private getEffectiveTools(context: AgentContext): OpenAI.Chat.ChatCompletionTool[] {
    return this.toolRegistry.getEffectiveToolsForContext(context)
  }

  /**
   * Rút gọn kết quả các tool cũ trong lịch sử nếu > 400 ký tự để tiết kiệm token
   */
  private prunePastToolOutputs(messages: OpenAI.Chat.ChatCompletionMessageParam[]): void {
    for (const msg of messages) {
      if (msg.role === 'tool' && typeof msg.content === 'string' && msg.content.length > 400) {
        msg.content =
          msg.content.slice(0, 400) +
          '\n... [Đã rút gọn dữ liệu chi tiết công cụ để tối ưu hóa bộ nhớ token]'
      }
    }
  }

  /**
   * Chuẩn bị danh sách tin nhắn gửi tới LLM:
   * 1. Sliding Window (K = 8) & Rolling Conversation Summary cho các lượt cũ hơn K
   * 2. Historical Image Pruning: Chỉ giữ base64 hình ảnh cho tin nhắn user mới nhất
   * 3. Hỗ trợ Đa phương thức (Multimodal Vision)
   */
  private prepareConversationMessages(
    messages: AgentChatMessage[]
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const hasImages = messages.some((m) => m.images && m.images.length > 0)
    // Nếu có ảnh: giảm Sliding Window xuống K = 4 để giải phóng token budget cho Vision Encoder
    const K = hasImages ? 4 : 8
    let olderMessages: AgentChatMessage[] = []
    let recentMessages = messages

    if (messages.length > K) {
      olderMessages = messages.slice(0, messages.length - K)
      recentMessages = messages.slice(-K)
    }

    const formattedMessages: OpenAI.Chat.ChatCompletionMessageParam[] = []

    // 1. Rolling Conversation Summary cho các tin nhắn cũ hơn K lượt
    if (olderMessages.length > 0) {
      const summarySnippets = olderMessages.map((m) => {
        const roleLabel = m.role === 'user' ? 'Người dùng' : 'Trợ lý'
        const cleanContent = (m.content || '').replace(/\s+/g, ' ').trim()
        const snippet = cleanContent.length > 80 ? cleanContent.slice(0, 80) + '...' : cleanContent
        return `${roleLabel}: ${snippet}`
      })
      formattedMessages.push({
        role: 'system',
        content: `[Tóm tắt ngữ cảnh trao đổi trước đó (${olderMessages.length} tin nhắn): ${summarySnippets.join(' | ')}]`
      })
    }

    // 2. Historical Image Pruning: Chỉ giữ base64 ảnh cho tin nhắn user mới nhất (tối đa 2 ảnh)
    let latestUserMsgWithImagesIdx = -1
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      if (
        recentMessages[i].role === 'user' &&
        recentMessages[i].images &&
        recentMessages[i].images!.length > 0
      ) {
        latestUserMsgWithImagesIdx = i
        break
      }
    }

    for (let i = 0; i < recentMessages.length; i++) {
      const m = recentMessages[i]
      if (m.role === 'user') {
        if (m.images && m.images.length > 0) {
          if (i === latestUserMsgWithImagesIdx) {
            // Giữ tối đa 2 ảnh mới nhất để bảo vệ bộ nhớ token Ollama
            const activeImages = m.images.slice(-2)
            const textContent =
              m.content?.trim() || 'Hãy quan sát và phân tích chi tiết hình ảnh này.'
            formattedMessages.push({
              role: 'user',
              content: [
                { type: 'text', text: textContent },
                ...activeImages.map((img) => ({
                  type: 'image_url' as const,
                  image_url: {
                    url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`
                  }
                }))
              ]
            })
          } else {
            // Prune ảnh các lượt cũ, thay bằng thông báo ngữ cảnh
            const notice = `\n[Hệ thống: Người dùng đã đính kèm ${m.images.length} ảnh ở lượt hỏi trước]`
            formattedMessages.push({
              role: 'user',
              content: `${m.content || ''}${notice}`
            })
          }
        } else {
          formattedMessages.push({
            role: 'user',
            content: m.content
          })
        }
      } else {
        formattedMessages.push({
          role: m.role as any,
          content: m.content
        })
      }
    }

    return formattedMessages
  }

  /**
   * Vòng lặp Agent Dispatcher an toàn (Non-streaming)
   * Kiểm soát: MAX_ITERATIONS = 3, TIMEOUT = 45s, Tool Error Self-Correction
   */
  async execute(
    messages: AgentChatMessage[],
    context: AgentContext,
    options?: HarnessOptions
  ): Promise<HarnessResult> {
    const maxIterations = options?.maxIterations ?? DEFAULT_MAX_ITERATIONS
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const startTime = Date.now()
    const signal = options?.signal

    const tools = this.getEffectiveTools(context)
    const toolsUsed: ToolExecutionDetail[] = []
    const systemInstruction = buildSystemInstruction(context)

    const openAiMessages = this.prepareConversationMessages(messages)

    let iteration = 0
    let accumulatedThinking = ''
    let finalReply = ''
    let detectedActionProposal: ActionProposal | undefined = undefined
    const allActionProposals: ActionProposal[] = []


    while (iteration < maxIterations) {
      if (signal?.aborted) {
        return {
          reply: 'Yêu cầu đã bị hủy bởi người dùng.',
          toolsUsed,
          iterationsCount: iteration,
          durationMs: Date.now() - startTime,
          status: 'ABORTED'
        }
      }

      if (Date.now() - startTime > timeoutMs) {
        this.logger.warn(`⏱️ AgentHarness timeout sau ${Date.now() - startTime}ms. Dừng vòng lặp.`)
        return {
          reply: finalReply || 'Hệ thống đã đạt giới hạn thời gian xử lý (45s). Vui lòng thử lại với yêu cầu ngắn hơn.',
          thinking: accumulatedThinking || undefined,
          toolsUsed,
          iterationsCount: iteration,
          durationMs: Date.now() - startTime,
          status: 'TIMED_OUT'
        }
      }

      if (iteration > 0) {
        this.prunePastToolOutputs(openAiMessages)
      }

      iteration++
      this.logger.log(`🔄 AgentHarness iteration ${iteration}/${maxIterations}...`)

      const callResponse = await this.openRouterService.chatWithTools(
        openAiMessages,
        tools,
        systemInstruction
      )

      const { reply, thinking } = this.extractThinkingAndCleanReply(
        callResponse.message?.content || '',
        callResponse.message
      )
      if (thinking) {
        accumulatedThinking = accumulatedThinking ? `${accumulatedThinking}\n${thinking}` : thinking
      }

      // Trường hợp 1: LLM không gọi Tool nào -> Hoàn thành!
      if (!callResponse.toolCalls || callResponse.toolCalls.length === 0) {
        finalReply = reply || 'Tôi đã xử lý xong yêu cầu của bạn.'
        return {
          reply: finalReply,
          thinking: accumulatedThinking || undefined,
          toolsUsed,
          iterationsCount: iteration,
          durationMs: Date.now() - startTime,
          status: 'COMPLETED'
        }
      }

      // Trường hợp 2: LLM yêu cầu gọi Tool
      openAiMessages.push(callResponse.message)

      for (const toolCall of callResponse.toolCalls) {
        if (signal?.aborted) break

        const fnName = (toolCall as any).function?.name
        const fnArgs = ToolInputValidator.parseArguments((toolCall as any).function?.arguments)

        const toolStartTime = Date.now()
        let resultOutput = ''
        let resultSummary = ''
        let status: 'SUCCESS' | 'ERROR' = 'SUCCESS'

        try {
          const result = await this.toolRegistry.executeTool(fnName, fnArgs, context)
          resultOutput = result.output
          resultSummary = result.summary
          status = result.status
          if (result.actionProposal) {
            detectedActionProposal = result.actionProposal
            allActionProposals.push(result.actionProposal)
          }
        } catch (toolErr: any) {
          this.logger.error(`❌ Tool ${fnName} thực thi thất bại:`, toolErr)
          status = 'ERROR'
          resultSummary = `Lỗi thực thi ${fnName}`
          resultOutput = JSON.stringify({
            error: toolErr?.message || 'Tool execution failed',
            hint: 'Vui lòng kiểm tra lại tham số hoặc thông báo cho người dùng.'
          })
        }

        const durationMs = Date.now() - toolStartTime
        toolsUsed.push({
          name: fnName,
          args: fnArgs,
          summary: resultSummary,
          status,
          durationMs,
          outputSnippet:
            resultOutput.length > 350 ? resultOutput.slice(0, 350) + '...' : resultOutput
        })

        // Nạp kết quả Tool (hoặc thông báo lỗi) vào lịch sử ngữ cảnh
        openAiMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: resultOutput
        } as any)
      }

      // Nếu đã đạt ngưỡng tối đa -> Cưỡng chế dừng và tổng hợp câu trả lời cuối cùng
      if (iteration >= maxIterations) {
        this.logger.warn(`⚠️ Đạt ngưỡng tối đa ${maxIterations} vòng lặp. Tổng hợp câu trả lời cuối...`)
        const finalSystemInstruction = buildFinalSystemInstruction(systemInstruction)
        const finalCall = await this.openRouterService.chatWithTools(
          openAiMessages,
          [],
          finalSystemInstruction
        )

        const { reply: synReply, thinking: synThinking } = this.extractThinkingAndCleanReply(
          finalCall.message?.content || '',
          finalCall.message
        )
        if (synThinking) {
          accumulatedThinking = accumulatedThinking ? `${accumulatedThinking}\n${synThinking}` : synThinking
        }

        return {
          reply: synReply || 'Tôi đã thu thập dữ liệu từ các công cụ và hoàn tất tổng hợp.',
          thinking: accumulatedThinking || undefined,
          toolsUsed,
          iterationsCount: iteration,
          durationMs: Date.now() - startTime,
          status: 'MAX_ITERATIONS_REACHED',
          actionProposal: detectedActionProposal || null,
          actionProposals: allActionProposals
        }
      }
    }

    return {
      reply: finalReply || 'Xử lý hoàn tất.',
      thinking: accumulatedThinking || undefined,
      toolsUsed,
      iterationsCount: iteration,
      durationMs: Date.now() - startTime,
      status: 'COMPLETED',
      actionProposal: detectedActionProposal || null,
      actionProposals: allActionProposals
    }
  }

  /**
   * Vòng lặp Agent Dispatcher Streaming an toàn (SSE Event-driven)
   * Kiểm soát: MAX_ITERATIONS = 3, TIMEOUT = 45s, Tool Error Self-Correction, Abort Propagation
   */
  async executeStream(
    messages: AgentChatMessage[],
    context: AgentContext,
    sendEvent: HarnessStreamCallback,
    options?: HarnessOptions
  ): Promise<void> {
    const maxIterations = options?.maxIterations ?? DEFAULT_MAX_ITERATIONS
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const startTime = Date.now()
    const signal = options?.signal

    if (signal?.aborted) return

    sendEvent({
      type: 'status',
      data: { stage: 'RESOLVING_CONTEXT', message: 'Đang chuẩn bị ngữ cảnh và công cụ an toàn...' }
    })

    if (context.webSearchMode === 'always') {
      sendEvent({
        type: 'status',
        data: { stage: 'WEB_SEARCH_ACTIVE', message: 'Chế độ tìm kiếm Web đang BẬT. Ưu tiên tra cứu Internet...' }
      })
    }

    const tools = this.getEffectiveTools(context)
    const toolsUsed: ToolExecutionDetail[] = []
    const systemInstruction = buildSystemInstruction(context)
    const openAiMessages = this.prepareConversationMessages(messages)

    let iteration = 0
    let totalThinking = ''
    let totalReply = ''
    let detectedActionProposal: ActionProposal | undefined = undefined
    const allActionProposals: ActionProposal[] = []


    try {
      while (iteration < maxIterations) {
        if (signal?.aborted) return

        if (Date.now() - startTime > timeoutMs) {
          this.logger.warn(`⏱️ AgentHarness stream timeout sau ${Date.now() - startTime}ms.`)
          sendEvent({
            type: 'done',
            data: {
              reply: totalReply.trim() || 'Hệ thống đã đạt giới hạn thời gian xử lý (45s). Vui lòng thử lại.',
              thinking: totalThinking.trim() || undefined,
              toolsUsed,
              actionProposal: detectedActionProposal || null,
              actionProposals: allActionProposals
            }
          })
          return
        }

        if (iteration > 0) {
          this.prunePastToolOutputs(openAiMessages)
        }

        iteration++
        sendEvent({
          type: 'status',
          data: {
            stage: 'REASONING',
            message: iteration === 1 ? 'Đang phân tích câu hỏi...' : `Đang tổng hợp kết quả (lượt ${iteration})...`
          }
        })

        let currentIterReply = ''
        let currentIterThinking = ''
        let isInsideThinkTag = false
        let detectedToolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] | undefined = undefined
        let rawAssistantMessage: OpenAI.Chat.ChatCompletionMessage | undefined = undefined

        // Stream lượt này
        for await (const chunk of this.openRouterService.chatStreamWithTools(
          openAiMessages,
          tools,
          iteration === 1 ? systemInstruction : buildFinalSystemInstruction(systemInstruction),
          signal
        )) {
          if (signal?.aborted) return

          if (chunk.toolCalls) {
            detectedToolCalls = chunk.toolCalls
            rawAssistantMessage = chunk.rawMessage
          }

          if (chunk.reasoning) {
            currentIterThinking += chunk.reasoning
            sendEvent({
              type: 'thinking',
              data: { chunk: chunk.reasoning }
            })
          }

          if (chunk.content) {
            let contentToProcess = chunk.content

            if (contentToProcess.includes('<think>')) {
              isInsideThinkTag = true
              contentToProcess = contentToProcess.replace('<think>', '')
            }

            if (isInsideThinkTag) {
              if (contentToProcess.includes('</think>')) {
                const parts = contentToProcess.split('</think>')
                currentIterThinking += parts[0]
                sendEvent({
                  type: 'thinking',
                  data: { chunk: parts[0] }
                })
                isInsideThinkTag = false
                contentToProcess = parts[1] || ''
              } else {
                currentIterThinking += contentToProcess
                sendEvent({
                  type: 'thinking',
                  data: { chunk: contentToProcess }
                })
                contentToProcess = ''
              }
            }

            if (contentToProcess && !isInsideThinkTag) {
              if (!contentToProcess.includes('<tool_call>') && !contentToProcess.includes('</tool_call>')) {
                if (
                  iteration > 1 &&
                  !currentIterReply &&
                  totalReply.trim().length > 0 &&
                  !totalReply.endsWith('\n\n')
                ) {
                  const sep = totalReply.endsWith('\n') ? '\n' : '\n\n'
                  totalReply += sep
                  sendEvent({
                    type: 'text',
                    data: { chunk: sep }
                  })
                }
                currentIterReply += contentToProcess
                sendEvent({
                  type: 'text',
                  data: { chunk: contentToProcess }
                })
              }
            }
          }
        }

        if (currentIterThinking) {
          totalThinking = totalThinking ? `${totalThinking}\n${currentIterThinking}` : currentIterThinking
        }
        if (currentIterReply) {
          totalReply += currentIterReply
        }

        if (signal?.aborted) return

        // Trường hợp 1: Không có tool call -> Xong!
        if (!detectedToolCalls || detectedToolCalls.length === 0) {
          sendEvent({
            type: 'done',
            data: {
              reply: totalReply.trim() || 'Tôi đã hoàn tất xử lý yêu cầu của bạn.',
              thinking: totalThinking.trim() || undefined,
              toolsUsed,
              actionProposal: detectedActionProposal || null,
              actionProposals: allActionProposals
            }
          })
          return
        }

        // Trường hợp 2: Có tool call -> Thực thi an toàn
        if (rawAssistantMessage) {
          openAiMessages.push(rawAssistantMessage)
        }

        for (const toolCall of detectedToolCalls) {
          if (signal?.aborted) return

          const fnName = (toolCall as any).function?.name
          const fnArgs = ToolInputValidator.parseArguments((toolCall as any).function?.arguments)

          sendEvent({
            type: 'tool_start',
            data: { name: fnName, args: fnArgs }
          })
          sendEvent({
            type: 'status',
            data: { stage: 'EXECUTING_TOOL', message: `Đang thực thi công cụ: ${fnName}...` }
          })

          const toolStartTime = Date.now()
          let resultOutput = ''
          let resultSummary = ''
          let toolStatus: 'SUCCESS' | 'ERROR' = 'SUCCESS'

          try {
            const result = await this.toolRegistry.executeTool(fnName, fnArgs, context)
            resultOutput = result.output
            resultSummary = result.summary
            toolStatus = result.status
            if (result.actionProposal) {
              detectedActionProposal = result.actionProposal
              allActionProposals.push(result.actionProposal)
              sendEvent({
                type: 'proposal',
                data: result.actionProposal
              })
            }
          } catch (toolErr: any) {
            this.logger.error(`❌ Tool ${fnName} thực thi thất bại:`, toolErr)
            toolStatus = 'ERROR'
            resultSummary = `Lỗi thực thi ${fnName}`
            resultOutput = JSON.stringify({
              error: toolErr?.message || 'Tool execution failed',
              hint: 'Vui lòng điều chỉnh lại tham số hoặc thông báo lại cho người dùng.'
            })
          }

          const durationMs = Date.now() - toolStartTime
          const detail: ToolExecutionDetail = {
            name: fnName,
            args: fnArgs,
            summary: resultSummary,
            status: toolStatus,
            durationMs,
            outputSnippet:
              resultOutput.length > 350 ? resultOutput.slice(0, 350) + '...' : resultOutput
          }
          toolsUsed.push(detail)

          sendEvent({
            type: 'tool_end',
            data: detail
          })

          openAiMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: resultOutput
          } as any)
        }

        // Nếu đã chạm max iterations, không lặp nữa, chuyển sang tổng hợp
        if (iteration >= maxIterations) {
          this.logger.warn(`⚠️ Đạt giới hạn ${maxIterations} vòng lặp trong streaming. Tổng hợp kết quả...`)
          break
        }
      }

      // Tổng hợp kết quả sau khi đã chạy tool mà hết vòng lặp
      if (signal?.aborted) return

      sendEvent({
        type: 'done',
        data: {
          reply: totalReply.trim() || 'Tôi đã xử lý xong yêu cầu từ các công cụ.',
          thinking: totalThinking.trim() || undefined,
          toolsUsed,
          actionProposal: detectedActionProposal || null,
          actionProposals: allActionProposals
        }
      })
    } catch (err: any) {
      if (signal?.aborted || err?.name === 'AbortError' || err?.message?.includes('aborted')) {
        this.logger.log('🛑 AgentHarness stream dừng theo yêu cầu của client.')
        return
      }
      this.logger.error('Lỗi trong AgentHarness executeStream:', err)
      sendEvent({
        type: 'error',
        data: {
          message: `Gián đoạn khi xử lý luồng AI: ${err?.message || err}. Vui lòng thử lại.`
        }
      })
    }
  }
}
