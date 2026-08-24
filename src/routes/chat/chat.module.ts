import { Module } from '@nestjs/common'
import { ChatController } from './chat.controller'
import { ChatService } from './chat.service'
import { ChatRepo } from './chat.repo'
import { ChatGateway } from './chat.gateway'

@Module({
  controllers: [ChatController],
  providers: [ChatService, ChatRepo, ChatGateway],
  exports: [ChatService, ChatGateway]
})
export class ChatModule {}
