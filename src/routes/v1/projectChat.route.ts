import express from 'express'
import { authHandlingMiddleware } from '~/middlewares/authHandling.middleware'
import { projectChatController } from '~/controllers/projectChat.controller'

const Router = express.Router()

Router.get(
  '/project/:projectId',
  authHandlingMiddleware.isAuthorized,
  projectChatController.getChatByProjectId
)

Router.get(
  '/:roomId/messages',
  authHandlingMiddleware.isAuthorized,
  projectChatController.getChatMessages
)

Router.delete(
  '/:roomId',
  authHandlingMiddleware.isAuthorized,
  projectChatController.deleteChatRoom
)

export const projectChatRoute: express.Router = Router
