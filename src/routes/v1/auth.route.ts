import express from 'express'
import { authController } from '~/controllers/auth.controller'
import { authValidation } from '~/validations/auth.validation'

const Router = express.Router()

Router.post('/register', authValidation.register, authController.register)

export const authRoute: express.Router = Router
