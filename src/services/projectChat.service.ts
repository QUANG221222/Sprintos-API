import { Request } from 'express'
import { projectChatModel } from '~/models/projectChat.model'
import { projectModel } from '~/models/project.model'
import ApiError from '~/utils/ApiError'
import { StatusCodes } from 'http-status-codes'

/**
 * Create a new chat room for a project
 * @param projectId ID of the project
 * @param userId ID of the user creating the chat room
 * @returns Created chat room data
 */
const createChatRoom = async (projectId: string): Promise<any> => {
  try {
    // Check if project exists
    const project = await projectModel.findOneById(projectId)
    if (!project) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Project not found')
    }

    // Create new chat room

    const newChatRoom = {
      projectId,
      messages: [],
      lastMessage: '',
      lastMessageTime: null
    }

    const result = await projectChatModel.createChatRoom(newChatRoom)
    return result
  } catch (error) {
    throw error
  }
}

/**
 * Get chat room by project id
 * @param req Request object containing project id
 * @returns Chat room data with messages
 */
const getChatByProjectId = async (req: Request): Promise<any> => {
  try {
    const { projectId } = req.params
    const userId = req.jwtDecoded.id

    // Check if project exists
    const project = await projectModel.findOneById(projectId)
    if (!project) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Project not found')
    }

    // Check if user has access to the project
    const isMember = project.members.some(
      (m) => m.memberId.toString() === userId && m.status === 'active'
    )
    if (!isMember && project.ownerId.toString() !== userId) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'You do not have access to this project chat'
      )
    }

    const chatRoom = await projectChatModel.findChatByProjectId(projectId)
    if (!chatRoom) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Chat room not found')
    }

    return chatRoom
  } catch (error) {
    throw error
  }
}

/**
 * Get chat messages by room id with pagination
 * @param req Request object containing room id and pagination params
 * @returns Paginated chat messages
 */
const getChatMessages = async (req: Request): Promise<any> => {
  try {
    const { roomId } = req.params

    const chatRoom = await projectChatModel.findOneById(roomId)
    if (!chatRoom) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Chat room not found')
    }

    const messages = await projectChatModel.getAllChatsById(roomId)

    if (!messages) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'No messages found')
    }

    return messages
  } catch (error) {
    throw error
  }
}

/**
 * Delete a message in a chat room
 * @param roomId ID of the chat room
 * @param messageId ID of the message to delete
 */
const deleteMessage = async (
  roomId: string,
  messageId: string
): Promise<void> => {
  try {
    await projectChatModel.deleteMessage(roomId, messageId)
  } catch (error) {
    throw error
  }
}

const deleteChatRoom = async (req: Request): Promise<void> => {
  try {
    const { roomId } = req.params
    const userId = req.jwtDecoded.id

    // Check if owner of the project
    const chatRoom = await projectChatModel.findOneById(roomId)
    if (!chatRoom) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Chat room not found')
    }
    const project = await projectModel.findOneById(
      chatRoom.projectId.toString()
    )
    if (project?.ownerId.toString() !== userId) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'Only project owner can delete the chat room'
      )
    }
    await projectChatModel.deleteChatRoom(roomId)
  } catch (error) {
    throw error
  }
}

export const projectChatService = {
  createChatRoom,
  getChatByProjectId,
  getChatMessages,
  deleteMessage,
  deleteChatRoom
}
