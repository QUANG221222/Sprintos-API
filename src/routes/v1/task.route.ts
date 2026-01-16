import express from 'express'
import { authHandlingMiddleware } from '~/middlewares/authHandling.middleware'
import { taskController } from '~/controllers/task.controller'
import { taskValidation } from '~/validations/task.validation'

const Router = express.Router()

Router.route('/').post(
  authHandlingMiddleware.isAuthorized,
  taskValidation.createTask,
  taskController.createTask
)

Router.route('/:id')
  .get(authHandlingMiddleware.isAuthorized, taskController.getTaskById)
  .put(
    authHandlingMiddleware.isAuthorized,
    taskValidation.updateTask,
    taskController.updateTask
  )
  .delete(authHandlingMiddleware.isAuthorized, taskController.deleteTaskById)

Router.get(
  '/sprint/:sprintId',
  authHandlingMiddleware.isAuthorized,
  taskController.getAllTasksBySprintId
)

Router.get(
  '/board-column/:boardColumnId',
  authHandlingMiddleware.isAuthorized,
  taskController.getAllTasksByBoardColumnId
)

Router.post(
  '/:id/comments',
  authHandlingMiddleware.isAuthorized,
  taskValidation.addComment,
  taskController.addCommentToTask
)

Router.post(
  '/:id/attachments',
  authHandlingMiddleware.isAuthorized,
  taskValidation.addAttachment,
  taskController.addAttachmentToTask
)

export const taskRoute: express.Router = Router
