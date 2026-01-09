import JWT from 'jsonwebtoken'

/**
 * Generate JWT Token
 * @param userInfo user information to be included in the token payload
 * @param secretSignature secret key used to sign the token
 * @param tokenLife token expiration time
 * @returns
 */
const generateToken = async (
  userInfo: any,
  secretSignature: JWT.Secret,
  tokenLife: string | number
): Promise<string> => {
  try {
    const options: JWT.SignOptions = {
      algorithm: 'HS256', // Default algorithm
      expiresIn: tokenLife as JWT.SignOptions['expiresIn']
    }
    return JWT.sign(userInfo, secretSignature, options)
  } catch (error: any) {
    throw new Error(`Error generating token: ${error.message}`)
  }
}

/**
 * Verify JWT Token
 * @param token token string to be verified
 * @param secretSignature secret key used to verify the token
 * @returns decoded token payload
 */
const verifyToken = (token: string, secretSignature: JWT.Secret) => {
  try {
    return JWT.verify(token, secretSignature)
  } catch (error: any) {
    throw new Error(`Error verifying token: ${error.message}`)
  }
}

export const JwtProvider = {
  generateToken,
  verifyToken
}
