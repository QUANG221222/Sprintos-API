import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '~/shared/services/prisma.service'
import { RedisService } from '~/shared/services/redis.service'

export interface ToolAuditLogEntry {
  id: string
  userId?: string
  projectId: string
  toolName: string
  inputParameters: any
  status: 'SUCCESS' | 'ERROR'
  summary: string
  executionTimeMs: number
  timestamp: string
  undoId?: string
}

export type UndoActionType = 'MOVE_TASK' | 'UPDATE_TASK' | 'REORDER_TASKS' | 'ASSIGN_TASK'

export interface UndoRecord {
  undoId: string
  userId: string
  projectId: string
  action: UndoActionType
  taskId?: string
  taskTitle?: string
  previousState: any
  newState?: any
  summary: string
  createdAt: number
}

const UNDO_TTL_SECONDS = 600 // 10 phút

@Injectable()
export class AgentTelemetryService {
  private readonly logger = new Logger(AgentTelemetryService.name)
  // In-memory fallback buffers
  private readonly inMemoryAudit = new Map<string, ToolAuditLogEntry[]>()
  private readonly inMemoryUndo = new Map<string, UndoRecord>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  /**
   * Ghi log kiểm toán (Audit Telemetry) lượt thực thi tool
   */
  async recordToolExecution(params: {
    userId?: string
    projectId: string
    toolName: string
    inputParameters: any
    status: 'SUCCESS' | 'ERROR'
    summary: string
    executionTimeMs: number
    undoId?: string
  }): Promise<void> {
    const entry: ToolAuditLogEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId: params.userId,
      projectId: params.projectId,
      toolName: params.toolName,
      inputParameters: params.inputParameters,
      status: params.status,
      summary: params.summary,
      executionTimeMs: params.executionTimeMs,
      timestamp: new Date().toISOString(),
      undoId: params.undoId
    }

    // 1. Lưu in-memory (tối đa 100 bản ghi mỗi project)
    const currentList = this.inMemoryAudit.get(params.projectId) || []
    currentList.unshift(entry)
    if (currentList.length > 100) {
      currentList.pop()
    }
    this.inMemoryAudit.set(params.projectId, currentList)

    // 2. Lưu vào Redis với TTL 7 ngày
    try {
      const redisKey = `agent:telemetry:${params.projectId}`
      await this.redis.setex(
        `${redisKey}:${entry.id}`,
        7 * 24 * 3600,
        JSON.stringify(entry)
      )
    } catch (err: any) {
      this.logger.warn(`Lỗi ghi telemetry vào Redis: ${err?.message}`)
    }

    this.logger.log(
      `📊 Telemetry: [${entry.status}] ${entry.toolName} (${entry.executionTimeMs}ms) - User: ${entry.userId || 'system'}`
    )
  }

  /**
   * Đăng ký một hành động hoàn tác (Undo Record) có hiệu lực trong 10 phút
   */
  async registerUndoAction(undo: {
    userId: string
    projectId: string
    action: UndoActionType
    taskId?: string
    taskTitle?: string
    previousState: any
    newState?: any
    summary: string
  }): Promise<string> {
    const undoId = `undo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const record: UndoRecord = {
      ...undo,
      undoId,
      createdAt: Date.now()
    }

    // 1. Lưu in-memory
    this.inMemoryUndo.set(undoId, record)
    // Tự động dọn dẹp sau 10 phút
    setTimeout(() => {
      this.inMemoryUndo.delete(undoId)
    }, UNDO_TTL_SECONDS * 1000)

    // 2. Lưu Redis với TTL 10 phút
    try {
      await this.redis.setex(`agent:undo:${undoId}`, UNDO_TTL_SECONDS, JSON.stringify(record))
      // Đánh dấu undo mới nhất cho người dùng trong dự án
      const latestKey = `agent:latest_undo:${undo.projectId}:${undo.userId}`
      await this.redis.setex(latestKey, UNDO_TTL_SECONDS, undoId)
    } catch (err: any) {
      this.logger.warn(`Lỗi đăng ký Undo vào Redis: ${err?.message}`)
    }

    this.logger.log(`⏪ Đã đăng ký Undo [${undo.action}] id: ${undoId} cho user: ${undo.userId}`)
    return undoId
  }

  /**
   * Lấy bản ghi hoàn tác mới nhất của người dùng
   */
  async getLatestUndoRecord(projectId: string, userId: string): Promise<UndoRecord | null> {
    try {
      const latestKey = `agent:latest_undo:${projectId}:${userId}`
      const undoId = await this.redis.get(latestKey)
      if (undoId) {
        const raw = await this.redis.get(`agent:undo:${undoId}`)
        if (raw) {
          return JSON.parse(raw) as UndoRecord
        }
      }
    } catch (err: any) {
      this.logger.warn(`Lỗi đọc Undo từ Redis: ${err?.message}`)
    }

    // Fallback: tìm trong in-memory
    for (const record of this.inMemoryUndo.values()) {
      if (record.projectId === projectId && record.userId === userId) {
        if (Date.now() - record.createdAt <= UNDO_TTL_SECONDS * 1000) {
          return record
        }
      }
    }

    return null
  }

  /**
   * Thực hiện hoàn tác (Rollback / Undo) hành động vừa thực hiện trong vòng 10 phút
   */
  async executeUndo(
    projectId: string,
    userId: string,
    specificUndoId?: string
  ): Promise<{ success: boolean; message: string; details?: any }> {
    let record: UndoRecord | null = null

    if (specificUndoId) {
      try {
        const raw = await this.redis.get(`agent:undo:${specificUndoId}`)
        if (raw) record = JSON.parse(raw)
      } catch {}
      if (!record) record = this.inMemoryUndo.get(specificUndoId) || null
    } else {
      record = await this.getLatestUndoRecord(projectId, userId)
    }

    if (!record) {
      return {
        success: false,
        message: 'Không tìm thấy thao tác nào có thể hoàn tác trong vòng 10 phút gần đây.'
      }
    }

    // Kiểm tra thời hạn 10 phút
    if (Date.now() - record.createdAt > UNDO_TTL_SECONDS * 1000) {
      return {
        success: false,
        message: 'Thao tác đã quá hạn 10 phút và không thể hoàn tác an toàn.'
      }
    }

    try {
      if (record.action === 'MOVE_TASK') {
        const { taskId, previousState } = record
        const { columnId, sortOrder } = previousState

        // Cập nhật boardColumnId của task
        await this.prisma.task.update({
          where: { id: taskId! },
          data: { boardColumnId: columnId }
        })

        // Di chuyển task trở lại cột và vị trí cũ
        const existingOrder = await this.prisma.boardColumnTaskOrder.findFirst({
          where: {
            boardColumnId: columnId,
            taskId: taskId!
          }
        })

        if (existingOrder) {
          await this.prisma.boardColumnTaskOrder.update({
            where: { id: existingOrder.id },
            data: { sortOrder: sortOrder ?? 0 }
          })
        } else {
          await this.prisma.boardColumnTaskOrder.create({
            data: {
              boardColumnId: columnId,
              taskId: taskId!,
              sortOrder: sortOrder ?? 0
            }
          })
        }

        // Xóa task khỏi các cột khác nếu có
        if (record.newState?.columnId && record.newState.columnId !== columnId) {
          await this.prisma.boardColumnTaskOrder.deleteMany({
            where: {
              taskId: taskId!,
              boardColumnId: record.newState.columnId
            }
          })
        }

        // Dọn dẹp bản ghi undo đã dùng
        await this.clearUndoRecord(record)

        return {
          success: true,
          message: `✅ Đã hoàn tác thành công: Di chuyển task "${record.taskTitle || taskId}" trở lại trạng thái cột trước đó.`,
          details: { taskId, restoredColumnId: columnId }
        }
      }

      if (record.action === 'UPDATE_TASK') {
        const { taskId, previousState } = record
        await this.prisma.task.update({
          where: { id: taskId },
          data: {
            title: previousState.title,
            description: previousState.description,
            storyPoint: previousState.storyPoint,
            duration: previousState.duration,
            priority: previousState.priority
          }
        })

        await this.clearUndoRecord(record)

        return {
          success: true,
          message: `✅ Đã hoàn tác thành công: Khôi phục thông tin task "${record.taskTitle || taskId}" về trạng thái trước khi AI chỉnh sửa.`,
          details: { taskId, restoredFields: previousState }
        }
      }

      return {
        success: false,
        message: `Hành động "${record.action}" chưa hỗ trợ hoàn tác tự động.`
      }
    } catch (err: any) {
      this.logger.error(`Lỗi khi thực thi Rollback/Undo:`, err)
      return {
        success: false,
        message: `Hoàn tác thất bại: ${err?.message || err}`
      }
    }
  }

  private async clearUndoRecord(record: UndoRecord): Promise<void> {
    this.inMemoryUndo.delete(record.undoId)
    try {
      await this.redis.del(`agent:undo:${record.undoId}`)
      await this.redis.del(`agent:latest_undo:${record.projectId}:${record.userId}`)
    } catch {}
  }

  /**
   * Lấy danh sách lịch sử Audit Logs gần đây của dự án
   */
  async getAuditLogs(projectId: string, limit = 20): Promise<ToolAuditLogEntry[]> {
    const list = this.inMemoryAudit.get(projectId) || []
    return list.slice(0, limit)
  }
}
