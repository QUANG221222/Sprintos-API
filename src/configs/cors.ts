import { env } from '~/configs/environment'
import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'
import { WHITELIST_DOMAINS } from '~/utils/constants'

export const corsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) => {
    if (env.BUILD_MODE === 'dev') {
      return callback(null, true)
    }

    if (WHITELIST_DOMAINS.includes(origin)) {
      return callback(null, true)
    }

    return callback(
      new ApiError(
        StatusCodes.FORBIDDEN,
        `${origin} not allowed by our CORS Policy`
      )
    )
  },
  credentials: true
}
