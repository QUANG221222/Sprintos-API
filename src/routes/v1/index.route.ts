import express from 'express'
import { authRoute } from './auth.route'
import { userRouter } from './user.route'
import { projectRouter } from './project.route'
import { sprintRoute } from './sprint.route'
import { boardColumnRouter } from './boardColumn.route'

const Router = express.Router()

Router.use('/auth', authRoute)

Router.use('/users', userRouter)

Router.use('/projects', projectRouter)

Router.use('/sprints', sprintRoute)

Router.use('/board-columns', boardColumnRouter)

export const APIs_V1: express.Router = Router
