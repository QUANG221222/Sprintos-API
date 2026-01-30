import { authHandlingMiddleware } from '~/middlewares/authHandling.middleware'
import express from 'express'
import { projectController } from '~/controllers/project.controller'
import { projectValidation } from '~/validations/project.validation'
import { CloudinaryProvider } from '~/providers/CloudinaryProvider'

const Router = express.Router()

Router.route('/')
  .post(
    authHandlingMiddleware.isAuthorized,
    CloudinaryProvider.uploadProjectMemory.single('image'),
    projectValidation.createProject,
    projectController.createProject
  )
  .get(
    authHandlingMiddleware.isAuthorized,
    projectController.getAllProjectsOfUser
  )

Router.route('/:id')
  .put(
    authHandlingMiddleware.isAuthorized,
    CloudinaryProvider.uploadProjectMemory.single('image'),
    projectValidation.updateProject,
    projectController.updateProject
  )
  .delete(
    authHandlingMiddleware.isAuthorized,
    projectController.deleteProjectById
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

Router.get(
  '/all',
  authHandlingMiddleware.isAuthorized,
  projectController.getAllProjectsOfUser
)

Router.get(
  '/:id',
  authHandlingMiddleware.isAuthorized,
  projectController.getProjectById
)

Router.put(
  '/verify/invite',
  authHandlingMiddleware.isAuthorized,
  projectValidation.acceptProjectInvitation,
  projectController.acceptProjectInvitation
)

Router.post(
  '/invite',
  authHandlingMiddleware.isAuthorized,
  projectValidation.inviteMemberToProject,
  projectController.inviteMemberToProject
)

Router.route('/:projectId/:memberId')
  .put(
    authHandlingMiddleware.isAuthorized,
    projectValidation.updateMemberInProject,
    projectController.updateMemberInProject
  )
  .delete(
    authHandlingMiddleware.isAuthorized,
    projectValidation.removeMemberFromProject,
    projectController.removeMemberFromProject
  )

export const projectRouter: express.Router = Router
