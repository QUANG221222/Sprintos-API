import express from 'express'
import { authRoute } from './auth.route'
import { userRouter } from './user.route'

const Router = express.Router()

Router.use('/auth', authRoute)

Router.use('/users', userRouter)

export const APIs_V1: express.Router = Router
