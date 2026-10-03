import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import IORedis from 'ioredis'
import envConfig from '~/shared/config'

/**
 * RedisService — Shared singleton Redis client (IORedis standalone).
 * Tách biệt hoàn toàn với BullMQ connection để tránh xung đột.
 * Dùng cho: Web Search Cache, Session Cache, Rate Limit, v.v.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name)
  private client: IORedis

  onModuleInit() {
    this.client = new IORedis({
      host: envConfig.REDIS_HOST,
      port: parseInt(envConfig.REDIS_PORT, 10),
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          this.logger.warn('Redis connection failed after 3 retries, giving up.')
          return null
        }
        return Math.min(times * 200, 1000)
      },
      lazyConnect: true
    })

    this.client.on('connect', () => this.logger.log('✅ Redis connected (shared client)'))
    this.client.on('error', (err) => this.logger.error('Redis error:', err.message))

    // Kết nối ngay khi khởi động
    this.client.connect().catch(() => {
      this.logger.warn('⚠️ Redis connect failed on init — will retry on first use.')
    })
  }

  async onModuleDestroy() {
    await this.client?.quit()
    this.logger.log('Redis client disconnected.')
  }

  /**
   * Lấy giá trị theo key. Trả về null nếu không có hoặc Redis lỗi.
   */
  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key)
    } catch (err: any) {
      this.logger.warn(`Redis GET error for key "${key}": ${err?.message}`)
      return null
    }
  }

  /**
   * Lưu giá trị với TTL (giây). Trả về 'OK' hoặc null nếu Redis lỗi.
   */
  async setex(key: string, ttlSeconds: number, value: string): Promise<'OK' | null> {
    try {
      return await this.client.setex(key, ttlSeconds, value)
    } catch (err: any) {
      this.logger.warn(`Redis SETEX error for key "${key}": ${err?.message}`)
      return null
    }
  }

  /**
   * Xóa key. Trả về số key đã xóa, hoặc 0 nếu Redis lỗi.
   */
  async del(key: string): Promise<number> {
    try {
      return await this.client.del(key)
    } catch (err: any) {
      this.logger.warn(`Redis DEL error for key "${key}": ${err?.message}`)
      return 0
    }
  }

  /**
   * Kiểm tra key tồn tại. Trả về false nếu Redis lỗi (safe fallback).
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key)
      return result > 0
    } catch (err: any) {
      this.logger.warn(`Redis EXISTS error for key "${key}": ${err?.message}`)
      return false
    }
  }

  /**
   * Trực tiếp truy cập IORedis client nếu cần các lệnh nâng cao.
   */
  getClient(): IORedis {
    return this.client
  }
}
