import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { AgentContext } from '../agent.types'
import { IAgentTool, ToolCategory, ToolExecutionResult } from './tool.interface'
import { ToolInputValidator } from '../validators/tool-input.validator'
import { AgentTelemetryService } from '../telemetry/agent-telemetry.service'
import { SprintSummaryTool } from './sprint/sprint-summary.tool'
import { GetBacklogTool } from './sprint/get-backlog.tool'
import { SuggestSprintTool } from './sprint/suggest-sprint.tool'
import { CpmReportTool } from './cpm/cpm-report.tool'
import { ScheduleRiskTool } from './cpm/schedule-risk.tool'
import { RagKnowledgeTool } from './knowledge/rag-knowledge.tool'
import { CreateTaskTool } from './task/create-task.tool'
import { UpdateTaskTool } from './task/update-task.tool'
import { ManageDependencyTool } from './task/manage-dependency.tool'
import { AssignTaskTool } from './task/assign-task.tool'
import { TeamWorkloadTool } from './sprint/team-workload.tool'
import { DailyStandupTool } from './sprint/daily-standup.tool'
import { RetroAdvisorTool } from './sprint/retro-advisor.tool'
import { WebSearchTool } from './web/web-search.tool'
import { AnalyzeBacklogTool } from './sprint/analyze-backlog.tool'
import { TeamSkillsTool } from './sprint/team-skills.tool'
import { AutoPlanSprintsTool } from './sprint/auto-plan-sprints.tool'
import { AutoAssignByRoleTool } from './sprint/auto-assign-by-role.tool'
import { AutoOrganizeBacklogTool } from './sprint/auto-organize-backlog.tool'
import { BreakdownSubtasksTool } from './task/breakdown-subtasks.tool'
import { AcceptanceCriteriaTool } from './task/acceptance-criteria.tool'
import { DetectStaleTasksTool } from './sprint/detect-stale-tasks.tool'
import { DetectScopeCreepTool } from './sprint/detect-scope-creep.tool'
import { DetectOrphanTasksTool } from './task/detect-orphan-tasks.tool'
import { GetBoardColumnsTool } from './board/get-board-columns.tool'
import { MoveTaskColumnTool } from './board/move-task-column.tool'
import { ReorderColumnTasksTool } from './board/reorder-column-tasks.tool'
import { FindDuplicateTasksTool } from './rag/find-duplicate-tasks.tool'
import { SearchTaskSolutionsTool } from './rag/search-solutions.tool'
import { BroadcastAlertTool } from './collab/broadcast-alert.tool'
import { RemindAssigneeTool } from './collab/remind-assignee.tool'
import { CreateSprintTool } from './sprint/create-sprint.tool'
import { StartSprintTool } from './sprint/start-sprint.tool'
import { CompleteSprintTool } from './sprint/complete-sprint.tool'
import { DeleteTaskTool } from './task/delete-task.tool'
import { DeleteSprintTool } from './sprint/delete-sprint.tool'
import { UndoLastActionTool } from './task/undo-last-action.tool'

@Injectable()
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name)
  private readonly tools = new Map<string, IAgentTool>()

  constructor(
    private readonly telemetryService: AgentTelemetryService,
    // Suite 1-3 (Phase 3 - cũ)
    private readonly sprintSummaryTool: SprintSummaryTool,
    private readonly getBacklogTool: GetBacklogTool,
    private readonly suggestSprintTool: SuggestSprintTool,
    private readonly cpmReportTool: CpmReportTool,
    private readonly ragKnowledgeTool: RagKnowledgeTool,
    private readonly createTaskTool: CreateTaskTool,
    private readonly updateTaskTool: UpdateTaskTool,
    // Suite 3.3.1: Schedule & CPM Risk
    private readonly scheduleRiskTool: ScheduleRiskTool,
    private readonly manageDependencyTool: ManageDependencyTool,
    // Suite 3.3.2: Team Workload & Capacity
    private readonly teamWorkloadTool: TeamWorkloadTool,
    private readonly assignTaskTool: AssignTaskTool,
    // Suite 3.3.3: Scrum Ceremonies Copilot
    private readonly dailyStandupTool: DailyStandupTool,
    private readonly retroAdvisorTool: RetroAdvisorTool,
    // Suite 3.3.11: Web Research Engine
    private readonly webSearchTool: WebSearchTool,
    // Suite 3.3.12: Automated Backlog, Role Allocation & Sprint Planner
    private readonly analyzeBacklogTool: AnalyzeBacklogTool,
    private readonly teamSkillsTool: TeamSkillsTool,
    private readonly autoPlanSprintsTool: AutoPlanSprintsTool,
    private readonly autoAssignByRoleTool: AutoAssignByRoleTool,
    private readonly autoOrganizeBacklogTool: AutoOrganizeBacklogTool,
    // Suite 3.3.4: Tech Lead & Engineering
    private readonly breakdownSubtasksTool: BreakdownSubtasksTool,
    private readonly acceptanceCriteriaTool: AcceptanceCriteriaTool,
    // Suite 3.3.5: Project Health & Anomaly Detection
    private readonly detectStaleTasksTool: DetectStaleTasksTool,
    private readonly detectScopeCreepTool: DetectScopeCreepTool,
    private readonly detectOrphanTasksTool: DetectOrphanTasksTool,
    // Suite 3.3.6: Kanban Board & Workflow Automation
    private readonly getBoardColumnsTool: GetBoardColumnsTool,
    private readonly moveTaskColumnTool: MoveTaskColumnTool,
    private readonly reorderColumnTasksTool: ReorderColumnTasksTool,
    // Suite 3.3.7: Semantic RAG & Duplicate Guard
    private readonly findDuplicateTasksTool: FindDuplicateTasksTool,
    private readonly searchTaskSolutionsTool: SearchTaskSolutionsTool,
    // Suite 3.3.8: Realtime Collaboration & Alerts
    private readonly broadcastAlertTool: BroadcastAlertTool,
    private readonly remindAssigneeTool: RemindAssigneeTool,
    // Suite 3.3.9: Sprint Lifecycle Operations
    private readonly createSprintTool: CreateSprintTool,
    private readonly startSprintTool: StartSprintTool,
    private readonly completeSprintTool: CompleteSprintTool,
    // Suite 3.3.10: Safe Deletion & Data Protection (Level 4: DANGEROUS)
    private readonly deleteTaskTool: DeleteTaskTool,
    private readonly deleteSprintTool: DeleteSprintTool,
    // Suite 3.4.5: Undo Mechanism
    private readonly undoLastActionTool: UndoLastActionTool
  ) {
    // --- READ / SUGGEST tools ---
    this.registerTool(this.sprintSummaryTool)
    this.registerTool(this.getBacklogTool)
    this.registerTool(this.suggestSprintTool)
    this.registerTool(this.cpmReportTool)
    this.registerTool(this.scheduleRiskTool)
    this.registerTool(this.ragKnowledgeTool)
    this.registerTool(this.teamWorkloadTool)
    this.registerTool(this.dailyStandupTool)
    this.registerTool(this.retroAdvisorTool)
    this.registerTool(this.webSearchTool)
    this.registerTool(this.analyzeBacklogTool)
    this.registerTool(this.teamSkillsTool)
    this.registerTool(this.acceptanceCriteriaTool)
    this.registerTool(this.detectStaleTasksTool)
    this.registerTool(this.detectScopeCreepTool)
    this.registerTool(this.detectOrphanTasksTool)
    this.registerTool(this.getBoardColumnsTool)
    this.registerTool(this.findDuplicateTasksTool)
    this.registerTool(this.searchTaskSolutionsTool)

    // --- WRITE tools ---
    this.registerTool(this.createTaskTool)
    this.registerTool(this.updateTaskTool)
    this.registerTool(this.manageDependencyTool)
    this.registerTool(this.assignTaskTool)
    this.registerTool(this.autoPlanSprintsTool)
    this.registerTool(this.autoAssignByRoleTool)
    this.registerTool(this.autoOrganizeBacklogTool)
    this.registerTool(this.breakdownSubtasksTool)
    this.registerTool(this.moveTaskColumnTool)
    this.registerTool(this.reorderColumnTasksTool)
    this.registerTool(this.broadcastAlertTool)
    this.registerTool(this.remindAssigneeTool)
    this.registerTool(this.createSprintTool)
    this.registerTool(this.startSprintTool)
    this.registerTool(this.completeSprintTool)
    this.registerTool(this.undoLastActionTool)

    // --- DANGEROUS tools (Level 4 with Confirmation) ---
    this.registerTool(this.deleteTaskTool)
    this.registerTool(this.deleteSprintTool)
  }

  registerTool(tool: IAgentTool): void {
    this.tools.set(tool.name, tool)
    this.logger.log(`🔧 Đã đăng ký tool: [${tool.level}] ${tool.name}`)
  }

  getTool(name: string): IAgentTool | undefined {
    return this.tools.get(name)
  }

  getAllTools(): IAgentTool[] {
    return Array.from(this.tools.values())
  }

  getOpenAiTools(): OpenAI.Chat.ChatCompletionTool[] {
    return this.getAllTools().map((t) => t.toOpenAiTool())
  }

  /**
   * Lọc công cụ động (Contextual Dynamic Tool Pruning & Role-Based RBAC)
   * 1. Lọc theo màn hình (KANBAN, ROADMAP, BACKLOG, CHAT...)
   * 2. Lọc theo vai trò (OWNER, ADMIN, MEMBER, VIEWER)
   * 3. Lọc theo cấu hình webSearchMode
   */
  getEffectiveToolsForContext(context: AgentContext): OpenAI.Chat.ChatCompletionTool[] {
    const screen = (context.currentScreen || 'ALL').toUpperCase()
    const userRole = context.userRole || 'VIEWER'
    const isWebSearchDisabled = context.webSearchMode === 'disabled'

    // 1. Phân định danh mục cho phép theo màn hình và cờ Vision Multimodal
    let allowedCategories: ToolCategory[] | null = null
    if (context.hasImages) {
      // Khi người dùng gửi kèm hình ảnh: Tối đa hóa token budget cho Vision tokens của Local Ollama
      // Chỉ giữ các nhóm công cụ thiết yếu: Bóc tách nhiệm vụ (TASK), tra cứu tri thức (RAG) và tìm kiếm web (WEB)
      allowedCategories = ['TASK', 'RAG', 'WEB']
    } else if (screen === 'KANBAN') {
      allowedCategories = ['KANBAN', 'TASK', 'COLLAB']
    } else if (screen === 'ROADMAP' || screen === 'GANTT') {
      allowedCategories = ['CPM', 'TASK', 'COLLAB']
    } else if (screen === 'BACKLOG') {
      allowedCategories = ['SPRINT', 'TASK', 'RAG']
    } else if (screen === 'CHAT') {
      allowedCategories = ['TASK', 'SPRINT', 'CPM', 'RAG', 'WEB', 'COLLAB']
    }

    const filteredTools = this.getAllTools().filter((tool) => {
      const toolCategory = tool.category
      const riskLevel = tool.riskLevel || tool.level

      // Cắt bỏ webSearch nếu người dùng chủ động tắt
      if (isWebSearchDisabled && tool.name === 'webSearch') {
        return false
      }

      // Giữ webSearch cho các màn hình nếu không bị disabled
      if (tool.name === 'webSearch') {
        return true
      }

      // Giữ undoLastAction cho mọi màn hình
      if (tool.name === 'undoLastAction') {
        return userRole !== 'VIEWER'
      }

      // 1. Kiểm tra màn hình (Contextual Pruning)
      if (allowedCategories && toolCategory && !allowedCategories.includes(toolCategory)) {
        return false
      }

      // 2. Kiểm tra phân quyền RBAC
      if (userRole === 'VIEWER') {
        // VIEWER chỉ được dùng các tool READ hoặc SUGGEST
        return riskLevel === 'READ' || riskLevel === 'SUGGEST'
      }

      if (userRole === 'MEMBER') {
        // MEMBER được dùng READ, SUGGEST, WRITE.
        // DANGEROUS: Cho phép deleteTask (có xác nhận), chặn deleteSprint
        if (tool.name === 'deleteSprint') {
          return false
        }
        return true
      }

      // OWNER và ADMIN: Toàn quyền dùng tất cả tools
      return true
    })

    this.logger.log(
      `🎯 Contextual Pruning: Nạp ${filteredTools.length}/${this.tools.size} tools (Screen: ${screen}, Role: ${userRole})`
    )

    return filteredTools.map((t) => t.toOpenAiTool())
  }

  /**
   * Thực thi công cụ kèm RBAC Guard, Input Validation, Dry-Run simulation, và Audit Telemetry
   */
  async executeTool(name: string, args: any, context: AgentContext): Promise<ToolExecutionResult> {
    const tool = this.getTool(name)
    if (!tool) {
      this.logger.warn(`Không tìm thấy công cụ: ${name}`)
      return {
        output: `Công cụ "${name}" không được hỗ trợ hoặc chưa đăng ký trong hệ thống.`,
        status: 'ERROR',
        summary: `Công cụ không xác định: ${name}`
      }
    }

    const riskLevel = tool.riskLevel || tool.level
    const userRole = context.userRole || 'VIEWER'

    // 1. Role-Based Tool Permission Guard (RBAC Chốt chặn Thực Thi)
    if (userRole === 'VIEWER' && (riskLevel === 'WRITE' || riskLevel === 'DANGEROUS')) {
      const errorMsg = `⛔ **Từ chối quyền hạn (RBAC):** Vai trò của bạn trong dự án là **VIEWER** (Chỉ xem). Bạn không có quyền thực hiện thay đổi dữ liệu hoặc điều phối với công cụ "${name}". Vui lòng liên hệ Quản trị viên (Admin/Owner) để được cấp quyền.`
      await this.telemetryService.recordToolExecution({
        userId: context.userId,
        projectId: context.targetProjectId,
        toolName: name,
        inputParameters: args,
        status: 'ERROR',
        summary: `Từ chối quyền hạn (${userRole}) cho tool ${name}`,
        executionTimeMs: 0
      })
      return {
        output: errorMsg,
        status: 'ERROR',
        summary: `Từ chối quyền hạn: ${userRole}`
      }
    }

    if (userRole === 'MEMBER' && name === 'deleteSprint') {
      const errorMsg = `⛔ **Từ chối quyền hạn (RBAC):** Chỉ có Quản trị viên (Admin/Owner) mới có quyền xóa chu kỳ Sprint.`
      await this.telemetryService.recordToolExecution({
        userId: context.userId,
        projectId: context.targetProjectId,
        toolName: name,
        inputParameters: args,
        status: 'ERROR',
        summary: `Từ chối xóa Sprint: Cần quyền Admin/Owner`,
        executionTimeMs: 0
      })
      return {
        output: errorMsg,
        status: 'ERROR',
        summary: 'Yêu cầu quyền Admin/Owner để xóa Sprint'
      }
    }

    // 2. Tự động kích hoạt cờ dryRun nếu ngữ cảnh chung đang là dryRun
    if (context.dryRun === true && args && args.dryRun === undefined) {
      args.dryRun = true
    }

    // 3. Thực thi tool và đo lường thời gian
    this.logger.log(`⚙️ Kích hoạt tool: [${riskLevel}] ${name} (User: ${context.userId || 'system'}, Role: ${userRole})`)
    const startTime = Date.now()

    let result: ToolExecutionResult
    try {
      result = await tool.execute(args, context)
    } catch (err: any) {
      const durationMs = Date.now() - startTime
      this.logger.error(`❌ Tool ${name} ném ngoại lệ:`, err)
      await this.telemetryService.recordToolExecution({
        userId: context.userId,
        projectId: context.targetProjectId,
        toolName: name,
        inputParameters: args,
        status: 'ERROR',
        summary: `Lỗi ngoại lệ: ${err?.message || err}`,
        executionTimeMs: durationMs
      })
      throw err
    }

    const durationMs = Date.now() - startTime

    // 4. Nếu tool trả về undoAction và thực thi thành công, đăng ký Undo Record
    if (result.status === 'SUCCESS' && result.undoAction && context.targetProjectId) {
      try {
        const undoId = await this.telemetryService.registerUndoAction({
          ...result.undoAction,
          userId: context.userId || 'system',
          projectId: context.targetProjectId
        })
        result.undoId = undoId
      } catch (undoErr: any) {
        this.logger.warn(`Không thể đăng ký Undo cho tool ${name}: ${undoErr?.message}`)
      }
    }

    // 5. Ghi log Telemetry & Audit
    if (context.targetProjectId) {
      await this.telemetryService.recordToolExecution({
        userId: context.userId,
        projectId: context.targetProjectId,
        toolName: name,
        inputParameters: args,
        status: result.status,
        summary: result.summary,
        executionTimeMs: durationMs,
        undoId: result.undoId
      })
    }

    return result
  }
}
