import {
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Res,
  Req,
  Param
} from '@nestjs/common'
import { Response, Request } from 'express'
import { FileInterceptor } from '@nestjs/platform-express'
import { ZodSerializerDto } from 'nestjs-zod'
import { ActiveUser } from '~/shared/decorators/active-user.decorator'
import { IsPublic } from '~/shared/decorators/auth.decorator'
import { AiService } from './ai.service'
import {
  AiHealthResDTO,
  CommitExcelImportBodyDTO,
  CommitExcelImportResDTO,
  EnrichTaskBodyDTO,
  EnrichTaskResDTO,
  ParseExcelResDTO,
  RagSearchBodyDTO,
  AgentChatBodyDTO,
  AgentUndoBodyDTO,
  ExecuteProposalBodyDTO,
  ScheduleDiagnosisBodyDTO,
  SyncProjectEmbeddingsBodyDTO
} from './ai.model'
import { EmbeddingService } from './embedding/embedding.service'
import { AgentService } from './agent/agent.service'
import { ScheduleAdvisorService } from './schedule-advisor.service'

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly embeddingService: EmbeddingService,
    private readonly agentService: AgentService,
    private readonly scheduleAdvisorService: ScheduleAdvisorService
  ) {}

  /**
   * 1. Health check kết nối OpenRouter
   */
  @Get('health')
  @ZodSerializerDto(AiHealthResDTO)
  healthCheck() {
    return this.aiService.healthCheck()
  }

  /**
   * 2. Tải file Excel template mẫu (.xlsx) - Public
   */
  @Get('excel/template')
  @IsPublic()
  downloadTemplate(@Res() res: Response) {
    const buffer = this.aiService.generateExcelTemplate()
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="Sprintos_Tasks_Template.xlsx"',
      'Content-Length': buffer.length
    })
    res.end(buffer)
  }

  /**
   * 3. Upload và Parse file Excel/CSV bằng AI
   */
  @Post('excel/parse')
  @ZodSerializerDto(ParseExcelResDTO)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
    })
  )
  async parseExcel(@UploadedFile() file?: Express.Multer.File) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Vui lòng đính kèm file Excel hoặc CSV (field: file)!')
    }
    return this.aiService.parseExcel(file.buffer)
  }

  /**
   * 4. Lưu các tasks đã duyệt từ Preview vào Database
   */
  @Post('excel/commit')
  @ZodSerializerDto(CommitExcelImportResDTO)
  commitExcelImport(
    @Body() body: CommitExcelImportBodyDTO,
    @ActiveUser('userId') userId: string
  ) {
    return this.aiService.commitExcelImport(body, userId)   
  }

  /**
   * 5. Làm giàu nội dung task (User Story, Acceptance Criteria, Subtasks)
   */
  @Post('task/enrich')
  @ZodSerializerDto(EnrichTaskResDTO)
  enrichTask(@Body() body: EnrichTaskBodyDTO) {
    return this.aiService.enrichTask(body)
  }

  /**
   * 6. RAG: Tìm kiếm ngữ nghĩa (Cosine similarity trên pgvector)
   */
  @Post('rag/search')
  semanticSearch(@Body() body: RagSearchBodyDTO) {
    return this.embeddingService.semanticSearch(body.projectId, body.query, body.limit)
  }

  /**
   * 7. RAG: Đồng bộ toàn bộ tasks của dự án vào pgvector
   */
  @Post('rag/sync')
  syncProjectEmbeddings(@Body() body: SyncProjectEmbeddingsBodyDTO) {
    return this.embeddingService.syncProjectTasks(body.projectId)
  }

  /**
   * 8. AI Copilot Agent: Chat thông minh với Tool Calling & RAG
   */
  @Post('agent/chat')
  agentChat(
    @Body() body: AgentChatBodyDTO,
    @ActiveUser('userId') userId: string
  ) {
    return this.agentService.chat(
      body.messages,
      body.projectId,
      body.sprintId,
      body.webSearchMode,
      userId,
      body.currentScreen,
      body.dryRun
    )
  }

  /**
   * 8b. AI Copilot Agent: Chat Streaming qua Server-Sent Events (SSE)
   */
  @Post('agent/chat/stream')
  async agentChatStream(
    @Body() body: AgentChatBodyDTO,
    @ActiveUser('userId') userId: string,
    @Res() res: Response,
    @Req() req: Request
  ) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    const abortController = new AbortController()

    req.on('close', () => {
      abortController.abort()
    })

    const sendEvent = (event: any) => {
      if (res.writableEnded || abortController.signal.aborted) return
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)
      if (typeof (res as any).flush === 'function') {
        ;(res as any).flush()
      }
    }

    try {
      await this.agentService.chatStream(
        body.messages,
        body.projectId,
        body.sprintId,
        sendEvent,
        abortController.signal,
        body.webSearchMode,
        userId,
        body.currentScreen,
        body.dryRun
      )
    } finally {
      if (!res.writableEnded) {
        res.end()
      }
    }
  }

  /**
   * 8c. AI Copilot Agent: Lịch sử kiểm toán Tool Telemetry
   */
  @Get('agent/audit/:projectId')
  getAgentAuditLogs(@Param('projectId') projectId: string) {
    return this.agentService.getAuditLogs(projectId)
  }

  /**
   * 8d. AI Copilot Agent: Hoàn tác hành động gần nhất (10-Minute Undo)
   */
  @Post('agent/undo')
  undoLastAction(
    @Body() body: AgentUndoBodyDTO,
    @ActiveUser('userId') userId: string
  ) {
    return this.agentService.executeUndo('', userId, body.undoId)
  }

  /**
   * 8e. AI Copilot Agent: Thực thi đề xuất hành động đã được người dùng phê duyệt (Human-in-the-loop)
   */
  @Post('agent/execute-proposal')
  executeProposal(
    @Body() body: ExecuteProposalBodyDTO,
    @ActiveUser('userId') userId: string
  ) {
    return this.agentService.executeProposal(body, userId)
  }



  /**
   * 9. AI Schedule Risk & Delay Advisor: Chẩn đoán rủi ro tiến độ theo CPM + SPI
   */
  @Post('schedule-diagnosis')
  diagnoseSchedule(@Body() body: ScheduleDiagnosisBodyDTO) {
    return this.scheduleAdvisorService.diagnoseSprint(body.sprintId)
  }
}
