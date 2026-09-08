import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '~/shared/services/prisma.service'
import { OpenRouterService } from '~/shared/services/openrouter.service'
import { createId } from '@paralleldrive/cuid2'

export interface SemanticSearchResult {
  id: string
  content: string
  taskId: string | null
  sourceType: string
  similarity: number
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly openRouterService: OpenRouterService
  ) {}

  /**
   * Định dạng nội dung ngữ nghĩa phong phú cho một Task (kèm Assignees, Labels, Subtasks)
   */
  private formatTaskContent(task: any): string {
    const parts: string[] = [
      `Tiêu đề: ${task.title}`,
      `Loại công việc: ${task.type}`,
      `Sprint: ${task.sprint?.name || 'Backlog'}`,
      `Trạng thái cột: ${task.boardColumn?.title || 'Unknown'}`,
      `Độ ưu tiên: ${task.priority || 'MEDIUM'}`,
      `Story Points: ${task.storyPoint || 0}`
    ]

    if (task.assignees && task.assignees.length > 0) {
      const names = task.assignees
        .map((a: any) => a.user?.name || a.user?.email)
        .filter(Boolean)
        .join(', ')
      if (names) {
        parts.push(`Người phụ trách: ${names}`)
      }
    }

    if (task.labels && task.labels.length > 0) {
      const tagNames = task.labels
        .map((l: any) => l.label)
        .filter(Boolean)
        .join(', ')
      if (tagNames) {
        parts.push(`Nhãn (Tags/Labels): ${tagNames}`)
      }
    }

    if (task.subTasks && task.subTasks.length > 0) {
      const subTitles = task.subTasks.map((s: any) => s.title).join('; ')
      parts.push(`Các công việc con (Subtasks): ${subTitles}`)
    }

    if (task.description && task.description.trim()) {
      parts.push(`Mô tả chi tiết:\n${task.description.trim()}`)
    }

    return parts.join('\n')
  }

  /**
   * Tạo vector embedding và lưu vào pgvector cho một Task
   */
  async indexTask(taskId: string): Promise<void> {
    try {
      const task = await this.prisma.task.findUnique({
        where: { id: taskId },
        include: {
          sprint: true,
          boardColumn: true,
          assignees: { include: { user: true } },
          labels: true,
          subTasks: { select: { title: true } }
        }
      })

      if (!task || !task.sprint?.projectId) {
        this.logger.warn(`Task ${taskId} không tồn tại hoặc không thuộc project nào để embed.`)
        return
      }

      const content = this.formatTaskContent(task)
      const vector = await this.openRouterService.createEmbedding(content)
      const vectorStr = `[${vector.join(',')}]`
      const projectId = task.sprint.projectId

      // Xóa vector cũ nếu có
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM task_document_embeddings WHERE "taskId" = $1`,
        taskId
      )

      // Chèn vector mới
      const newId = createId()
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO task_document_embeddings (id, "projectId", "taskId", "sourceType", "sourceId", content, embedding, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7::vector, NOW(), NOW())`,
        newId,
        projectId,
        taskId,
        'TASK',
        taskId,
        content,
        vectorStr
      )

      this.logger.log(`✅ Đã lập chỉ mục vector cho Task: "${task.title}" (${taskId})`)
    } catch (err: any) {
      this.logger.error(`❌ Lỗi khi index vector cho Task ${taskId}:`, err?.message || err)
    }
  }

  /**
   * Xóa vector embedding của task khi task bị xóa
   */
  async deleteTaskEmbedding(taskId: string): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM task_document_embeddings WHERE "taskId" = $1`,
        taskId
      )
    } catch (err: any) {
      this.logger.error(`Lỗi khi xóa embedding của task ${taskId}:`, err?.message || err)
    }
  }

  /**
   * Tìm kiếm ngữ nghĩa bằng khoảng cách Cosine (<=> trong pgvector)
   * Có lọc theo ngưỡng tương đồng tối thiểu (minSimilarity = 0.25)
   */
  async semanticSearch(
    projectId: string,
    query: string,
    limit = 5,
    minSimilarity = 0.22
  ): Promise<SemanticSearchResult[]> {
    try {
      if (!query || !query.trim()) return []

      const queryVector = await this.openRouterService.createEmbedding(query)
      const vectorStr = `[${queryVector.join(',')}]`

      const rawResults = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id, content, "taskId", "sourceType",
                round(cast(1 - (embedding <=> $1::vector) as numeric), 4) AS similarity
         FROM task_document_embeddings
         WHERE "projectId" = $2
           AND (1 - (embedding <=> $1::vector)) >= $3
         ORDER BY embedding <=> $1::vector
         LIMIT $4`,
        vectorStr,
        projectId,
        minSimilarity,
        limit
      )

      return (rawResults || []).map((row) => ({
        id: row.id,
        content: row.content,
        taskId: row.taskId,
        sourceType: row.sourceType,
        similarity: parseFloat(row.similarity) || 0
      }))
    } catch (err: any) {
      this.logger.error('❌ Lỗi khi tìm kiếm ngữ nghĩa:', err?.message || err)
      return []
    }
  }

  /**
   * Đồng bộ hóa toàn bộ tasks của một dự án vào pgvector với Batch Embedding siêu tốc
   */
  async syncProjectTasks(projectId: string): Promise<{ total: number }> {
    const tasks = await this.prisma.task.findMany({
      where: {
        sprint: { projectId },
        deletedAt: null
      },
      include: {
        sprint: true,
        boardColumn: true,
        assignees: { include: { user: true } },
        labels: true,
        subTasks: { select: { title: true } }
      }
    })

    if (tasks.length === 0) {
      this.logger.log(`Project ${projectId} không có task nào để index.`)
      return { total: 0 }
    }

    this.logger.log(`🔄 Bắt đầu lập chỉ mục vector siêu tốc cho ${tasks.length} tasks trong project ${projectId}`)

    // Xử lý theo từng batch 20 tasks để tối ưu tốc độ và an toàn payload
    const batchSize = 20
    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize)
      const contents = batch.map((t) => this.formatTaskContent(t))

      try {
        const vectors = await this.openRouterService.createEmbeddings(contents)

        for (let j = 0; j < batch.length; j++) {
          const task = batch[j]
          const content = contents[j]
          const vector = vectors[j]
          if (!vector) continue

          const vectorStr = `[${vector.join(',')}]`

          await this.prisma.$executeRawUnsafe(
            `DELETE FROM task_document_embeddings WHERE "taskId" = $1`,
            task.id
          )

          const newId = createId()
          await this.prisma.$executeRawUnsafe(
            `INSERT INTO task_document_embeddings (id, "projectId", "taskId", "sourceType", "sourceId", content, embedding, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7::vector, NOW(), NOW())`,
            newId,
            projectId,
            task.id,
            'TASK',
            task.id,
            content,
            vectorStr
          )
        }
      } catch (batchErr: any) {
        this.logger.error(`Lỗi batch ${i} - ${i + batchSize}:`, batchErr?.message || batchErr)
      }
    }

    this.logger.log(`✅ Hoàn tất index ${tasks.length} tasks cho project ${projectId}`)
    return { total: tasks.length }
  }
}
