import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { env } from '~/configs/environment'
export const errorHandlingMiddleware = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  //// If the developer forgets to set statusCode, default to 500 INTERNAL_SERVER_ERROR

  if (!err.statusCode) err.statusCode = StatusCodes.INTERNAL_SERVER_ERROR

  // Create a variable responseError to control the response
  const responseError = {
    statusCode: err.statusCode,
    message: err.message || StatusCodes[err.statusCode],
    stack: err.stack
  }

  // If Build Mode is not 'dev', remove the stack trace from the response
  if (env.BUILD_MODE !== 'dev') delete responseError.stack

  // Send the error response
  res.status(responseError.statusCode).json(responseError)
}
