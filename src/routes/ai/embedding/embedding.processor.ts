import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { AI_EMBEDDING_QUEUE, QUEUE_JOBS } from '~/routes/queue/queue.constant'
import { EmbeddingService } from './embedding.service'

@Processor(AI_EMBEDDING_QUEUE)
export class EmbeddingProcessor extends WorkerHost {
  private readonly logger = new Logger(EmbeddingProcessor.name)

  constructor(private readonly embeddingService: EmbeddingService) {
    super()
  }

  async process(job: Job<{ taskId: string }>): Promise<void> {
    switch (job.name) {
      case QUEUE_JOBS.GENERATE_TASK_EMBEDDING: {
        const { taskId } = job.data
        if (!taskId) return
        this.logger.log(`⏳ Đang xử lý sinh embedding nền cho task: ${taskId}`)
        await this.embeddingService.indexTask(taskId)
        break
      }
      default:
        this.logger.warn(`Không nhận diện được job name: ${job.name}`)
    }
  }
}
