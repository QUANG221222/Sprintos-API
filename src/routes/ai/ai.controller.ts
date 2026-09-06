import {
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Res
} from '@nestjs/common'
import { Response } from 'express'
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
  ParseExcelResDTO
} from './ai.model'

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

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
   * 2. Upload và Parse file Excel/CSV bằng AI
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
   * 3. Lưu các tasks đã duyệt từ Preview vào Database
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
   * 4. Làm giàu nội dung task (User Story, Acceptance Criteria, Subtasks)
   */
  @Post('task/enrich')
  @ZodSerializerDto(EnrichTaskResDTO)
  enrichTask(@Body() body: EnrichTaskBodyDTO) {
    return this.aiService.enrichTask(body)
  }
}
