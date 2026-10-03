import { Injectable, Logger } from '@nestjs/common'
import * as crypto from 'node:crypto'
import OpenAI from 'openai'
import { tavily } from '@tavily/core'
import { RedisService } from '~/shared/services/redis.service'
import envConfig from '~/shared/config'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'

// TTL cache 24 giờ
const CACHE_TTL_SECONDS = 86400

// Giới hạn kết quả và độ dài snippet
const MAX_RESULTS = 3
const MAX_WORDS_PER_SNIPPET = 350

// Domain filter chuyên sâu theo category
const CATEGORY_DOMAINS: Record<string, string[]> = {
  docs: [
    'developer.mozilla.org',
    'nestjs.com',
    'nextjs.org',
    'react.dev',
    'typescriptlang.org',
    'prisma.io',
    'tailwindcss.com'
  ],
  npm: ['npmjs.com', 'bundlephobia.com'],
  github_issues: ['github.com', 'stackoverflow.com']
  // 'general': không filter domain
}

interface SearchResult {
  title: string
  url: string
  content: string
}

function buildCacheKey(query: string, category: string): string {
  const normalized = `${category}:${query.toLowerCase().replace(/\s+/g, ' ').trim()}`
  const hash = crypto.createHash('md5').update(normalized).digest('hex')
  return `web_search:${hash}`
}

@Injectable()
export class WebSearchTool implements IAgentTool {
  readonly name = 'webSearch'
  readonly description =
    'Tìm kiếm thông tin trên Internet: tài liệu kỹ thuật, lỗi thư viện, bài viết, package npm, HOẶC thông tin thời gian thực (thời tiết, tin tức sự kiện mới nhất). ' +
    'Trước khi gọi tool này, hãy viết lại câu hỏi thành 3-6 từ khóa ngắn gọn, súc tích (tiếng Anh cho kỹ thuật, tiếng Việt hoặc tiếng Anh cho thời tiết/tin tức đời sống). ' +
    'TUYỆT ĐỐI KHÔNG đưa tên dự án nội bộ, email, ID task, API key hoặc dữ liệu riêng tư vào query. ' +
    'Kết quả trả về: Top 3 kết quả gồm title, url và tóm tắt nội dung.'
  readonly category: ToolCategory = 'WEB'
  readonly riskLevel: ToolRiskLevel = 'READ'
  readonly level: ToolActionLevel = 'READ'
  readonly parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '3-6 từ khóa tìm kiếm ngắn gọn, súc tích (KHÔNG chứa thông tin nội bộ dự án)'
      },
      category: {
        type: 'string',
        enum: ['general', 'docs', 'github_issues', 'npm', 'news', 'weather'],
        description:
          'Loại tìm kiếm: general (tổng hợp), docs (tài liệu kỹ thuật), github_issues (lỗi bug/StackOverflow), npm (thư viện NPM), news (tin tức sự kiện), weather (thời tiết)'
      },
      maxResults: {
        type: 'number',
        description: 'Số kết quả tối đa (1-3, mặc định 3)'
      }
    },
    required: ['query']
  }

  private readonly logger = new Logger(WebSearchTool.name)
  private readonly client: ReturnType<typeof tavily> | null = null

  constructor(private readonly redisService: RedisService) {
    if (envConfig.TAVILY_API_KEY) {
      this.client = tavily({ apiKey: envConfig.TAVILY_API_KEY })
      this.logger.log('✅ Tavily Search Client đã được khởi tạo thành công.')
    } else {
      this.logger.warn('⚠️ Chưa cấu hình TAVILY_API_KEY trong .env. WebSearch sẽ trả về thông báo lỗi khi được gọi.')
    }
  }

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
      query?: string
      category?: 'general' | 'docs' | 'github_issues' | 'npm' | 'news' | 'weather'
      maxResults?: number
    },
    _context: AgentContext
  ): Promise<ToolExecutionResult> {
    const query = args.query?.trim()
    if (!query || query.length < 2) {
      return {
        output: 'Cần cung cấp từ khóa tìm kiếm (ít nhất 2 ký tự).',
        status: 'ERROR',
        summary: 'Thiếu từ khóa tìm kiếm'
      }
    }

    if (!this.client) {
      return {
        output: JSON.stringify({
          error: 'TAVILY_API_KEY chưa được cấu hình trong file .env trên server.',
          query
        }),
        status: 'ERROR',
        summary: 'Thiếu TAVILY_API_KEY'
      }
    }

    const currentYear = new Date().getFullYear()
    let effectiveQuery = query

    // Chống ảo giác cutoff date: Tự động sửa năm cũ (< currentYear) thành năm hiện tại
    // Ví dụ: model quen tay chèn "2024" thì tự động nâng lên năm hiện tại (2025/2026)
    const pastYearRegex = /\b(201[8-9]|202[0-4])\b/g
    if (pastYearRegex.test(effectiveQuery)) {
      const fixedQuery = effectiveQuery.replace(pastYearRegex, String(currentYear))
      this.logger.log(`🔄 Tự động sửa năm cũ trong query: "${effectiveQuery}" ➔ "${fixedQuery}"`)
      effectiveQuery = fixedQuery
    }

    const category = args.category || 'general'
    const maxResults = Math.min(Math.max(1, args.maxResults || MAX_RESULTS), MAX_RESULTS)
    const cacheKey = buildCacheKey(effectiveQuery, category)

    // 1. Kiểm tra Redis cache (TTL 24h)
    try {
      const cached = await this.redisService.get(cacheKey)
      if (cached) {
        this.logger.log(`⚡ Cache HIT cho web_search: "${effectiveQuery}" [${category}]`)
        const cachedData = JSON.parse(cached)
        return {
          output: JSON.stringify({ ...cachedData, cached: true }),
          status: 'SUCCESS',
          summary: `[CACHE] Tìm kiếm "${effectiveQuery}" (${cachedData.totalResults || 0} kết quả)`
        }
      }
    } catch (cacheErr: any) {
      this.logger.warn(`Redis cache read error: ${cacheErr?.message} — Bỏ qua cache, tiếp tục tìm kiếm.`)
    }

    // 2. Chuẩn bị options cho Tavily API
    const includeDomains = CATEGORY_DOMAINS[category]
    this.logger.log(
      `🔍 Tavily search: "${effectiveQuery}" [${category}] (domains: ${includeDomains?.join(', ') || 'ALL'})`
    )

    try {
      // 3. Gọi Tavily Search API
      const response = await this.client.search(effectiveQuery, {
        searchDepth: 'basic',
        maxResults,
        includeDomains: includeDomains && includeDomains.length > 0 ? includeDomains : undefined,
        timeout: 6000
      })

      const rawResults = response.results || []
      const results: SearchResult[] = rawResults.slice(0, maxResults).map((r) => {
        const words = (r.content || '').split(/\s+/)
        const trimmedSnippet =
          words.length > MAX_WORDS_PER_SNIPPET
            ? words.slice(0, MAX_WORDS_PER_SNIPPET).join(' ') + '...'
            : r.content || 'Không có mô tả chi tiết.'

        return {
          title: r.title,
          url: r.url,
          content: trimmedSnippet
        }
      })

      if (results.length === 0) {
        const noResultOutput = JSON.stringify({
          totalResults: 0,
          query,
          category,
          message: `Không tìm thấy kết quả phù hợp cho từ khóa "${query}".`
        })
        return {
          output: noResultOutput,
          status: 'SUCCESS',
          summary: `Không tìm thấy kết quả cho: "${query}"`
        }
      }

      const outputData = {
        totalResults: results.length,
        query,
        category,
        provider: 'Tavily',
        cached: false,
        results
      }

      // 4. Lưu vào Redis cache TTL 24h
      try {
        await this.redisService.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(outputData))
        this.logger.log(`💾 Đã cache kết quả Tavily cho "${query}" [TTL=24h]`)
      } catch (cacheWriteErr: any) {
        this.logger.warn(`Redis cache write error: ${cacheWriteErr?.message}`)
      }

      return {
        output: JSON.stringify(outputData),
        status: 'SUCCESS',
        summary: `Tavily: "${query}" [${category}] → ${results.length} kết quả`
      }
    } catch (error: any) {
      this.logger.error(`Tavily search API error: ${error?.message}`, error?.stack)
      return {
        output: JSON.stringify({
          error: `Lỗi tìm kiếm Tavily: ${error?.message || 'Unknown error'}`,
          query,
          category
        }),
        status: 'ERROR',
        summary: `Tavily search thất bại: ${error?.message}`
      }
    }
  }
}
