import { Request, Response, NextFunction } from 'express'
import Joi from 'joi'
import { OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validator'

/**
 * Create sprint validation middleware
 * @param req request object
 * @param _res response object
 * @param next next function for error handling
 */
const createSprint = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const correctCondition = Joi.object({
      projectId: Joi.string()
        .pattern(OBJECT_ID_RULE)
        .message(OBJECT_ID_RULE_MESSAGE)
        .required(),
      name: Joi.string().min(3).max(100).required().messages({
        'string.empty': 'Sprint name is required',
        'string.min': 'Sprint name must be at least 3 characters',
        'string.max': 'Sprint name must be at most 100 characters'
      }),
      goal: Joi.string().max(500).optional().allow('').messages({
        'string.max': 'Goal must be at most 500 characters'
      }),
      maxStoryPoint: Joi.number().min(0).optional().messages({
        'number.min': 'Max story point must be at least 0'
      }),
      startDate: Joi.date().optional(),
      endDate: Joi.date().optional().greater(Joi.ref('startDate')).messages({
        'date.greater': 'End date must be after start date'
      })
    })
    await correctCondition.validateAsync(req.body, { abortEarly: false })
    next()
  } catch (error) {
    next(error)
  }
}

/**
 * Update sprint validation middleware
 * @param req request object
 * @param _res response object
 * @param next next function for error handling
 */
const updateSprint = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const correctCondition = Joi.object({
      name: Joi.string().min(3).max(100).optional().messages({
        'string.min': 'Sprint name must be at least 3 characters',
        'string.max': 'Sprint name must be at most 100 characters'
      }),
      goal: Joi.string().max(500).optional().allow('').messages({
        'string.max': 'Goal must be at most 500 characters'
      }),
      maxStoryPoint: Joi.number().min(0).optional().messages({
        'number.min': 'Max story point must be at least 0'
      }),
      startDate: Joi.date().optional(),
      endDate: Joi.date().optional(),
      status: Joi.string()
        .valid('planned', 'active', 'completed')
        .optional()
        .messages({
          'any.only': 'Status must be planned, active, or completed'
        })
    })
    await correctCondition.validateAsync(req.body, { abortEarly: false })
    next()
  } catch (error) {
    next(error)
  }
}

export const sprintValidation = {
  createSprint,
  updateSprint
}
