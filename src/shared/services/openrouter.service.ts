import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import envConfig from '../config'

@Injectable()
export class OpenRouterService {
  private readonly logger = new Logger(OpenRouterService.name)
  private openai: OpenAI
  private chatClient: OpenAI
  private readonly fallbackModels: string[]
  private apiKey: string
  private baseURL: string
  private primaryModel: string
  private localBaseURL: string
  private localApiKey: string

  constructor() {
    this.apiKey = envConfig.OPENROUTER_API_KEY
    this.baseURL = envConfig.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
    this.primaryModel = envConfig.DEFAULT_AI_MODEL || 'meta-llama/llama-3.3-70b-instruct:free'

    this.localBaseURL = envConfig.LOCAL_AI_BASE_URL
    this.localApiKey = envConfig.LOCAL_AI_API_KEY || 'ollama'

    if (this.localBaseURL) {
      this.logger.log(`AI Chat & Tool Calling is being routed to Local Server: ${this.localBaseURL}`)
      this.fallbackModels = [this.primaryModel]
    } else {
      this.fallbackModels = [
        this.primaryModel,
        'meta-llama/llama-3.3-70b-instruct:free',
        'nvidia/nemotron-3-super-120b-a12b:free',
        'nvidia/nemotron-3.5-lightning:free',
        'google/gemma-4-26b-a4b-it:free',
        'minimax/minimax-m3:free'
      ].filter((v, i, a) => a.indexOf(v) === i) // Unique models
    }

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

    this.openai = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL,
      defaultHeaders
    })

    this.chatClient = this.localBaseURL
      ? new OpenAI({
          apiKey: this.localApiKey,
          baseURL: this.localBaseURL,
          defaultHeaders
        })
      : this.openai
  }

  /**
   * Helper thực hiện gọi LLM kèm cơ chế tự động Fallback nếu gặp lỗi (429, 503...)
   */
  private async executeWithFallback<T>(
    operation: (model: string) => Promise<T>,
    operationName = 'AI Completion'
  ): Promise<{ result: T; modelUsed: string }> {
    let lastError: any = null

    for (const model of this.fallbackModels) {
      try {
        this.logger.log(`🤖 Processing ${operationName} with model: ${model}`)
        const result = await operation(model)
        return { result, modelUsed: model }
      } catch (err: any) {
        lastError = err
        this.logger.warn(`⚠️ Model ${model} failed: ${err?.message || err}. Trying next model...`)
      }
    }

    this.logger.error(`❌ All models failed:`, lastError)
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

    const { result } = await this.executeWithFallback(async (model) => {
      const response = await this.chatClient.chat.completions.create({
        model,
        messages,
        temperature: 0.7
      })
      return response.choices[0]?.message?.content || ''
    }, 'Chat')

    return result
  }

  /**
   * 2. Sinh JSON có cấu trúc (Cho parse Excel, Task Breakdown)
   */
  async generateJson<T>(prompt: string, systemInstruction: string): Promise<T> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `${systemInstruction}\nRequired to return pure JSON format (valid JSON), absolutely do not wrap it in a markdown code block \`\`\`json.`
      },
      { role: 'user', content: prompt }
    ]

    const { result } = await this.executeWithFallback(async (model) => {
      const response = await this.chatClient?.chat.completions.create({
        model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.2
      })
      return response?.choices[0]?.message?.content || '{}'
    }, 'GenerateJson')

    // Làm sạch chuỗi trước khi JSON.parse
    let clean = result.trim()
    if (clean.startsWith('```')) {
      clean = clean
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim()
    }
    const firstBrace = clean.indexOf('{')
    const lastBrace = clean.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      clean = clean.substring(firstBrace, lastBrace + 1)
    }

    try {
      return JSON.parse(clean) as T
    } catch (parseErr) {
      this.logger.error('Lỗi khi JSON.parse nội dung từ AI:', clean)
      throw parseErr
    }
  }

  /**
   * 3. Kiểm tra sức khỏe kết nối OpenRouter
   */
  async healthCheck(): Promise<{ ok: boolean; model: string; message: string }> {
    try {
      const { result, modelUsed } = await this.executeWithFallback(async (model) => {
        const res = await this.chatClient.chat.completions.create({
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
        model: this.fallbackModels[0],
        message: err?.message || 'Connection failed'
      }
    }
  }

  /**
   * 4. Sinh Vector Embedding (1536 chiều bằng text-embedding-3-small)
   */
  async createEmbedding(text: string): Promise<number[]> {
    try {
      const cleanText = (text || '').replace(/\n+/g, ' ').trim().slice(0, 8000) || 'empty'
      const response = await this.openai.embeddings.create({
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
   * 4b. Sinh hàng loạt Vector Embeddings theo Batch (tối ưu hóa hiệu năng RAG sync)
   */
  async createEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      if (!texts || texts.length === 0) return []
      const cleanTexts = texts.map((t) => (t || '').replace(/\n+/g, ' ').trim().slice(0, 8000) || 'empty')
      const response = await this.openai.embeddings.create({
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

    const { result } = await this.executeWithFallback(async (model) => {
      const response = await this.chatClient.chat.completions.create({
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
}
