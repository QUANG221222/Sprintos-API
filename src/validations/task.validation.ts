import { Request, Response, NextFunction } from 'express'
import Joi from 'joi'
import { OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validator'

/**
 * Create task validation middleware
 * @param req request object
 * @param _res response object
 * @param next next function for error handling
 */
const createTask = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const correctCondition = Joi.object({
      sprintId: Joi.string()
        .pattern(OBJECT_ID_RULE)
        .message(OBJECT_ID_RULE_MESSAGE)
        .required(),
      boardColumnId: Joi.string()
        .pattern(OBJECT_ID_RULE)
        .message(OBJECT_ID_RULE_MESSAGE)
        .optional(),
      title: Joi.string().min(1).max(200).required().messages({
        'string.empty': 'Task title is required',
        'string.min': 'Task title must be at least 1 character',
        'string.max': 'Task title must be at most 200 characters'
      }),
      description: Joi.string().max(2000).optional().allow('').messages({
        'string.max': 'Description must be at most 2000 characters'
      }),
      labels: Joi.array().items(
        Joi.string().min(1).max(50).optional().messages({
          'string.min': 'Each label must be at least 1 character',
          'string.max': 'Each label must be at most 50 characters'
        })
      ),
      priority: Joi.string()
        .valid('low', 'medium', 'high', 'critical')
        .optional()
        .messages({
          'any.only': 'Priority must be low, medium, high, or critical'
        }),
      storyPoint: Joi.number().min(1).required().messages({
        'number.min': 'Story point must be at least 1'
      }),
      dueDate: Joi.date().optional(),
      assigneeIds: Joi.array()
        .items(
          Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE)
        )
        .optional()
    })
    await correctCondition.validateAsync(req.body, { abortEarly: false })
    next()
  } catch (error) {
    next(error)
  }
}

/**
 * Update task validation middleware
 * @param req request object
 * @param _res response object
 * @param next next function for error handling
 */
const updateTask = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const correctCondition = Joi.object({
      title: Joi.string().min(1).max(200).optional().messages({
        'string.min': 'Task title must be at least 1 character',
        'string.max': 'Task title must be at most 200 characters'
      }),
      description: Joi.string().max(2000).optional().allow('').messages({
        'string.max': 'Description must be at most 2000 characters'
      }),
      labels: Joi.array().items(
        Joi.string().min(1).max(50).optional().messages({
          'string.min': 'Each label must be at least 1 character',
          'string.max': 'Each label must be at most 50 characters'
        })
      ),
      priority: Joi.string()
        .valid('low', 'medium', 'high', 'critical')
        .optional()
        .messages({
          'any.only': 'Priority must be low, medium, high, or critical'
        }),
      storyPoint: Joi.number().min(0).optional().messages({
        'number.min': 'Story point must be at least 0'
      }),
      dueDate: Joi.date().optional(),
      assigneeIds: Joi.array()
        .items(
          Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE)
        )
        .optional(),
      boardColumnId: Joi.string()
        .pattern(OBJECT_ID_RULE)
        .message(OBJECT_ID_RULE_MESSAGE)
        .optional()
    })
    await correctCondition.validateAsync(req.body, { abortEarly: false })
    next()
  } catch (error) {
    next(error)
  }
}

/**
 * Add comment validation middleware
 * @param req request object
 * @param _res response object
 * @param next next function for error handling
 */
const addComment = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const correctCondition = Joi.object({
      content: Joi.string().min(1).max(1000).required().messages({
        'string.empty': 'Comment content is required',
        'string.min': 'Comment must be at least 1 character',
        'string.max': 'Comment must be at most 1000 characters'
      })
    })
    await correctCondition.validateAsync(req.body, { abortEarly: false })
    next()
  } catch (error) {
    next(error)
  }
}

/**
 * Add attachment validation middleware
 * @param req request object
 * @param _res response object
 * @param next next function for error handling
 */
const addAttachment = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const correctCondition = Joi.object({
      fileName: Joi.string().required().messages({
        'string.empty': 'File name is required'
      }),
      fileType: Joi.string().required().messages({
        'string.empty': 'File type is required'
      }),
      fileUrl: Joi.string().uri().required().messages({
        'string.empty': 'File URL is required',
        'string.uri': 'File URL must be a valid URL'
      })
    })
    await correctCondition.validateAsync(req.body, { abortEarly: false })
    next()
  } catch (error) {
    next(error)
  }
}

export const taskValidation = {
  createTask,
  updateTask,
  addComment,
  addAttachment
}
