import { Module } from '@nestjs/common'
import { AiController } from './ai.controller'
import { AiService } from './ai.service'
import { EmbeddingService } from './embedding/embedding.service'
import { EmbeddingProcessor } from './embedding/embedding.processor'
import { AgentService } from './agent/agent.service'
import { ScheduleAdvisorService } from './schedule-advisor.service'
import { ReportModule } from '../report/report.module'
import { SprintSummaryTool } from './agent/tools/sprint/sprint-summary.tool'
import { CpmReportTool } from './agent/tools/cpm/cpm-report.tool'
import { RagKnowledgeTool } from './agent/tools/knowledge/rag-knowledge.tool'
import { ToolRegistry } from './agent/tools/tool.registry'
import { ContextBuilder } from './agent/context/context.builder'

@Module({
  imports: [ReportModule],
  controllers: [AiController],
  providers: [
    AiService,
    EmbeddingService,
    EmbeddingProcessor,
    ScheduleAdvisorService,
    SprintSummaryTool,
    CpmReportTool,
    RagKnowledgeTool,
    ToolRegistry,
    ContextBuilder,
    AgentService
  ],
  exports: [
    AiService,
    EmbeddingService,
    AgentService,
    ScheduleAdvisorService,
    ToolRegistry
  ]
})
export class AiModule {}
