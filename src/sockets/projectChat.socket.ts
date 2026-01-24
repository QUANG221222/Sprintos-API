/* eslint-disable no-console */
import { projectChatModel } from '~/models/projectChat.model'
import { getIO } from '~/sockets/index.socket'
import { ObjectId } from 'mongodb'

/**
 * Handle user joining project chat room
 * @param socket socket instance
 * @param roomId room id to join
 */
const handleJoinProjectChat = (socket: any, roomId: string) => {
  try {
    socket.join(`chat_${roomId}`)
    // console.log(`User ${socket.id} joined chat room: ${roomId}`)
  } catch (error) {
    console.error('Error joining chat room:', error)
  }
}

/**
 * Handle user leaving project chat room
 * @param socket socket instance
 * @param roomId room id to leave
 */
const handleLeaveProjectChat = (socket: any, roomId: string) => {
  try {
    socket.leave(`chat_${roomId}`)
    // console.log(`User ${socket.id} left chat room: ${roomId}`)
  } catch (error) {
    console.error('Error leaving chat room:', error)
  }
}

/**
 * Handle sending message in project chat
 * @param socket socket instance
 * @param messageData message data containing roomId and message details
 */
const handleSendMessage = async (socket: any, messageData: any) => {
  try {
    const {
      roomId,
      senderId,
      senderName,
      senderRole,
      senderAvatarUrl,
      message
    } = messageData

    // Validate required fields
    if (!roomId || !senderId || !senderName || !message) {
      socket.emit('error', { message: 'Missing required message fields' })
      return
    }

    const newMessage = {
      _id: new ObjectId(),
      senderId: new ObjectId(senderId),
      senderName,
      senderRole,
      senderAvatarUrl: senderAvatarUrl || '',
      message,
      timestamp: Date.now(),
      isDeleted: false
    }

    // Save message to database
    await projectChatModel.addMessage(roomId, newMessage)

    // Broadcast message to all users in the room
    if (!getIO()) return

    getIO().to(`chat_${roomId}`).emit('new_message', newMessage)
  } catch (error) {
    console.error('Error sending message:', error)
    socket.emit('error', { message: 'Failed to send message' })
  }
}

/**
 * Handle user typing in project chat
 * @param socket socket instance
 * @param typingData typing data containing roomId and user info
 */
const handleTyping = (socket: any, typingData: any) => {
  try {
    const { roomId, userId, userName } = typingData

    if (!roomId || !userId || !userName) {
      return
    }

    // Broadcast typing status to other users in the room
    socket.to(`chat_${roomId}`).emit('user_typing', {
      roomId,
      userId,
      userName
    })
  } catch (error) {
    console.error('Error handling typing:', error)
  }
}

/**
 * Handle user stopped typing in project chat
 * @param socket socket instance
 * @param typingData typing data containing roomId and user info
 */
const handleStopTyping = (socket: any, typingData: any) => {
  try {
    const { roomId, userId } = typingData

    if (!roomId || !userId) {
      return
    }

    // Broadcast stop typing status to other users in the room
    socket.to(`chat_${roomId}`).emit('user_stop_typing', {
      roomId,
      userId
    })
  } catch (error) {
    console.error('Error handling stop typing:', error)
  }
}

/**
 * Handle deleting message in project chat
 * @param socket socket instance
 * @param deleteData delete data containing roomId and messageId
 * @returns void
 */
const handleDeleteMessage = async (socket: any, deleteData: any) => {
  try {
    const { roomId, messageId } = deleteData
    if (!roomId || !messageId) {
      socket.emit('error', { message: 'Missing required fields for deletion' })
      return
    }
    await projectChatModel.deleteMessage(roomId, messageId)

    // Notify all users in the room about the deleted message
    if (getIO()) {
      getIO().to(`chat_${roomId}`).emit('message_deleted', {
        roomId,
        messageId
      })
    }
  } catch (error) {
    console.error('Error deleting message:', error)
    socket.emit('error', { message: 'Failed to delete message' })
  }
}

export const projectChatSocket = {
  handleJoinProjectChat,
  handleLeaveProjectChat,
  handleSendMessage,
  handleDeleteMessage,
  handleTyping,
  handleStopTyping
}
