import express from 'express'
import { authHandlingMiddleware } from '~/middlewares/authHandling.middleware'
import { boardColumnController } from '~/controllers/boardColumn.controller'
import { boardColumnValidation } from '~/validations/boardColumn.validation'

const Router = express.Router()

Router.route('/').post(
  authHandlingMiddleware.isAuthorized,
  boardColumnValidation.createBoardColumn,
  boardColumnController.createBoardColumn
)

Router.route('/:id')
  .get(
    authHandlingMiddleware.isAuthorized,
    boardColumnController.getBoardColumnById
  )
  .put(
    authHandlingMiddleware.isAuthorized,
    boardColumnValidation.updateBoardColumn,
    boardColumnController.updateBoardColumn
  )
  .delete(
    authHandlingMiddleware.isAuthorized,
    boardColumnController.deleteBoardColumnById
  )

Router.get(
  '/sprint/:sprintId',
  authHandlingMiddleware.isAuthorized,
  boardColumnController.getAllBoardColumnsBySprintId
)

export const boardColumnRouter: express.Router = Router
