import { Controller, Get, Param, Query } from '@nestjs/common'
import { ChatService } from './chat.service'
import { ZodSerializerDto } from 'nestjs-zod'
import { GetChatMessagesQueryDTO, GetProjectChatParamDTO, GetProjectChatResDTO } from './chat.dto'

@Controller('project-chats')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('project/:projectId')
  @ZodSerializerDto(GetProjectChatResDTO)
  getMessagesByProjectId(@Param() params: GetProjectChatParamDTO, @Query() query: GetChatMessagesQueryDTO) {
    return this.chatService.getMessagesByProjectId(params.projectId, query)
  }
}
