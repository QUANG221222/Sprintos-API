import Joi from 'joi'
import { GET_DB } from '~/configs/mongodb'
import { IProjectChat, IMessage } from '~/types/projectChat.type'
import { OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validator'
import { ObjectId } from 'mongodb'

const COLLECTION_NAME = 'project_chats'

const PROJECT_CHATS_SCHEMA: Joi.Schema<IProjectChat> = Joi.object({
  projectId: Joi.string()
    .pattern(OBJECT_ID_RULE)
    .message(OBJECT_ID_RULE_MESSAGE)
    .required(),
  messages: Joi.array()
    .items(
      Joi.object({
        _id: Joi.string()
          .pattern(OBJECT_ID_RULE)
          .message(OBJECT_ID_RULE_MESSAGE)
          .required(),
        senderId: Joi.string()
          .pattern(OBJECT_ID_RULE)
          .message(OBJECT_ID_RULE_MESSAGE)
          .required(),
        senderName: Joi.string().required(),
        senderRole: Joi.string().required(),
        senderAvatarUrl: Joi.string().uri().optional().allow(''),
        message: Joi.string().allow('').optional(),
        attachment: Joi.object({
          fileName: Joi.string().required(),
          fileType: Joi.string().required(),
          fileUrl: Joi.string().uri().required(),
          fileSize: Joi.number().required(),
          publicId: Joi.string().required()
        }).optional(),
        timestamp: Joi.date().timestamp('javascript').default(Date.now),
        isDeleted: Joi.boolean().default(false)
      })
    )
    .default([]),
  lastMessage: Joi.string().optional().allow(''),
  lastMessageTime: Joi.date().timestamp('javascript').optional().allow(null),
  createdAt: Joi.date().timestamp('javascript').default(Date.now),
  updatedAt: Joi.date().timestamp('javascript').allow(null).default(null)
})

/**
 * Create a new chat room
 * @param data data of the chat room
 * @returns result of the creation
 */
const createChatRoom = async (data: any): Promise<any> => {
  try {
    const validData = await PROJECT_CHATS_SCHEMA.validateAsync(data, {
      abortEarly: false
    })

    const newChatRoom = {
      ...validData,
      projectId: new ObjectId(validData.projectId),
      createdAt: Date.now(),
      updatedAt: null
    }

    const result = await GET_DB()
      .collection(COLLECTION_NAME)
      .insertOne(newChatRoom)

    return await findOneById(result.insertedId.toString())
  } catch (error: any) {
    throw new Error(error)
  }
}

/**
 * Find chat by id
 * @param id id of the chat
 * @returns chat data or null
 */
const findOneById = async (id: string): Promise<IProjectChat | null> => {
  try {
    return (await GET_DB()
      .collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id) })) as IProjectChat | null
  } catch (error: any) {
    throw new Error(error)
  }
}

/**
 * Find chat by project id
 * @param projectId project id to find
 * @returns chat room data or null
 */
const findChatByProjectId = async (
  projectId: string
): Promise<IProjectChat | null> => {
  try {
    return (await GET_DB()
      .collection(COLLECTION_NAME)
      .findOne({ projectId: new ObjectId(projectId) })) as IProjectChat | null
  } catch (error: any) {
    throw new Error(error)
  }
}

/**
 * Get all chat messages by room id
 * @param roomId room id to get messages
 * @returns list of messages
 */
const getAllChatsById = async (roomId: string): Promise<IMessage[]> => {
  try {
    const chatRoom = (await GET_DB()
      .collection(COLLECTION_NAME)
      .find({ _id: new ObjectId(roomId) })
      .sort({ lastMessageTime: -1 })
      .toArray()) as IProjectChat[]

    return chatRoom.length > 0 ? chatRoom[0].messages : []
  } catch (error: any) {
    throw new Error(error)
  }
}

/**
 * Add message to chat room
 * @param roomId room id to add message
 * @param message message data
 * @returns result of the update
 */
const addMessage = async (roomId: string, message: any): Promise<any> => {
  try {
    return await GET_DB()
      .collection<IProjectChat>(COLLECTION_NAME)
      .updateOne(
        { _id: new ObjectId(roomId) },
        {
          $push: { messages: message },
          $set: {
            lastMessage: message.message,
            lastMessageTime: message.timestamp,
            updatedAt: Date.now()
          }
        }
      )
  } catch (error: any) {
    throw new Error(error)
  }
}

const deleteMessage = async (
  roomId: string,
  messageId: string
): Promise<any> => {
  try {
    return await GET_DB()
      .collection(COLLECTION_NAME)
      .updateOne(
        {
          _id: new ObjectId(roomId),
          'messages._id': new ObjectId(messageId)
        },
        {
          $set: {
            'messages.$.isDeleted': true,
            'messages.$.message': 'This message has been deleted',
            'messages.$.attachment': null,
            updatedAt: Date.now()
          }
        }
      )
  } catch (error: any) {
    throw new Error(error)
  }
}

const deleteChatRoom = async (roomId: string): Promise<any> => {
  try {
    return await GET_DB()
      .collection(COLLECTION_NAME)
      .deleteOne({ _id: new ObjectId(roomId) })
  } catch (error: any) {
    throw new Error(error)
  }
}

export const projectChatModel = {
  createChatRoom,
  findChatByProjectId,
  findOneById,
  getAllChatsById,
  addMessage,
  deleteMessage,
  deleteChatRoom
}
