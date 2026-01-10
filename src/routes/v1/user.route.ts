import express from 'express'
import { authHandlingMiddleware } from '~/middlewares/authHandling.middleware'
import { userController } from '~/controllers/user.controller'
import { userValidation } from '~/validations/user.validation'
import { CloudinaryProvider } from '~/providers/CloudinaryProvider'

const Router = express.Router()

Router.route('/')
  .get(authHandlingMiddleware.isAuthorized, userController.getProfile)
  .put(
    authHandlingMiddleware.isAuthorized,
    CloudinaryProvider.uploadUser.single('avatar'),
    userValidation.update,
    userController.update
  )
export const userRouter: express.Router = Router
