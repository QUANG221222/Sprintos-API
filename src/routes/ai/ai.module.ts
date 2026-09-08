import { Module } from '@nestjs/common'
import { AiController } from './ai.controller'
import { AiService } from './ai.service'
import { EmbeddingService } from './embedding/embedding.service'
import { EmbeddingProcessor } from './embedding/embedding.processor'
import { AgentService } from './agent/agent.service'
import { ScheduleAdvisorService } from './schedule-advisor.service'
import { ReportModule } from '../report/report.module'

@Module({
  imports: [ReportModule],
  controllers: [AiController],
  providers: [
    AiService,
    EmbeddingService,
    EmbeddingProcessor,
    AgentService,
    ScheduleAdvisorService
  ],
  exports: [
    AiService,
    EmbeddingService,
    AgentService,
    ScheduleAdvisorService
  ]
})
export class AiModule {}
