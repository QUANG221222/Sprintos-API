import { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'
import { reportService } from '~/services/report.service'
import {
  GetSprintProgressReportResponse,
  GetProjectVelocityReportResponse,
  GetSprintMemberDistributionResponse
} from '~/types/report.type'

/**
 * Get sprint progress report controller
 * @param req request with sprint id
 * @param res response with progress report data
 * @param next handle next middleware
 */
const getSprintProgressReport = async (
  req: Request,
  res: Response<GetSprintProgressReportResponse>,
  next: NextFunction
) => {
  try {
    const result = await reportService.getSprintProgressReport(req)

    res.status(StatusCodes.OK).json({
      message: 'Sprint progress report generated successfully',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Get project velocity report controller
 * @param req request with project id
 * @param res response with velocity report data
 * @param next handle next middleware
 */
const getProjectVelocityReport = async (
  req: Request,
  res: Response<GetProjectVelocityReportResponse>,
  next: NextFunction
) => {
  try {
    const result = await reportService.getProjectVelocityReport(req)

    res.status(StatusCodes.OK).json({
      message: 'Project velocity report generated successfully',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Get sprint member distribution report controller
 * @param req request with sprint id
 * @param res response with member distribution data
 * @param next handle next middleware
 */
const getSprintMemberDistribution = async (
  req: Request,
  res: Response<GetSprintMemberDistributionResponse>,
  next: NextFunction
) => {
  try {
    const result = await reportService.getSprintMemberDistribution(req)

    res.status(StatusCodes.OK).json({
      message: 'Sprint member distribution report generated successfully',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

export const reportController = {
  getSprintProgressReport,
  getProjectVelocityReport,
  getSprintMemberDistribution
}