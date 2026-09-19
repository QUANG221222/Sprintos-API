import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { OpenRouterService } from '~/shared/services/openrouter.service'
import {
  AgentChatMessage,
  AgentChatResponse,
  AgentStreamEvent,
  ToolExecutionDetail
} from './agent.types'
import { ContextBuilder } from './context/context.builder'
import { ToolRegistry } from './tools/tool.registry'
import { ToolInputValidator } from './validators/tool-input.validator'
import { buildFinalSystemInstruction, buildSystemInstruction } from './prompts/system.prompt'

export * from './agent.types'

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name)

  constructor(
    private readonly openRouterService: OpenRouterService,
    private readonly contextBuilder: ContextBuilder,
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
   * Định dạng tin nhắn gửi tới LLM, hỗ trợ Đa phương thức (Multimodal Vision)
   */
  private formatOpenAiMessages(
    messages: AgentChatMessage[]
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map((m) => {
      if (m.images && m.images.length > 0 && m.role === 'user') {
        const textContent = m.content?.trim() || 'Hãy quan sát và phân tích chi tiết hình ảnh này.'
        return {
          role: 'user',
          content: [
            { type: 'text', text: textContent },
            ...m.images.map((img) => ({
              type: 'image_url' as const,
              image_url: {
                url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`
              }
            }))
          ]
        }
      }
      return {
        role: m.role,
        content: m.content
      }
    })
  }

  /**
   * Vòng lặp Agent Dispatcher: Tiếp nhận câu hỏi -> Quyết định gọi Tool -> Thực thi Tool -> Trả lời
   */
  async chat(
    messages: AgentChatMessage[],
    projectId: string,
    sprintId?: string
  ): Promise<AgentChatResponse> {
    const context = await this.contextBuilder.resolveContext(projectId, sprintId)
    const tools = this.toolRegistry.getOpenAiTools()
    const toolsUsed: ToolExecutionDetail[] = []

    const systemInstruction = buildSystemInstruction(context)
    const openAiMessages = this.formatOpenAiMessages(messages)

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
          const fnArgs = ToolInputValidator.parseArguments((toolCall as any).function?.arguments)

          const toolStartTime = Date.now()
          const result = await this.toolRegistry.executeTool(fnName, fnArgs, context)
          const durationMs = Date.now() - toolStartTime

          toolsUsed.push({
            name: fnName,
            args: fnArgs,
            summary: result.summary,
            status: result.status,
            durationMs,
            outputSnippet:
              result.output.length > 350 ? result.output.slice(0, 350) + '...' : result.output
          })

          // Đẩy kết quả Tool vào messages
          openAiMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result.output
          } as any)
        }

        // 2. Lần gọi thứ hai: LLM tổng hợp câu trả lời cuối cùng từ dữ liệu Tool
        const finalSystemInstruction = buildFinalSystemInstruction(systemInstruction)

        const finalCall = await this.openRouterService.chatWithTools(
          openAiMessages,
          [],
          finalSystemInstruction
        )

        const { reply: finalReply, thinking: finalThinking } = this.extractThinkingAndCleanReply(
          finalCall.message?.content || '',
          finalCall.message
        )

        const initialThinking =
          (firstCall.message as any)?.reasoning || (firstCall.message as any)?.reasoning_content
        const combinedThinking = finalThinking || initialThinking

        return {
          reply: finalReply || 'Tôi đã tra cứu được dữ liệu liên quan từ dự án và hoàn tất xử lý.',
          thinking: combinedThinking,
          toolsUsed
        }
      }

      // Không gọi tool, trả về câu trả lời trực tiếp
      const { reply: directReply, thinking: directThinking } = this.extractThinkingAndCleanReply(
        firstCall.message?.content || 'Xin chào! Tôi có thể giúp gì cho bạn hôm nay?',
        firstCall.message
      )

      return {
        reply: directReply,
        thinking: directThinking,
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

  /**
   * Vòng lặp Agent Dispatcher Streaming: Gửi SSE events theo thời gian thực
   */
  async chatStream(
    messages: AgentChatMessage[],
    projectId: string,
    sprintId: string | undefined,
    sendEvent: (event: AgentStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<void> {
    if (signal?.aborted) return

    sendEvent({
      type: 'status',
      data: { stage: 'RESOLVING_CONTEXT', message: 'Đang xác định ngữ cảnh dự án...' }
    })

    const context = await this.contextBuilder.resolveContext(projectId, sprintId)
    const tools = this.toolRegistry.getOpenAiTools()
    const toolsUsed: ToolExecutionDetail[] = []

    const systemInstruction = buildSystemInstruction(context)
    const openAiMessages = this.formatOpenAiMessages(messages)

    if (signal?.aborted) return

    sendEvent({
      type: 'status',
      data: { stage: 'REASONING', message: 'Đang phân tích câu hỏi...' }
    })

    try {
      let accumulatedReply = ''
      let accumulatedThinking = ''
      let isInsideThinkTag = false
      let detectedToolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] | undefined = undefined
      let rawAssistantMessage: OpenAI.Chat.ChatCompletionMessage | undefined = undefined

      // 1. Single-pass Streaming kèm Tool Inspection: Stream token suy luận & nội dung ngay từ đầu!
      for await (const chunk of this.openRouterService.chatStreamWithTools(
        openAiMessages,
        tools,
        systemInstruction,
        signal
      )) {
        if (signal?.aborted) return

        if (chunk.toolCalls) {
          detectedToolCalls = chunk.toolCalls
          rawAssistantMessage = chunk.rawMessage
        }

        if (chunk.reasoning) {
          accumulatedThinking += chunk.reasoning
          sendEvent({
            type: 'thinking',
            data: { chunk: chunk.reasoning }
          })
        }

        if (chunk.content) {
          let contentToProcess = chunk.content

          // Xử lý stream thẻ <think> nếu model trả về trực tiếp trong content
          if (contentToProcess.includes('<think>')) {
            isInsideThinkTag = true
            contentToProcess = contentToProcess.replace('<think>', '')
          }

          if (isInsideThinkTag) {
            if (contentToProcess.includes('</think>')) {
              const parts = contentToProcess.split('</think>')
              accumulatedThinking += parts[0]
              sendEvent({
                type: 'thinking',
                data: { chunk: parts[0] }
              })
              isInsideThinkTag = false
              contentToProcess = parts[1] || ''
            } else {
              accumulatedThinking += contentToProcess
              sendEvent({
                type: 'thinking',
                data: { chunk: contentToProcess }
              })
              contentToProcess = ''
            }
          }

          if (contentToProcess && !isInsideThinkTag) {
            // Loại trừ xml tag <tool_call> nếu model sinh raw tag
            if (!contentToProcess.includes('<tool_call>') && !contentToProcess.includes('</tool_call>')) {
              accumulatedReply += contentToProcess
              sendEvent({
                type: 'text',
                data: { chunk: contentToProcess }
              })
            }
          }
        }
      }

      if (signal?.aborted) return

      // 2. Kiểm tra xem model có yêu cầu gọi Tool nào không
      if (detectedToolCalls && detectedToolCalls.length > 0) {
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
            data: { stage: 'EXECUTING_TOOL', message: `Đang chạy công cụ ${fnName}...` }
          })

          const toolStartTime = Date.now()
          const result = await this.toolRegistry.executeTool(fnName, fnArgs, context)
          const durationMs = Date.now() - toolStartTime

          const detail: ToolExecutionDetail = {
            name: fnName,
            args: fnArgs,
            summary: result.summary,
            status: result.status,
            durationMs,
            outputSnippet:
              result.output.length > 350 ? result.output.slice(0, 350) + '...' : result.output
          }
          toolsUsed.push(detail)

          sendEvent({
            type: 'tool_end',
            data: detail
          })

          openAiMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result.output
          } as any)
        }

        if (signal?.aborted) return

        // Lần gọi thứ 2: Stream câu trả lời tổng hợp sau khi đã có dữ liệu Tool
        const finalSystemInstruction = buildFinalSystemInstruction(systemInstruction)
        sendEvent({
          type: 'status',
          data: { stage: 'SYNTHESIZING', message: 'Đang tổng hợp câu trả lời...' }
        })

        let synthesizedReply = ''
        let synthesizedThinking = ''
        let synthInsideThink = false

        for await (const chunk of this.openRouterService.chatStream(
          openAiMessages,
          finalSystemInstruction,
          signal
        )) {
          if (signal?.aborted) return

          if (chunk.reasoning) {
            synthesizedThinking += chunk.reasoning
            sendEvent({
              type: 'thinking',
              data: { chunk: chunk.reasoning }
            })
          }

          if (chunk.content) {
            let contentToProcess = chunk.content
            if (contentToProcess.includes('<think>')) {
              synthInsideThink = true
              contentToProcess = contentToProcess.replace('<think>', '')
            }

            if (synthInsideThink) {
              if (contentToProcess.includes('</think>')) {
                const parts = contentToProcess.split('</think>')
                synthesizedThinking += parts[0]
                sendEvent({
                  type: 'thinking',
                  data: { chunk: parts[0] }
                })
                synthInsideThink = false
                contentToProcess = parts[1] || ''
              } else {
                synthesizedThinking += contentToProcess
                sendEvent({
                  type: 'thinking',
                  data: { chunk: contentToProcess }
                })
                contentToProcess = ''
              }
            }

            if (contentToProcess && !synthInsideThink) {
              synthesizedReply += contentToProcess
              sendEvent({
                type: 'text',
                data: { chunk: contentToProcess }
              })
            }
          }
        }

        if (signal?.aborted) return

        const combinedThinking = (accumulatedThinking + '\n' + synthesizedThinking).trim()

        sendEvent({
          type: 'done',
          data: {
            reply: synthesizedReply.trim() || 'Tôi đã xử lý xong yêu cầu từ dự án.',
            thinking: combinedThinking || undefined,
            toolsUsed
          }
        })
        return
      }

      // Không gọi tool: Đã stream trực tiếp toàn bộ token ở pass 1, gửi done ngay lập tức!
      sendEvent({
        type: 'done',
        data: {
          reply: accumulatedReply.trim() || 'Tôi đã xử lý xong yêu cầu.',
          thinking: accumulatedThinking.trim() || undefined,
          toolsUsed: []
        }
      })
    } catch (err: any) {
      if (signal?.aborted || err?.name === 'AbortError' || err?.message?.includes('aborted')) {
        this.logger.log('🛑 chatStream đã dừng theo yêu cầu của client.')
        return
      }
      this.logger.error('Lỗi trong chatStream:', err)
      sendEvent({
        type: 'error',
        data: {
          message: `Gián đoạn khi xử lý luồng AI: ${err?.message || err}. Vui lòng thử lại.`
        }
      })
    }
  }
}

