import express from 'express'
import { authController } from '~/controllers/auth.controller'
import { authValidation } from '~/validations/auth.validation'

const Router = express.Router()

Router.post('/register', authValidation.register, authController.register)

Router.post('/verify', authValidation.verifyEmail, authController.verifyEmail)

Router.post('/login', authValidation.login, authController.login)

Router.post('/refresh-token', authController.refreshToken)

Router.post('/logout', authController.logout)

export const authRoute: express.Router = Router
