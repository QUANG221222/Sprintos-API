import Joi from 'joi'
import { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'

const update = async (req: Request, _res: Response, next: NextFunction) => {
  const correctCondition = Joi.object({
    displayName: Joi.string().min(3).max(100).optional().messages({
      'string.min': 'Display name must be at least 3 characters long',
      'string.max': 'Display name must be at most 100 characters long'
    }),
    gender: Joi.string().valid('male', 'female', 'other').optional(),
    dob: Joi.date().optional().max('now').messages({
      'date.max': 'Date of birth cannot be in the future'
    }),
    address: Joi.string().max(200).optional().messages({
      'string.max': 'Address must be at most 200 characters long'
    })
  })
  try {
    await correctCondition.validateAsync(req.body, { abortEarly: false })
    next()
  } catch (error: any) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

export const userValidation = {
  update
}
