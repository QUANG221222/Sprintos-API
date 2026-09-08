import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class OpenRouterService {
  private readonly logger = new Logger(OpenRouterService.name);
  private openai: OpenAI;
  private readonly fallbackModels: string[];

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const baseURL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    const primaryModel = process.env.DEFAULT_AI_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free';

    this.fallbackModels = [
      primaryModel,
      'nvidia/nemotron-3.5-lightning:free',
      'google/gemma-4-26b-a4b-it:free',
      'minimax/minimax-m3:free',
    ].filter((v, i, a) => a.indexOf(v) === i); // Unique models

    if (!apiKey) {
      this.logger.warn('⚠️ OPENROUTER_API_KEY chưa được cấu hình trong .env!');
    }

    this.openai = new OpenAI({
      apiKey: apiKey || '',
      baseURL: baseURL,
      defaultHeaders: {
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Sprintos Agile PM',
      },
    });
  }

  /**
   * Helper thực hiện gọi LLM kèm cơ chế tự động Fallback nếu gặp lỗi (429, 503...)
   */
  private async executeWithFallback<T>(
    operation: (model: string) => Promise<T>,
    operationName = 'AI Completion'
  ): Promise<{ result: T; modelUsed: string }> {
    let lastError: any = null;

    for (const model of this.fallbackModels) {
      try {
        this.logger.log(`🤖 Đang thực hiện ${operationName} với model: ${model}`);
        const result = await operation(model);
        return { result, modelUsed: model };
      } catch (err: any) {
        lastError = err;
        this.logger.warn(
          `⚠️ Model ${model} gặp lỗi: ${err?.message || err}. Đang thử model tiếp theo...`
        );
      }
    }

    this.logger.error(`❌ Toàn bộ các models trong fallback list đều thất bại:`, lastError);
    throw lastError;
  }

  /**
   * 1. Chat / Text Generation
   */
  async chat(prompt: string, systemInstruction?: string): Promise<string> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content: prompt });

    const { result } = await this.executeWithFallback(async (model) => {
      const response = await this.openai.chat.completions.create({
        model,
        messages,
        temperature: 0.7,
      });
      return response.choices[0]?.message?.content || '';
    }, 'Chat');

    return result;
  }

  /**
   * 2. Sinh JSON có cấu trúc (Cho parse Excel, Task Breakdown)
   */
  async generateJson<T>(prompt: string, systemInstruction: string): Promise<T> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `${systemInstruction}\nBẮT BUỘC trả về định dạng JSON thuần túy (valid JSON), tuyệt đối không bao bọc bằng markdown code block \`\`\`json.`,
      },
      { role: 'user', content: prompt },
    ];

    const { result } = await this.executeWithFallback(async (model) => {
      const response = await this.openai.chat.completions.create({
        model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.2,
      });
      return response.choices[0]?.message?.content || '{}';
    }, 'GenerateJson');

    // Làm sạch chuỗi trước khi JSON.parse
    let clean = result.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      clean = clean.substring(firstBrace, lastBrace + 1);
    }

    try {
      return JSON.parse(clean) as T;
    } catch (parseErr) {
      this.logger.error('Lỗi khi JSON.parse nội dung từ AI:', clean);
      throw parseErr;
    }
  }

  /**
   * 3. Kiểm tra sức khỏe kết nối OpenRouter
   */
  async healthCheck(): Promise<{ ok: boolean; model: string; message: string }> {
    try {
      const { result, modelUsed } = await this.executeWithFallback(async (model) => {
        const res = await this.openai.chat.completions.create({
          model,
          messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
          max_tokens: 10,
        });
        return res.choices[0]?.message?.content?.trim() || 'No response';
      }, 'HealthCheck');

      return {
        ok: true,
        model: modelUsed,
        message: result,
      };
    } catch (err: any) {
      return {
        ok: false,
        model: this.fallbackModels[0],
        message: err?.message || 'Connection failed',
      };
    }
  }

  /**
   * 4. Sinh Vector Embedding (1536 chiều bằng text-embedding-3-small)
   */
  async createEmbedding(text: string): Promise<number[]> {
    try {
      const cleanText = (text || '').replace(/\n+/g, ' ').trim().slice(0, 8000) || 'empty';
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: cleanText,
      });
      return response.data[0].embedding;
    } catch (err: any) {
      this.logger.error('Lỗi khi sinh embedding:', err?.message || err);
      throw err;
    }
  }

  /**
   * 4b. Sinh hàng loạt Vector Embeddings theo Batch (tối ưu hóa hiệu năng RAG sync)
   */
  async createEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      if (!texts || texts.length === 0) return [];
      const cleanTexts = texts.map(
        (t) => (t || '').replace(/\n+/g, ' ').trim().slice(0, 8000) || 'empty'
      );
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: cleanTexts,
      });
      return response.data.map((item) => item.embedding);
    } catch (err: any) {
      this.logger.error('Lỗi khi sinh batch embeddings:', err?.message || err);
      throw err;
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
    message: OpenAI.Chat.ChatCompletionMessage;
    toolCalls?: OpenAI.Chat.ChatCompletionMessageToolCall[];
  }> {
    const fullMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (systemInstruction) {
      fullMessages.push({ role: 'system', content: systemInstruction });
    }
    fullMessages.push(...messages);

    const { result } = await this.executeWithFallback(async (model) => {
      const response = await this.openai.chat.completions.create({
        model,
        messages: fullMessages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        temperature: 0.5,
      });
      return response.choices[0]?.message;
    }, 'ChatWithTools');

    return {
      message: result,
      toolCalls: result?.tool_calls,
    };
  }
}
