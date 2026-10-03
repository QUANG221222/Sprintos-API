import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import envConfig from '../config'

interface ExecutionTarget {
  name: string
  client: OpenAI
  model: string
}

@Injectable()
export class OpenRouterService {
  private readonly logger = new Logger(OpenRouterService.name)
  private readonly cloudClient: OpenAI
  private readonly localClient: OpenAI | null = null
  private readonly primaryModel: string
  private readonly localBaseURL: string
  private readonly cloudFallbackModels: string[]

  constructor() {
    const cloudApiKey = envConfig.OPENROUTER_API_KEY
    const cloudBaseURL = envConfig.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
    this.primaryModel = envConfig.DEFAULT_AI_MODEL || 'qwen3.5:4b'

    this.localBaseURL = envConfig.LOCAL_AI_BASE_URL
    const localApiKey = envConfig.LOCAL_AI_API_KEY || 'ollama'

    const defaultHeaders: Record<string, string> = {
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Sprintos Agile PM'
    }

    if (envConfig.CF_ACCESS_CLIENT_ID) {
      defaultHeaders['CF-Access-Client-Id'] = envConfig.CF_ACCESS_CLIENT_ID
    }
    if (envConfig.CF_ACCESS_CLIENT_SECRET) {
      defaultHeaders['CF-Access-Client-Secret'] = envConfig.CF_ACCESS_CLIENT_SECRET
    }

    // Khởi tạo Cloud Client (OpenRouter)
    this.cloudClient = new OpenAI({
      apiKey: cloudApiKey,
      baseURL: cloudBaseURL,
      defaultHeaders
    })

    // Khởi tạo Local Client (Ollama Windows / LAN) nếu có cấu hình
    if (this.localBaseURL) {
      this.logger.log(`🤖 Cấu hình AI Local Server: ${this.localBaseURL} (Model: ${this.primaryModel})`)
      this.localClient = new OpenAI({
        apiKey: localApiKey,
        baseURL: this.localBaseURL,
        defaultHeaders
      })
    }

    // Danh sách Cloud Fallback Models khi Local gặp sự cố hoặc offline
    this.cloudFallbackModels = [
      'google/gemini-1.5-flash',
      'meta-llama/llama-3.3-70b-instruct:free',
      'nvidia/nemotron-3.5-lightning:free',
      'google/gemma-4-26b-a4b-it:free',
      'minimax/minimax-m3:free'
    ].filter((v, i, a) => a.indexOf(v) === i)
  }

  /**
   * Sinh danh sách các Targets thực thi theo thứ tự ưu tiên:
   * 1. Local Ollama (nếu có cấu hình)
   * 2. Cloud OpenRouter Models (Fallback dự phòng)
   */
  private getExecutionTargets(): ExecutionTarget[] {
    const targets: ExecutionTarget[] = []

    if (this.localClient && this.localBaseURL) {
      targets.push({
        name: `Local Ollama (${this.primaryModel})`,
        client: this.localClient,
        model: this.primaryModel
      })
    }

    for (const model of this.cloudFallbackModels) {
      targets.push({
        name: `OpenRouter Cloud (${model})`,
        client: this.cloudClient,
        model
      })
    }

    return targets
  }

  /**
   * Helper thực hiện gọi LLM kèm cơ chế tự động Fallback từ Local sang Cloud
   */
  private async executeWithFallback<T>(
    operation: (client: OpenAI, model: string) => Promise<T>,
    operationName = 'AI Completion'
  ): Promise<{ result: T; modelUsed: string }> {
    let lastError: any = null
    const targets = this.getExecutionTargets()

    for (const target of targets) {
      try {
        this.logger.log(`🤖 Đang xử lý ${operationName} qua target: ${target.name}`)
        const result = await operation(target.client, target.model)
        return { result, modelUsed: target.name }
      } catch (err: any) {
        lastError = err
        this.logger.warn(`⚠️ Target ${target.name} thất bại: ${err?.message || err}. Đang thử target tiếp theo...`)
      }
    }

    this.logger.error(`❌ Toàn bộ AI targets đều thất bại:`, lastError)
    throw lastError
  }

  /**
   * 1. Chat / Text Generation
   */
  async chat(prompt: string, systemInstruction?: string): Promise<string> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction })
    }
    messages.push({ role: 'user', content: prompt })

    const { result } = await this.executeWithFallback(async (client, model) => {
      const response = await client.chat.completions.create({
        model,
        messages,
        temperature: 0.7
      })
      return response.choices[0]?.message?.content || ''
    }, 'Chat')

    return result
  }

  /**
   * 2. Chat và ép kiểu JSON Structured Output
   */
  async chatJSON<T>(prompt: string, systemInstruction?: string): Promise<T> {
    const jsonPrompt = `${prompt}\n\nLƯU Ý QUAN TRỌNG: Chỉ trả về duy nhất một chuỗi JSON hợp lệ, bắt đầu bằng { hoặc [ và kết thúc bằng } hoặc ], tuyệt đối không kèm lời giải thích, không kèm markdown \`\`\`json.`

    const raw = await this.chat(jsonPrompt, systemInstruction)
    let clean = raw.trim()

    // Bóc tách JSON nếu bị bọc bởi markdown block
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```json\s*/i, '').replace(/^```\s*/, '')
      clean = clean.replace(/\s*```$/, '')
      clean = clean.trim()
    }

    const firstBrace = clean.indexOf('{')
    const firstBracket = clean.indexOf('[')
    let startIdx = -1

    if (firstBrace !== -1 && firstBracket !== -1) {
      startIdx = Math.min(firstBrace, firstBracket)
    } else if (firstBrace !== -1) {
      startIdx = firstBrace
    } else if (firstBracket !== -1) {
      startIdx = firstBracket
    }

    if (startIdx !== -1) {
      const lastBrace = clean.lastIndexOf('}')
      const lastBracket = clean.lastIndexOf(']')
      const endIdx = Math.max(lastBrace, lastBracket)
      if (endIdx > startIdx) {
        clean = clean.substring(startIdx, endIdx + 1)
      }
    }

    try {
      return JSON.parse(clean) as T
    } catch (parseErr) {
      this.logger.error('Lỗi khi JSON.parse nội dung từ AI:', clean)
      throw parseErr
    }
  }

  /**
   * Alias tương thích ngược cho chatJSON
   */
  async generateJson<T>(prompt: string, systemInstruction?: string): Promise<T> {
    return this.chatJSON<T>(prompt, systemInstruction)
  }

  /**
   * 3. Kiểm tra sức khỏe kết nối AI Providers
   */
  async healthCheck(): Promise<{ ok: boolean; model: string; message: string }> {
    try {
      const { result, modelUsed } = await this.executeWithFallback(async (client, model) => {
        const res = await client.chat.completions.create({
          model,
          messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
          max_tokens: 10
        })
        return res.choices[0]?.message?.content?.trim() || 'No response'
      }, 'HealthCheck')

      return {
        ok: true,
        model: modelUsed,
        message: result
      }
    } catch (err: any) {
      return {
        ok: false,
        model: this.primaryModel,
        message: err?.message || 'Connection failed'
      }
    }
  }

  /**
   * 4. Sinh Vector Embedding (1536 chiều bằng text-embedding-3-small qua OpenRouter Cloud)
   */
  async createEmbedding(text: string): Promise<number[]> {
    try {
      const cleanText = (text || '').replace(/\n+/g, ' ').trim().slice(0, 8000) || 'empty'
      const response = await this.cloudClient.embeddings.create({
        model: 'text-embedding-3-small',
        input: cleanText
      })
      return response.data[0].embedding
    } catch (err: any) {
      this.logger.error('Lỗi khi sinh embedding:', err?.message || err)
      throw err
    }
  }

  /**
   * 4b. Sinh hàng loạt Vector Embeddings theo Batch
   */
  async createEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      if (!texts || texts.length === 0) return []
      const cleanTexts = texts.map((t) => (t || '').replace(/\n+/g, ' ').trim().slice(0, 8000) || 'empty')
      const response = await this.cloudClient.embeddings.create({
        model: 'text-embedding-3-small',
        input: cleanTexts
      })
      return response.data.map((item) => item.embedding)
    } catch (err: any) {
      this.logger.error('Lỗi khi sinh batch embeddings:', err?.message || err)
      throw err
    }
  }

  /**
   * 5. Chat với Function / Tool Calling (Agent Dispatcher)
   * Tự động ưu tiên Local Ollama Windows, fallback sang OpenRouter Cloud nếu lỗi
   */
  async chatWithTools(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    tools: OpenAI.Chat.ChatCompletionTool[],
    systemInstruction?: string
  ): Promise<{
    message: OpenAI.Chat.ChatCompletionMessage
    toolCalls?: OpenAI.Chat.ChatCompletionMessageToolCall[]
  }> {
    const fullMessages: OpenAI.Chat.ChatCompletionMessageParam[] = []
    if (systemInstruction) {
      fullMessages.push({ role: 'system', content: systemInstruction })
    }
    fullMessages.push(...messages)

    const { result } = await this.executeWithFallback(async (client, model) => {
      const response = await client.chat.completions.create({
        model,
        messages: fullMessages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        temperature: 0.5
      })
      return response.choices[0]?.message
    }, 'ChatWithTools')

    return {
      message: result,
      toolCalls: result?.tool_calls
    }
  }

  /**
   * 6. Chat Stream Token-by-Token (Server-Sent Events)
   * Tự động fallback sang Cloud nếu Local stream không khởi tạo được
   */
  async *chatStream(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    systemInstruction?: string,
    signal?: AbortSignal
  ): AsyncIterable<{ content?: string; reasoning?: string }> {
    const fullMessages: OpenAI.Chat.ChatCompletionMessageParam[] = []
    if (systemInstruction) {
      fullMessages.push({ role: 'system', content: systemInstruction })
    }
    fullMessages.push(...messages)

    let streamStarted = false
    const targets = this.getExecutionTargets()

    for (const target of targets) {
      if (signal?.aborted) return
      try {
        this.logger.log(`🤖 Đang stream với target: ${target.name}`)
        const stream = await target.client.chat.completions.create(
          {
            model: target.model,
            messages: fullMessages,
            stream: true,
            temperature: 0.7
          },
          { signal }
        )

        streamStarted = true

        for await (const chunk of stream) {
          if (signal?.aborted) return
          const delta = chunk.choices[0]?.delta
          const content = delta?.content || ''
          const reasoning =
            (delta as any)?.reasoning || (delta as any)?.reasoning_content || ''

          if (content || reasoning) {
            yield { content, reasoning }
          }
        }
        return
      } catch (err: any) {
        if (signal?.aborted || err?.name === 'AbortError' || err?.message?.includes('aborted')) {
          this.logger.log(`🛑 Client đã ngắt kết nối stream (${target.name}).`)
          return
        }
        if (streamStarted) {
          this.logger.error(`❌ Stream bị đứt gãy giữa chừng từ target ${target.name}:`, err)
          throw err
        }
        this.logger.warn(
          `⚠️ Target ${target.name} không thể khởi tạo stream: ${err?.message || err}. Đang thử target tiếp theo...`
        )
      }
    }

    if (!signal?.aborted) {
      throw new Error('Toàn bộ targets stream đều thất bại.')
    }
  }

  /**
   * 7. Chat Stream kèm Tool Calling (Single-pass Streaming with Function Inspection)
   * Tự động fallback sang Cloud nếu Local stream không khởi tạo được
   */
  async *chatStreamWithTools(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    tools: OpenAI.Chat.ChatCompletionTool[] = [],
    systemInstruction?: string,
    signal?: AbortSignal
  ): AsyncIterable<{
    content?: string
    reasoning?: string
    toolCalls?: OpenAI.Chat.ChatCompletionMessageToolCall[]
    rawMessage?: OpenAI.Chat.ChatCompletionMessage
  }> {
    const fullMessages: OpenAI.Chat.ChatCompletionMessageParam[] = []
    if (systemInstruction) {
      fullMessages.push({ role: 'system', content: systemInstruction })
    }
    fullMessages.push(...messages)

    let streamStarted = false
    const targets = this.getExecutionTargets()

    for (const target of targets) {
      if (signal?.aborted) return
      try {
        this.logger.log(`🤖 Đang stream with tools qua target: ${target.name}`)
        const stream = await target.client.chat.completions.create(
          {
            model: target.model,
            messages: fullMessages,
            tools: tools.length > 0 ? tools : undefined,
            tool_choice: tools.length > 0 ? 'auto' : undefined,
            stream: true,
            temperature: 0.5
          },
          { signal }
        )

        streamStarted = true

        const accumulatedTools: Record<
          number,
          { id: string; type: 'function'; function: { name: string; arguments: string } }
        > = {}
        let accumulatedContent = ''

        for await (const chunk of stream) {
          if (signal?.aborted) return
          const delta = chunk.choices[0]?.delta
          if (!delta) continue

          const content = delta.content || ''
          const reasoning = (delta as any)?.reasoning || (delta as any)?.reasoning_content || ''

          if (content) {
            accumulatedContent += content
          }

          if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              if (!accumulatedTools[idx]) {
                accumulatedTools[idx] = {
                  id: tc.id || `call_${Date.now()}_${idx}`,
                  type: 'function',
                  function: {
                    name: tc.function?.name || '',
                    arguments: tc.function?.arguments || ''
                  }
                }
              } else {
                if (tc.id) accumulatedTools[idx].id = tc.id
                if (tc.function?.name) accumulatedTools[idx].function.name += tc.function.name
                if (tc.function?.arguments) accumulatedTools[idx].function.arguments += tc.function.arguments
              }
            }
          }

          if (content || reasoning) {
            yield { content, reasoning }
          }
        }

        const finalToolCalls = Object.values(accumulatedTools)
        const rawMessage: OpenAI.Chat.ChatCompletionMessage = {
          role: 'assistant',
          content: accumulatedContent || null,
          tool_calls: finalToolCalls.length > 0 ? finalToolCalls : undefined
        } as any

        if (finalToolCalls.length > 0) {
          yield { toolCalls: finalToolCalls, rawMessage }
        }

        return
      } catch (err: any) {
        if (signal?.aborted || err?.name === 'AbortError' || err?.message?.includes('aborted')) {
          this.logger.log(`🛑 Client đã ngắt kết nối stream with tools (${target.name}).`)
          return
        }
        if (streamStarted) {
          this.logger.error(`❌ Stream with tools bị đứt gãy giữa chừng từ target ${target.name}:`, err)
          throw err
        }
        this.logger.warn(
          `⚠️ Target ${target.name} không thể khởi tạo stream with tools: ${err?.message || err}. Đang thử target tiếp theo...`
        )
      }
    }

    if (!signal?.aborted) {
      throw new Error('Toàn bộ targets stream with tools đều thất bại.')
    }
  }
}
