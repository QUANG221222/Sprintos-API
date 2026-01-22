import express from 'express'
import { authHandlingMiddleware } from '~/middlewares/authHandling.middleware'
import { notificationController } from '~/controllers/notification.controller'

const Router = express.Router()

Router.get(
  '/',
  authHandlingMiddleware.isAuthorized,
  notificationController.getUserNotifications
)

Router.get(
  '/project/:id',
  authHandlingMiddleware.isAuthorized,
  notificationController.getProjectNotifications
)

Router.get(
  '/task/:id',
  authHandlingMiddleware.isAuthorized,
  notificationController.getTaskNotifications
)

Router.put(
  '/:id/read',
  authHandlingMiddleware.isAuthorized,
  notificationController.markAsRead
)

Router.put(
  '/read-all',
  authHandlingMiddleware.isAuthorized,
  notificationController.markAllAsRead
)

export const notificationRoute: express.Router = Router
