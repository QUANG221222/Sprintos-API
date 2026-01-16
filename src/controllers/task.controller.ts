import { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'
import { taskService } from '~/services/task.service'
import {
  CreateTaskRequest,
  CreateTaskResponse,
  UpdateTaskResponse,
  GetTaskResponse,
  GetAllTasksResponse,
  AddCommentResponse,
  AddAttachmentResponse
} from '~/types/task.type'

/**
 * Create task controller
 * @param req request with CreateTaskRequest
 * @param res response with CreateTaskResponse
 * @param next handle next middleware
 */
const createTask = async (
  req: Request<{}, {}, CreateTaskRequest, {}>,
  res: Response<CreateTaskResponse>,
  next: NextFunction
) => {
  try {
    const result = await taskService.createNew(req)

    res.status(StatusCodes.CREATED).json({
      message: 'Task created successfully',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Get task by id controller
 * @param req request with task id
 * @param res response with task data
 * @param next handle next middleware
 */
const getTaskById = async (
  req: Request,
  res: Response<GetTaskResponse>,
  next: NextFunction
) => {
  try {
    const result = await taskService.getTaskById(req)

    res.status(StatusCodes.OK).json({
      message: 'Task retrieved successfully',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Get all tasks by sprint id controller
 * @param req request with sprint id
 * @param res response with all tasks
 * @param next handle next middleware
 */
const getAllTasksBySprintId = async (
  req: Request,
  res: Response<GetAllTasksResponse>,
  next: NextFunction
) => {
  try {
    const tasks = await taskService.getAllTasksBySprintId(req)

    res.status(StatusCodes.OK).json({
      message: 'Tasks retrieved successfully',
      data: tasks
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Get all tasks by board column id controller
 * @param req request with board column id
 * @param res response with all tasks
 * @param next handle next middleware
 */
const getAllTasksByBoardColumnId = async (
  req: Request,
  res: Response<GetAllTasksResponse>,
  next: NextFunction
) => {
  try {
    const tasks = await taskService.getAllTasksByBoardColumnId(req)

    res.status(StatusCodes.OK).json({
      message: 'Tasks retrieved successfully',
      data: tasks
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Update task controller
 * @param req request with task id and update data
 * @param res response with updated task data
 * @param next handle next middleware
 */
const updateTask = async (
  req: Request,
  res: Response<UpdateTaskResponse>,
  next: NextFunction
) => {
  try {
    const result = await taskService.updateTask(req)

    res.status(StatusCodes.OK).json({
      message: 'Task updated successfully',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Delete task controller
 * @param req request with task id
 * @param res response with success message
 * @param next handle next middleware
 */
const deleteTaskById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await taskService.deleteTaskById(req)

    res.status(StatusCodes.OK).json({
      message: 'Task deleted successfully'
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Add comment to task controller
 * @param req request with task id and comment data
 * @param res response with updated task data
 * @param next handle next middleware
 */
const addCommentToTask = async (
  req: Request,
  res: Response<AddCommentResponse>,
  next: NextFunction
) => {
  try {
    const result = await taskService.addCommentToTask(req)

    res.status(StatusCodes.OK).json({
      message: 'Comment added successfully',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Add attachment to task controller
 * @param req request with task id and attachment data
 * @param res response with updated task data
 * @param next handle next middleware
 */
const addAttachmentToTask = async (
  req: Request,
  res: Response<AddAttachmentResponse>,
  next: NextFunction
) => {
  try {
    const result = await taskService.addAttachmentToTask(req)

    res.status(StatusCodes.OK).json({
      message: 'Attachment added successfully',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

export const taskController = {
  createTask,
  getTaskById,
  getAllTasksBySprintId,
  getAllTasksByBoardColumnId,
  updateTask,
  deleteTaskById,
  addCommentToTask,
  addAttachmentToTask
}
