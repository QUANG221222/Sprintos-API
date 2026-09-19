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
}
