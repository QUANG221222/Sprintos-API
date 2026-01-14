import { authHandlingMiddleware } from '~/middlewares/authHandling.middleware'
import express from 'express'
import { projectController } from '~/controllers/project.controller'
import { projectValidation } from '~/validations/project.validation'
import { CloudinaryProvider } from '~/providers/CloudinaryProvider'

const Router = express.Router()

Router.route('/').post(
  authHandlingMiddleware.isAuthorized,
  CloudinaryProvider.uploadProjectMemory.single('image'),
  projectValidation.createProject,
  projectController.createProject
)

Router.get(
  '/owned',
  authHandlingMiddleware.isAuthorized,
  projectController.getAllUserOwnedProjects
)

Router.get(
  '/joined',
  authHandlingMiddleware.isAuthorized,
  projectController.getAllUserParticipatedProjects
)

Router.route('/invite').put(
  authHandlingMiddleware.isAuthorized,
  projectValidation.acceptProjectInvitation,
  projectController.acceptProjectInvitation
)

export const projectRouter: express.Router = Router
