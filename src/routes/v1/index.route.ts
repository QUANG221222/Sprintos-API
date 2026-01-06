import express from 'express'
import { authRoute } from './auth.route'

const Router = express.Router()

Router.use('/auth', authRoute)

export const APIs_V1: express.Router = Router
