import { ObjectId } from 'mongodb'

interface IMessage {
  _id: ObjectId
  senderId: ObjectId
  senderName: string
  senderRole: string
  senderAvatarUrl?: string
  message: string
  timestamp: Date | number
  isDeleted: boolean
}

interface IProjectChat {
  _id: ObjectId
  projectId: ObjectId
  messages: Array<IMessage>
  lastMessage: string
  lastMessageTime?: Date | number | null
  createdAt: Date | number
  updatedAt: Date | number | null
}

interface CreateChatRoomRequest {
  projectId: string
}

interface CreateChatRoomResponse {
  message: string
  data: Partial<IProjectChat>
}

interface GetChatResponse {
  message: string
  data: Partial<IProjectChat>
}

interface GetMessagesResponse {
  message: string
  data: {
    roomId: string
    messages: Array<IMessage>
    total: number
    hasMore: boolean
  }
}

export type {
  IProjectChat,
  IMessage,
  CreateChatRoomRequest,
  CreateChatRoomResponse,
  GetChatResponse,
  GetMessagesResponse
}
