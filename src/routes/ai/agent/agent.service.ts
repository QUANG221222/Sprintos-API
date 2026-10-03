import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common'
import {
  AgentChatMessage,
  AgentChatResponse,
  AgentStreamEvent,
  ScreenContext
} from './agent.types'
import { ContextBuilder } from './context/context.builder'
import { AgentHarness } from './harness/agent.harness'
import { AgentTelemetryService } from './telemetry/agent-telemetry.service'
import { ToolRegistry } from './tools/tool.registry'
import { ProposalValidator } from './validators/proposal.validator'

export * from './agent.types'
export * from './harness/harness.types'

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name)

  constructor(
    private readonly contextBuilder: ContextBuilder,
    private readonly agentHarness: AgentHarness,
    private readonly telemetryService: AgentTelemetryService,
    private readonly toolRegistry: ToolRegistry
  ) {}

  /**
   * Cổng giao tiếp Controller Facade: Tiếp nhận yêu cầu Chat Non-Streaming
   * Ủy quyền toàn bộ việc điều phối vòng lặp cho AgentHarness an toàn
   */
  async chat(
    messages: AgentChatMessage[],
    projectId: string,
    sprintId?: string,
    webSearchMode?: 'auto' | 'always' | 'disabled',
    userId?: string,
    currentScreen?: ScreenContext,
    dryRun?: boolean
  ): Promise<AgentChatResponse> {
    try {
      const hasImages = (messages || []).some((m) => m.images && m.images.length > 0)
      const context = await this.contextBuilder.resolveContext(
        projectId,
        sprintId,
        userId,
        currentScreen,
        dryRun,
        webSearchMode,
        hasImages
      )
      const result = await this.agentHarness.execute(messages, context)

      return {
        reply: result.reply,
        thinking: result.thinking,
        toolsUsed: result.toolsUsed,
        actionProposal: result.actionProposal,
        actionProposals: result.actionProposals
      }
    } catch (err: any) {
      this.logger.error('Lỗi trong AgentService chat:', err)
      return {
        reply: `Xin lỗi, hệ thống gặp gián đoạn khi xử lý yêu cầu: ${err?.message || err}. Vui lòng thử lại.`,
        toolsUsed: []
      }
    }
  }


  /**
   * Cổng giao tiếp Controller Facade: Tiếp nhận yêu cầu Chat Streaming SSE
   * Ủy quyền cho AgentHarness executeStream với timeout và AbortSignal
   */
  async chatStream(
    messages: AgentChatMessage[],
    projectId: string,
    sprintId: string | undefined,
    sendEvent: (event: AgentStreamEvent) => void,
    signal?: AbortSignal,
    webSearchMode?: 'auto' | 'always' | 'disabled',
    userId?: string,
    currentScreen?: ScreenContext,
    dryRun?: boolean
  ): Promise<void> {
    try {
      const hasImages = (messages || []).some((m) => m.images && m.images.length > 0)
      const context = await this.contextBuilder.resolveContext(
        projectId,
        sprintId,
        userId,
        currentScreen,
        dryRun,
        webSearchMode,
        hasImages
      )
      await this.agentHarness.executeStream(messages, context, sendEvent, { signal })
    } catch (err: any) {
      if (signal?.aborted || err?.name === 'AbortError' || err?.message?.includes('aborted')) {
        this.logger.log('🛑 AgentService chatStream đã dừng theo yêu cầu của client.')
        return
      }
      this.logger.error('Lỗi trong AgentService chatStream:', err)
      sendEvent({
        type: 'error',
        data: {
          message: `Gián đoạn khi xử lý luồng AI: ${err?.message || err}. Vui lòng thử lại.`
        }
      })
    }
  }

  /**
   * Lấy lịch sử kiểm toán thực thi tool của dự án
   */
  async getAuditLogs(projectId: string, limit = 20) {
    return this.telemetryService.getAuditLogs(projectId, limit)
  }

  /**
   * Hoàn tác hành động chỉnh sửa / di chuyển task trong vòng 10 phút
   */
  async executeUndo(projectId: string, userId: string, undoId?: string) {
    return this.telemetryService.executeUndo(projectId, userId, undoId)
  }

  /**
   * Thực thi đề xuất hành động đã được người dùng phê duyệt trên giao diện (Human-in-the-loop)
   * POST /ai/agent/execute-proposal
   */
  async executeProposal(
    body: {
      proposalId: string
      type: string
      payload: any
      projectId: string
      sprintId?: string
    },
    userId: string
  ): Promise<{ success: boolean; message: string; result?: any }> {
    // 1. Kiểm định payload theo ProposalValidator
    const validatedPayload = ProposalValidator.validatePayload(body.type, body.payload)

    // 2. Resolve AgentContext để kiểm tra quyền hạn (RBAC)
    const context = await this.contextBuilder.resolveContext(
      body.projectId,
      body.sprintId,
      userId,
      'ALL',
      false
    )

    const userRole = context.userRole || 'VIEWER'
    if (userRole === 'VIEWER') {
      throw new ForbiddenException(
        '⛔ Từ chối quyền: Vai trò VIEWER không có quyền phê duyệt thực thi đề xuất dữ liệu.'
      )
    }

    if (userRole === 'MEMBER' && (body.type === 'CREATE_SPRINT' || body.type === 'DELETE_SPRINT')) {
      throw new ForbiddenException(
        '⛔ Từ chối quyền: Chỉ Quản trị viên (Admin/Owner) mới có quyền tạo hoặc xóa chu kỳ Sprint.'
      )
    }

    // 3. Ánh xạ type sang tên tool tương ứng và thực thi với cờ isApproved: true
    let toolName: string
    switch (body.type) {
      case 'CREATE_TASK':
        toolName = 'createTask'
        break
      case 'UPDATE_TASK':
        toolName = 'updateTask'
        break
      case 'CREATE_SPRINT':
        toolName = 'createSprint'
        break
      case 'ASSIGN_TASK':
        toolName = 'assignTask'
        break
      case 'MOVE_TASK':
        toolName = 'moveTaskColumn'
        break
      case 'DELETE_TASK':
        toolName = 'deleteTask'
        break
      case 'DELETE_SPRINT':
        toolName = 'deleteSprint'
        break
      default:
        throw new BadRequestException(`Loại đề xuất không được hỗ trợ: ${body.type}`)
    }

    this.logger.log(
      `🚀 Người dùng ${userId} (Role: ${userRole}) duyệt thực thi đề xuất ${body.type} (ID: ${body.proposalId})`
    )

    const toolResult = await this.toolRegistry.executeTool(
      toolName,
      {
        ...validatedPayload,
        isApproved: true,
        dryRun: false,
        confirm: true
      },
      context
    )

    if (toolResult.status === 'ERROR') {
      throw new BadRequestException(
        `Thực thi đề xuất thất bại: ${toolResult.summary}. Chi tiết: ${toolResult.output}`
      )
    }

    return {
      success: true,
      message: toolResult.summary,
      result: toolResult.output
    }
  }
}


