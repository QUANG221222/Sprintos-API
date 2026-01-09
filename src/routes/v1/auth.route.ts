import express from 'express'
import { authController } from '~/controllers/auth.controller'
import { authHandlingMiddleware } from '~/middlewares/authHandling.middleware'
import { authValidation } from '~/validations/auth.validation'

const Router = express.Router()

Router.post('/register', authValidation.register, authController.register)

Router.post('/verify', authValidation.verifyEmail, authController.verifyEmail)

Router.post('/login', authValidation.login, authController.login)

Router.post('/refresh-token', authController.refreshToken)

Router.post('/logout', authController.logout)

Router.put(
  '/change-password',
  authHandlingMiddleware.isAuthorized,
  authValidation.changePassword,
  authController.changePassword
)

export const authRoute: express.Router = Router
