import { Injectable } from '@nestjs/common'
import { PrismaService } from '~/shared/services/prisma.service'
import { GetChatMessagesQueryType, GetProjectChatResType } from './chat.model'

@Injectable()
export class ChatRepo {
  constructor(private readonly prismaService: PrismaService) {}

  async findOrCreateChatByProjectId(projectId: string) {
    let chat = await this.prismaService.projectChat.findUnique({
      where: { projectId }
    })

    if (!chat) {
      chat = await this.prismaService.projectChat.create({
        data: { projectId }
      })
    }

    return chat
  }

  async getMessagesByProjectId(projectId: string, query: GetChatMessagesQueryType): Promise<GetProjectChatResType> {
    const chat = await this.findOrCreateChatByProjectId(projectId)
    const { page, limit } = query
    const skip = (page - 1) * limit
    const take = limit

    const [totalMessages, messages] = await Promise.all([
      this.prismaService.projectChatMessage.count({
        where: {
          projectChatId: chat.id,
          deletedAt: null
        }
      }),
      this.prismaService.projectChatMessage.findMany({
        where: {
          projectChatId: chat.id,
          deletedAt: null
        },
        skip,
        take,
        orderBy: {
          timestamp: 'asc'
        }
      })
    ])

    return {
      id: chat.id,
      projectId,
      messages,
      totalMessages,
      page,
      limit,
      totalPages: Math.ceil(totalMessages / limit)
    }
  }

  async createMessage(data: {
    projectChatId: string
    senderId: string
    senderName: string
    senderRole: string
    senderAvatarUrl?: string | null
    message?: string | null
    attachmentFileName?: string | null
    attachmentFileType?: string | null
    attachmentFileUrl?: string | null
    attachmentFileSize?: number | null
    attachmentPublicId?: string | null
  }) {
    const message = await this.prismaService.projectChatMessage.create({
      data: {
        ...data,
        createdById: data.senderId
      }
    })

    await this.prismaService.projectChat.update({
      where: { id: data.projectChatId },
      data: {
        lastMessage: data.message || 'Sent an attachment',
        lastMessageTime: new Date()
      }
    })

    return message
  }
}
