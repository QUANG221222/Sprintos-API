import { Logger } from '@nestjs/common'

export class ToolInputValidator {
  private static readonly logger = new Logger(ToolInputValidator.name)

  /**
   * Parse JSON arguments từ tool_call an toàn
   */
  static parseArguments(rawArgs?: string | null): Record<string, any> {
    if (!rawArgs || typeof rawArgs !== 'string') {
      return {}
    }

    try {
      return JSON.parse(rawArgs)
    } catch (err: any) {
      this.logger.warn(`Không thể parse JSON arguments: "${rawArgs}". Lỗi: ${err?.message || err}`)
      return {}
    }
  }

  /**
   * Validate arguments dựa trên Zod Schema nếu tool có khai báo
   */
  static validateArgs<T = any>(
    schema: any,
    args: any
  ): { success: boolean; data?: T; error?: string } {
    if (!schema || typeof schema.safeParse !== 'function') {
      return { success: true, data: args }
    }

    const result = schema.safeParse(args)
    if (!result.success) {
      const errorMsg = result.error.errors
        .map((e: any) => `${e.path.join('.') || 'root'}: ${e.message}`)
        .join('; ')
      this.logger.warn(`Tham số tool không hợp lệ: ${errorMsg}`)
      return { success: false, error: errorMsg }
    }

    return { success: true, data: result.data }
  }
}

