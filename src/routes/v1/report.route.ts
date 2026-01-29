import express from 'express'
import { authHandlingMiddleware } from '~/middlewares/authHandling.middleware'
import { reportController } from '~/controllers/report.controller'

const Router = express.Router()

Router.get(
  '/sprint/:sprintId/progress',
  authHandlingMiddleware.isAuthorized,
  reportController.getSprintProgressReport
)

Router.get(
  '/project/:projectId/velocity',
  authHandlingMiddleware.isAuthorized,
  reportController.getProjectVelocityReport
)

Router.get(
  '/sprint/:sprintId/member-distribution',
  authHandlingMiddleware.isAuthorized,
  reportController.getSprintMemberDistribution
)

export const reportRoute: express.Router = Router