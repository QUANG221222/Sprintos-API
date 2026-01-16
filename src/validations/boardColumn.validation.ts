import { Request, Response, NextFunction } from 'express'
import Joi from 'joi'
import { OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validator'

/**
 * Create board column validation middleware
 * @param req request object
 * @param _res response object
 * @param next next function for error handling
 */
const createBoardColumn = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const correctCondition = Joi.object({
      sprintId: Joi.string()
        .pattern(OBJECT_ID_RULE)
        .message(OBJECT_ID_RULE_MESSAGE)
        .required(),
      title: Joi.string().min(1).max(50).required().required().messages({
        'any.only':
          'Title is required and must be between 1 and 50 characters long',
        'string.min':
          'Title is required and must be between 1 and 50 characters long',
        'string.max':
          'Title is required and must be between 1 and 50 characters long'
      })
    })
    await correctCondition.validateAsync(req.body, { abortEarly: false })
    next()
  } catch (error) {
    next(error)
  }
}

/**
 * Update board column validation middleware
 * @param req request object
 * @param _res response object
 * @param next next function for error handling
 */
const updateBoardColumn = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const correctCondition = Joi.object({
      title: Joi.string().min(1).max(50).optional().messages({
        'string.min': 'Title must be between 1 and 50 characters long',
        'string.max': 'Title must be between 1 and 50 characters long'
      }),
      taskOrderIds: Joi.array()
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

export const boardColumnValidation = {
  createBoardColumn,
  updateBoardColumn
}
