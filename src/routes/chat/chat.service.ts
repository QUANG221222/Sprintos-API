import { Injectable } from '@nestjs/common'
import { ChatRepo } from './chat.repo'
import { GetChatMessagesQueryType } from './chat.model'

@Injectable()
export class ChatService {
  constructor(private readonly chatRepo: ChatRepo) {}

  async getMessagesByProjectId(projectId: string, query: GetChatMessagesQueryType) {
    return await this.chatRepo.getMessagesByProjectId(projectId, query)
  }

  async findOrCreateChat(projectId: string) {
    return await this.chatRepo.findOrCreateChatByProjectId(projectId)
  }

  async saveMessage(data: Parameters<ChatRepo['createMessage']>[0]) {
    return await this.chatRepo.createMessage(data)
  }
}
