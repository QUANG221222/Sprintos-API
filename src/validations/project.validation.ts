import { Request, Response, NextFunction } from 'express'
import Joi from 'joi'
import {
  EMAIL_RULE,
  EMAIL_RULE_MESSAGE,
  OBJECT_ID_RULE,
  OBJECT_ID_RULE_MESSAGE
} from '~/utils/validator'

/**
 * Create project validation middleware
 * @param req - CreateProjectRequest object
 * @param _res - CreateProjectResponse object
 * @param next -  NextFunction for error handling
 */
const createProject = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const correctCondition = Joi.object({
      name: Joi.string().min(3).max(100).required().messages({
        'string.empty': 'Project name is required',
        'string.min': 'Project name must be at least 3 characters',
        'string.max': 'Project name must be at most 100 characters'
      }),
      description: Joi.string().max(500).optional().allow('').messages({
        'string.max': 'Description must be at most 500 characters'
      }),
      members: Joi.array()
        .items(
          Joi.object({
            email: Joi.string()
              .pattern(EMAIL_RULE)
              .message(EMAIL_RULE_MESSAGE)
              .required(),
            role: Joi.string()
              .valid('owner', 'member', 'viewer')
              .default('member')
              .required()
              .messages({
                'any.only': 'Role must be one of owner, member, or viewer'
              })
          })
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
 * Accept project invitation validation middleware
 * @param req request object
 * @param _res response object
 * @param next next function for error handling
 */
const acceptProjectInvitation = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const correctCondition = Joi.object({
      email: Joi.string()
        .pattern(EMAIL_RULE)
        .message(EMAIL_RULE_MESSAGE)
        .required(),
      token: Joi.string().required(),
      projectId: Joi.string()
        .pattern(OBJECT_ID_RULE)
        .message(OBJECT_ID_RULE_MESSAGE)
        .required()
    })
    await correctCondition.validateAsync(req.body, { abortEarly: false })
    next()
  } catch (error) {
    next(error)
  }
}
export const projectValidation = { createProject, acceptProjectInvitation }
