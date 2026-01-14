import { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'
import { projectService } from '~/services/project.service'
import {
  CreateProjectResponse,
  CreateProjectRequest,
  GetAllProjectsResponse,
  AcceptProjectInvitationResponse,
  AcceptProjectInvitationRequest
} from '~/types/project.type'

/**
 * Create project controller
 * @param req request with CreateProjectRequest
 * @param res response with CreateProjectResponse
 * @param next handle next middleware
 */
const createProject = async (
  req: Request<{}, {}, CreateProjectRequest, {}>,
  res: Response<CreateProjectResponse>,
  next: NextFunction
) => {
  try {
    const result = await projectService.createNew(req)

    res.status(StatusCodes.CREATED).json({
      message: 'Project created successfully',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Accept project invitation controller
 * @param req request with invitation data
 * @param res response with accepted project data
 * @param next handle next middleware
 */
const acceptProjectInvitation = async (
  req: Request<{}, {}, AcceptProjectInvitationRequest, {}>,
  res: Response<AcceptProjectInvitationResponse>,
  next: NextFunction
) => {
  try {
    const result = await projectService.acceptInvitation(req)

    res.status(StatusCodes.OK).json({
      message: 'Project invitation accepted successfully',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Get all projects controller
 * @param req id of the user
 * @param res response with all projects
 * @param next handle next middleware
 */
const getAllUserOwnedProjects = async (
  req: Request<{}, {}, {}, {}>,
  res: Response<GetAllProjectsResponse>,
  next: NextFunction
) => {
  try {
    const userId = req.jwtDecoded.id
    const projects = await projectService.getAllUserOwnedProjects(userId)
    res.status(StatusCodes.OK).json({
      message: 'Projects retrieved successfully',
      data: projects
    })
  } catch (error) {
    next(error)
  }
}

const getAllUserParticipatedProjects = async (
  req: Request<{}, {}, {}, {}>,
  res: Response<GetAllProjectsResponse>,
  next: NextFunction
) => {
  try {
    const userId = req.jwtDecoded.id
    const projects = await projectService.getAllUserParticipatedProjects(userId)
    res.status(StatusCodes.OK).json({
      message: 'Projects retrieved successfully',
      data: projects
    })
  } catch (error) {
    next(error)
  }
}

export const projectController = {
  createProject,
  acceptProjectInvitation,
  getAllUserOwnedProjects,
  getAllUserParticipatedProjects
}
