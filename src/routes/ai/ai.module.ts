import { Module } from '@nestjs/common'
import { AiController } from './ai.controller'
import { AiService } from './ai.service'
import { EmbeddingService } from './embedding/embedding.service'
import { EmbeddingProcessor } from './embedding/embedding.processor'
import { AgentService } from './agent/agent.service'
import { ScheduleAdvisorService } from './schedule-advisor.service'
import { ReportModule } from '../report/report.module'
import { ChatModule } from '../chat/chat.module'
import { NotificationModule } from '../notification/notification.module'
import { SprintSummaryTool } from './agent/tools/sprint/sprint-summary.tool'
import { GetBacklogTool } from './agent/tools/sprint/get-backlog.tool'
import { SuggestSprintTool } from './agent/tools/sprint/suggest-sprint.tool'
import { CpmReportTool } from './agent/tools/cpm/cpm-report.tool'
import { ScheduleRiskTool } from './agent/tools/cpm/schedule-risk.tool'
import { RagKnowledgeTool } from './agent/tools/knowledge/rag-knowledge.tool'
import { CreateTaskTool } from './agent/tools/task/create-task.tool'
import { UpdateTaskTool } from './agent/tools/task/update-task.tool'
import { ManageDependencyTool } from './agent/tools/task/manage-dependency.tool'
import { AssignTaskTool } from './agent/tools/task/assign-task.tool'
import { TeamWorkloadTool } from './agent/tools/sprint/team-workload.tool'
import { DailyStandupTool } from './agent/tools/sprint/daily-standup.tool'
import { RetroAdvisorTool } from './agent/tools/sprint/retro-advisor.tool'
import { WebSearchTool } from './agent/tools/web/web-search.tool'
import { AnalyzeBacklogTool } from './agent/tools/sprint/analyze-backlog.tool'
import { TeamSkillsTool } from './agent/tools/sprint/team-skills.tool'
import { AutoPlanSprintsTool } from './agent/tools/sprint/auto-plan-sprints.tool'
import { AutoAssignByRoleTool } from './agent/tools/sprint/auto-assign-by-role.tool'
import { AutoOrganizeBacklogTool } from './agent/tools/sprint/auto-organize-backlog.tool'
import { BreakdownSubtasksTool } from './agent/tools/task/breakdown-subtasks.tool'
import { AcceptanceCriteriaTool } from './agent/tools/task/acceptance-criteria.tool'
import { DetectStaleTasksTool } from './agent/tools/sprint/detect-stale-tasks.tool'
import { DetectScopeCreepTool } from './agent/tools/sprint/detect-scope-creep.tool'
import { DetectOrphanTasksTool } from './agent/tools/task/detect-orphan-tasks.tool'
import { GetBoardColumnsTool } from './agent/tools/board/get-board-columns.tool'
import { MoveTaskColumnTool } from './agent/tools/board/move-task-column.tool'
import { ReorderColumnTasksTool } from './agent/tools/board/reorder-column-tasks.tool'
import { FindDuplicateTasksTool } from './agent/tools/rag/find-duplicate-tasks.tool'
import { SearchTaskSolutionsTool } from './agent/tools/rag/search-solutions.tool'
import { BroadcastAlertTool } from './agent/tools/collab/broadcast-alert.tool'
import { RemindAssigneeTool } from './agent/tools/collab/remind-assignee.tool'
import { CreateSprintTool } from './agent/tools/sprint/create-sprint.tool'
import { StartSprintTool } from './agent/tools/sprint/start-sprint.tool'
import { CompleteSprintTool } from './agent/tools/sprint/complete-sprint.tool'
import { DeleteTaskTool } from './agent/tools/task/delete-task.tool'
import { DeleteSprintTool } from './agent/tools/sprint/delete-sprint.tool'
import { UndoLastActionTool } from './agent/tools/task/undo-last-action.tool'
import { ToolRegistry } from './agent/tools/tool.registry'
import { ContextBuilder } from './agent/context/context.builder'
import { AgentHarness } from './agent/harness/agent.harness'
import { AgentTelemetryService } from './agent/telemetry/agent-telemetry.service'


@Module({
  imports: [ReportModule, ChatModule, NotificationModule],
  controllers: [AiController],
  providers: [
    AiService,
    EmbeddingService,
    EmbeddingProcessor,
    ScheduleAdvisorService,
    // Phase 3 Tools (cũ)
    SprintSummaryTool,
    GetBacklogTool,
    SuggestSprintTool,
    CpmReportTool,
    RagKnowledgeTool,
    CreateTaskTool,
    UpdateTaskTool,
    // Suite 3.3.1: Schedule & CPM Risk
    ScheduleRiskTool,
    ManageDependencyTool,
    // Suite 3.3.2: Team Workload & Capacity
    TeamWorkloadTool,
    AssignTaskTool,
    // Suite 3.3.3: Scrum Ceremonies Copilot
    DailyStandupTool,
    RetroAdvisorTool,
    // Suite 3.3.11: Web Research Engine
    WebSearchTool,
    // Suite 3.3.12: Automated Backlog, Role Allocation & Sprint Planner
    AnalyzeBacklogTool,
    TeamSkillsTool,
    AutoPlanSprintsTool,
    AutoAssignByRoleTool,
    AutoOrganizeBacklogTool,
    // Suite 3.3.4: Tech Lead & Engineering
    BreakdownSubtasksTool,
    AcceptanceCriteriaTool,
    // Suite 3.3.5: Project Health & Anomaly Detection
    DetectStaleTasksTool,
    DetectScopeCreepTool,
    DetectOrphanTasksTool,
    // Suite 3.3.6: Kanban Board & Workflow Automation
    GetBoardColumnsTool,
    MoveTaskColumnTool,
    ReorderColumnTasksTool,
    // Suite 3.3.7: Semantic RAG & Duplicate Guard
    FindDuplicateTasksTool,
    SearchTaskSolutionsTool,
    // Suite 3.3.8: Realtime Collaboration & Alerts
    BroadcastAlertTool,
    RemindAssigneeTool,
    // Suite 3.3.9: Sprint Lifecycle Operations
    CreateSprintTool,
    StartSprintTool,
    CompleteSprintTool,
    // Suite 3.3.10: Safe Deletion & Data Protection
    DeleteTaskTool,
    DeleteSprintTool,
    // Suite 3.4: Telemetry & Undo
    UndoLastActionTool,
    AgentTelemetryService,
    // Core infrastructure
    ToolRegistry,
    ContextBuilder,
    AgentHarness,
    AgentService
  ],
  exports: [
    AiService,
    EmbeddingService,
    AgentService,
    AgentHarness,
    AgentTelemetryService,
    ScheduleAdvisorService,
    ToolRegistry
  ]
})
export class AiModule {}

