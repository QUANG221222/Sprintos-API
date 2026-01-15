import express from 'express'
import { authHandlingMiddleware } from '~/middlewares/authHandling.middleware'
import { sprintController } from '~/controllers/sprint.controller'
import { sprintValidation } from '~/validations/sprint.validation'

const Router = express.Router()

Router.route('/').post(
  authHandlingMiddleware.isAuthorized,
  sprintValidation.createSprint,
  sprintController.createSprint
)

Router.route('/:id')
  .get(authHandlingMiddleware.isAuthorized, sprintController.getSprintById)
  .put(
    authHandlingMiddleware.isAuthorized,
    sprintValidation.updateSprint,
    sprintController.updateSprint
  )
  .delete(
    authHandlingMiddleware.isAuthorized,
    sprintController.deleteSprintById
  )

Router.get(
  '/project/:projectId',
  authHandlingMiddleware.isAuthorized,
  sprintController.getAllSprintsByProjectId
)

export const sprintRoute: express.Router = Router
