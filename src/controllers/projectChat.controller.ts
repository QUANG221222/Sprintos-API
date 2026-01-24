import { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'
import { projectChatService } from '~/services/projectChat.service'

/**
 * Get chat by project id controller
 * @param req request with project id
 * @param res response with chat data
 * @param next handle next middleware
 */
const getChatByProjectId = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await projectChatService.getChatByProjectId(req)
    res.status(StatusCodes.OK).json({
      message: 'Chat retrieved successfully',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Get chat messages controller
 * @param req request with room id and pagination params
 * @param res response with paginated messages
 * @param next handle next middleware
 */
const getChatMessages = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await projectChatService.getChatMessages(req)
    res.status(StatusCodes.OK).json({
      message: 'Messages retrieved successfully',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Delete chat room controller
 * @param req request with room id
 * @param res response with deletion status
 * @param next handle next middleware
 */
const deleteChatRoom = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await projectChatService.deleteChatRoom(req)
    res.status(StatusCodes.OK).json({
      message: 'Chat room deleted successfully'
    })
  } catch (error) {
    next(error)
  }
}

export const projectChatController = {
  getChatByProjectId,
  getChatMessages,
  deleteChatRoom
}
