import { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'
import { projectService } from '~/services/project.service'
import {
  CreateProjectResponse,
  CreateProjectRequest,
  GetAllProjectsResponse,
  AcceptProjectInvitationResponse,
  AcceptProjectInvitationRequest,
  UpdateProjectResponse
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

/**
 * Get all participated projects controller
 * @param req request object
 * @param res response with all participated projects
 * @param next handle next middleware
 */
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

/**
 * Update project controller
 * @param req id of the project and update data
 * @param res response with updated project data
 * @param next handle next middleware
 */
const updateProject = async (
  req: Request<{ id: string }, {}, {}, {}>,
  res: Response<UpdateProjectResponse>,
  next: NextFunction
) => {
  try {
    const result = await projectService.updateProject(req)

    res.status(StatusCodes.OK).json({
      message: 'Project updated successfully',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Delete project controller
 * @param req id of the project to be deleted
 * @param res result of deletion
 * @param next handle next middleware
 */
const deleteProjectById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await projectService.deleteProjectById(req)

    res.status(StatusCodes.OK).json({
      message: 'Project deleted successfully'
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Invite member to project controller
 * @param req request with project id, email and role
 * @param res response with updated project data
 * @param next handle next middleware
 */
const inviteMemberToProject = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await projectService.inviteMemberToProject(req)

    res.status(StatusCodes.OK).json({
      message: 'Member invited successfully',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Update member in project controller
 * @param req request with project id, member id and new role
 * @param res response with updated project data
 * @param next handle next middleware
 */
const updateMemberInProject = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await projectService.updateMemberInProject(req)

    res.status(StatusCodes.OK).json({
      message: 'Member role updated successfully',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Remove member from project controller
 * @param req request with project id and member id
 * @param res response with success message
 * @param next handle next middleware
 */
const removeMemberFromProject = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await projectService.removeMemberFromProject(req)

    res.status(StatusCodes.OK).json({
      message: 'Member removed successfully'
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Get project by id controller
 * @param req request with project id
 * @param res response with project data
 * @param next handle next middleware
 */
const getProjectById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await projectService.getProjectById(req)
    res.status(StatusCodes.OK).json({
      message: 'Project retrieved successfully',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

export const projectController = {
  createProject,
  acceptProjectInvitation,
  getAllUserOwnedProjects,
  getAllUserParticipatedProjects,
  updateProject,
  deleteProjectById,
  inviteMemberToProject,
  updateMemberInProject,
  removeMemberFromProject,
  getProjectById
}
