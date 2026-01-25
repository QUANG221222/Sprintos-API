/* eslint-disable no-console */
import { projectChatModel } from '~/models/projectChat.model'
import { getIO } from '~/sockets/index.socket'
import { ObjectId } from 'mongodb'
import { CloudinaryProvider } from '~/providers/CloudinaryProvider'
import {
  normalizeBase64,
  isValidBase64,
  sanitizeFileName
} from '~/utils/formatBase64File'

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
      message,
      file
    } = messageData

    // Validate required fields
    if (!roomId || !senderId || !senderName) {
      socket.emit('error', { message: 'Missing required message fields' })
      return
    }
    if (!message && !file) {
      socket.emit('error', { message: 'Message content or file is required' })
      return
    }

    let attachment = null

    // Handle file upload if file is provided
    if (file && file.base64 && file.fileName) {
      try {
        // Normalize base64 string
        const normalizedBase64 = normalizeBase64(file.base64, file.fileType)

        // Validate base64 string
        if (!isValidBase64(normalizedBase64)) {
          console.error('Invalid base64 format after normalization')
          socket.emit('error', {
            message:
              'Invalid file format. Please ensure the file is properly encoded.'
          })
          return
        }

        // Sanitize filename
        const sanitizedFileName = sanitizeFileName(file.fileName, 30)

        // Upload file to Cloudinary
        const uploadResult = await CloudinaryProvider.uploadFromBase64(
          normalizedBase64,
          'project-chats',
          sanitizedFileName
        )

        attachment = {
          fileName: file.fileName,
          fileType: file.fileType || 'application/octet-stream',
          fileUrl: uploadResult.secure_url,
          fileSize: file.fileSize || 0,
          publicId: uploadResult.public_id
        }
      } catch (error) {
        console.error('Error uploading file:', error)
        socket.emit('error', {
          message: 'Failed to upload file. Please try again.'
        })
        return
      }
    }

    const newMessage = {
      _id: new ObjectId(),
      senderId: new ObjectId(senderId),
      senderName,
      senderRole,
      senderAvatarUrl: senderAvatarUrl || '',
      message: message || '',
      attachment,
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

    // Fetch the message to check for attachment
    const chatRoom = await projectChatModel.findOneById(roomId)
    if (chatRoom) {
      const message = chatRoom.messages.find(
        (m: any) => m._id.toString() === messageId
      )

      // If message has attachment, delete file from Cloudinary
      if (message && message.attachment && message.attachment.publicId) {
        try {
          await CloudinaryProvider.deleteMedia(
            message.attachment.publicId,
            'auto'
          )
          // console.log(
          //   'Deleted file from Cloudinary:',
          //   message.attachment.publicId
          // )
        } catch (error) {
          console.error('Error deleting file from Cloudinary:', error)
          // Continue with message deletion even if file deletion fails
        }
      }
    }

    await projectChatModel.deleteMessage(roomId, messageId)

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
