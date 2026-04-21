import { jest } from '@jest/globals'

jest.mock('~/providers/JwtProvider', () => ({
  JwtProvider: {
    verifyToken: jest.fn(),
    generateToken: jest.fn()
  }
}))

jest.mock('~/configs/environment', () => ({
  env: {
    REFRESH_TOKEN_SECRET_SIGNATURE: 'refresh-secret',
    REFRESH_TOKEN_LIFE: '7d',
    ACCESS_TOKEN_SECRET_SIGNATURE: 'access-secret',
    ACCESS_TOKEN_LIFE: '15m'
  }
}))

jest.mock('~/utils/constants', () => ({
  WEBSITE_DOMAIN: 'http://frontend.local'
}))

jest.mock('~/models/user.model', () => ({
  userModel: {
    findOneByEmail: jest.fn(),
    findOneById: jest.fn(),
    createNew: jest.fn(),
    update: jest.fn()
  }
}))

jest.mock('~/providers/BrevoProvider', () => ({
  BrevoProvider: {
    sendEmail: jest.fn()
  }
}))

jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: {
    hash: jest.fn(),
    compareSync: jest.fn(),
    hashSync: jest.fn()
  }
}))

jest.mock('uuid', () => ({
  v4: jest.fn()
}))

jest.mock('~/utils/formatter', () => ({
  pickUser: jest.fn()
}))

import { authService } from '~/services/auth.service'
import { JwtProvider } from '~/providers/JwtProvider'
import { userModel } from '~/models/user.model'
import { BrevoProvider } from '~/providers/BrevoProvider'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { pickUser } from '~/utils/formatter'
import ApiError from '~/utils/ApiError'

const mockedJwtProvider = JwtProvider as jest.Mocked<typeof JwtProvider>
const mockedUserModel = userModel as jest.Mocked<typeof userModel>
const mockedBrevoProvider = BrevoProvider as jest.Mocked<typeof BrevoProvider>
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>
const mockedUuidV4 = uuidv4 as jest.MockedFunction<typeof uuidv4>
const mockedPickUser = pickUser as jest.MockedFunction<typeof pickUser>

describe('authService.register', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('throws conflict when email already exists', async () => {
    // Arrange - mock existing user
    const user = {
      _id: 'user-id-1',
      email: 'john@example.com'
    }

    // Act - mock findOneByEmail to return an existing user
    mockedUserModel.findOneByEmail.mockResolvedValue(user as any)

    // Assert - should throw ApiError with 409 status code and "Email already in use" message
    await expect(
      authService.register({
        body: { email: 'john@example.com', password: '123456' }
      } as any)
    ).rejects.toBeInstanceOf(ApiError)

    await expect(
      authService.register({
        body: { email: 'john@example.com', password: '123456' }
      } as any)
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Email already in use'
    })

    expect(mockedUserModel.createNew).not.toHaveBeenCalled()
  })

  test('creates a new user, sends verification email and returns picked user', async () => {
    mockedUserModel.findOneByEmail.mockResolvedValue(null)
    mockedBcrypt.hash.mockResolvedValue('hashed-password' as never)
    mockedUuidV4.mockReturnValue('verify-token-123')
    mockedUserModel.createNew.mockResolvedValue({
      insertedId: 'new-user-id'
    } as any)

    const newUser = {
      _id: 'new-user-id',
      email: 'john@example.com',
      verifyToken: 'verify-token-123'
    }
    mockedUserModel.findOneById.mockResolvedValue(newUser as any)
    mockedPickUser.mockReturnValue({
      _id: 'new-user-id',
      email: 'john@example.com'
    })

    const result = await authService.register({
      body: { email: 'john@example.com', password: '123456' }
    } as any)

    expect(mockedBcrypt.hash).toHaveBeenCalledWith('123456', 8)
    expect(mockedUserModel.createNew).toHaveBeenCalledWith({
      email: 'john@example.com',
      password: 'hashed-password',
      displayName: 'john',
      isActive: false,
      verifyToken: 'verify-token-123'
    })
    expect(mockedBrevoProvider.sendEmail).toHaveBeenCalledTimes(1)
    expect(mockedBrevoProvider.sendEmail).toHaveBeenCalledWith(
      'john@example.com',
      expect.stringContaining('verify your email'),
      expect.stringContaining(
        'http://frontend.local/verification?email=john@example.com&token=verify-token-123'
      )
    )
    expect(mockedPickUser).toHaveBeenCalledWith(newUser)
    expect(result).toEqual({ _id: 'new-user-id', email: 'john@example.com' })
  })

  test('throws internal server error when created user cannot be fetched', async () => {
    mockedUserModel.findOneByEmail.mockResolvedValue(null)
    mockedBcrypt.hash.mockResolvedValue('hashed-password' as never)
    mockedUuidV4.mockReturnValue('verify-token-123')
    mockedUserModel.createNew.mockResolvedValue({
      insertedId: 'new-user-id'
    } as any)
    mockedUserModel.findOneById.mockResolvedValue(null)

    await expect(
      authService.register({
        body: { email: 'john@example.com', password: '123456' }
      } as any)
    ).rejects.toMatchObject({
      statusCode: 500,
      message: 'Failed to retrieve newly created user.'
    })
  })
})

describe('authService.verifyEmail', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('throws not found when user does not exist', async () => {
    mockedUserModel.findOneByEmail.mockResolvedValue(null)

    await expect(
      authService.verifyEmail({
        body: { email: 'john@example.com', token: 'token-1' }
      } as any)
    ).rejects.toMatchObject({ statusCode: 404, message: 'User not found' })
  })

  test('throws not acceptable when user already active', async () => {
    mockedUserModel.findOneByEmail.mockResolvedValue({
      _id: 'user-1',
      email: 'john@example.com',
      isActive: true,
      verifyToken: 'token-1'
    } as any)

    await expect(
      authService.verifyEmail({
        body: { email: 'john@example.com', token: 'token-1' }
      } as any)
    ).rejects.toMatchObject({
      statusCode: 406,
      message: 'User already verified'
    })
  })

  test('throws forbidden when verify token is invalid', async () => {
    mockedUserModel.findOneByEmail.mockResolvedValue({
      _id: 'user-1',
      email: 'john@example.com',
      isActive: false,
      verifyToken: 'expected-token'
    } as any)

    await expect(
      authService.verifyEmail({
        body: { email: 'john@example.com', token: 'wrong-token' }
      } as any)
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Invalid verification token'
    })
  })

  test('throws internal server error when user id is missing', async () => {
    mockedUserModel.findOneByEmail.mockResolvedValue({
      email: 'john@example.com',
      isActive: false,
      verifyToken: 'expected-token'
    } as any)

    await expect(
      authService.verifyEmail({
        body: { email: 'john@example.com', token: 'expected-token' }
      } as any)
    ).rejects.toMatchObject({ statusCode: 500, message: 'User ID is missing' })
  })

  test('updates user to active and returns picked user', async () => {
    mockedUserModel.findOneByEmail.mockResolvedValue({
      _id: 'user-1',
      email: 'john@example.com',
      isActive: false,
      verifyToken: 'expected-token'
    } as any)

    const updatedUser = {
      _id: 'user-1',
      email: 'john@example.com',
      isActive: true,
      verifyToken: ''
    }
    mockedUserModel.update.mockResolvedValue(updatedUser as any)
    mockedPickUser.mockReturnValue({ _id: 'user-1', isActive: true })

    const result = await authService.verifyEmail({
      body: { email: 'john@example.com', token: 'expected-token' }
    } as any)

    expect(mockedUserModel.update).toHaveBeenCalledWith('user-1', {
      isActive: true,
      verifyToken: ''
    })
    expect(mockedPickUser).toHaveBeenCalledWith(updatedUser)
    expect(result).toEqual({ _id: 'user-1', isActive: true })
  })
})

describe('authService.login', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('throws not acceptable when user does not exist', async () => {
    mockedUserModel.findOneByEmail.mockResolvedValue(null)

    await expect(
      authService.login({
        body: { email: 'john@example.com', password: '123456' }
      } as any)
    ).rejects.toMatchObject({
      statusCode: 406,
      message: 'Your Email or Password is incorrect!'
    })
  })

  test('throws not acceptable when account is not active', async () => {
    mockedUserModel.findOneByEmail.mockResolvedValue({
      _id: 'user-1',
      email: 'john@example.com',
      isActive: false,
      password: 'hashed'
    } as any)

    await expect(
      authService.login({
        body: { email: 'john@example.com', password: '123456' }
      } as any)
    ).rejects.toMatchObject({
      statusCode: 406,
      message: 'Your account is not active! Please verify your email!'
    })
  })

  test('throws not acceptable when password does not match', async () => {
    mockedUserModel.findOneByEmail.mockResolvedValue({
      _id: 'user-1',
      email: 'john@example.com',
      role: 'user',
      isActive: true,
      password: 'hashed'
    } as any)
    mockedBcrypt.compareSync.mockReturnValue(false)

    await expect(
      authService.login({
        body: { email: 'john@example.com', password: 'wrong' }
      } as any)
    ).rejects.toMatchObject({
      statusCode: 406,
      message: 'Your Email of Password is incorrect!'
    })
  })

  test('returns user info with access and refresh token on success', async () => {
    const existingUser = {
      _id: 'user-1',
      email: 'john@example.com',
      role: 'user',
      isActive: true,
      password: 'hashed-password'
    }
    mockedUserModel.findOneByEmail.mockResolvedValue(existingUser as any)
    mockedBcrypt.compareSync.mockReturnValue(true)
    mockedJwtProvider.generateToken
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token')
    mockedPickUser.mockReturnValue({ _id: 'user-1', email: 'john@example.com' })

    const result = await authService.login({
      body: { email: 'john@example.com', password: '123456' }
    } as any)

    expect(mockedJwtProvider.generateToken).toHaveBeenNthCalledWith(
      1,
      {
        id: 'user-1',
        email: 'john@example.com',
        role: 'user'
      },
      'access-secret',
      '15m'
    )
    expect(mockedJwtProvider.generateToken).toHaveBeenNthCalledWith(
      2,
      {
        id: 'user-1',
        email: 'john@example.com',
        role: 'user'
      },
      'refresh-secret',
      '7d'
    )
    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      _id: 'user-1',
      email: 'john@example.com'
    })
  })
})

describe('authService.refreshToken', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('verifies refresh token and returns a new access token', async () => {
    mockedJwtProvider.verifyToken.mockReturnValue({
      id: 'user-1',
      email: 'john@example.com',
      role: 'user'
    })
    mockedJwtProvider.generateToken.mockResolvedValue('new-access-token')

    const result = await authService.refreshToken('valid-refresh-token')

    expect(mockedJwtProvider.verifyToken).toHaveBeenCalledWith(
      'valid-refresh-token',
      'refresh-secret'
    )
    expect(mockedJwtProvider.generateToken).toHaveBeenCalledWith(
      {
        id: 'user-1',
        email: 'john@example.com',
        role: 'user'
      },
      'access-secret',
      '15m'
    )
    expect(result).toEqual({ accessToken: 'new-access-token' })
  })

  test('throws error when token verification fails', async () => {
    const verifyError = new Error('invalid token')
    mockedJwtProvider.verifyToken.mockImplementation(() => {
      throw verifyError
    })

    await expect(authService.refreshToken('bad-token')).rejects.toThrow(
      'invalid token'
    )
    expect(mockedJwtProvider.generateToken).not.toHaveBeenCalled()
  })
})

describe('authService.changePassword', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('throws not found when user does not exist', async () => {
    mockedUserModel.findOneById.mockResolvedValue(null)

    await expect(
      authService.changePassword({
        body: { oldPassword: 'old-123', newPassword: 'new-123' },
        jwtDecoded: { id: 'user-1' }
      } as any)
    ).rejects.toMatchObject({ statusCode: 404, message: 'User not found' })
  })

  test('throws not acceptable when old password is incorrect', async () => {
    mockedUserModel.findOneById.mockResolvedValue({
      _id: 'user-1',
      password: 'hashed-old-password'
    } as any)
    mockedBcrypt.compareSync.mockReturnValue(false)

    await expect(
      authService.changePassword({
        body: { oldPassword: 'old-123', newPassword: 'new-123' },
        jwtDecoded: { id: 'user-1' }
      } as any)
    ).rejects.toMatchObject({
      statusCode: 406,
      message: 'Your old password is incorrect!'
    })
  })

  test('updates password and returns picked user', async () => {
    mockedUserModel.findOneById.mockResolvedValue({
      _id: 'user-1',
      password: 'hashed-old-password'
    } as any)
    mockedBcrypt.compareSync.mockReturnValue(true)
    mockedBcrypt.hashSync.mockReturnValue('hashed-new-password')
    const updatedUser = {
      _id: 'user-1',
      email: 'john@example.com',
      password: 'hashed-new-password'
    }
    mockedUserModel.update.mockResolvedValue(updatedUser as any)
    mockedPickUser.mockReturnValue({ _id: 'user-1', email: 'john@example.com' })

    const result = await authService.changePassword({
      body: { oldPassword: 'old-123', newPassword: 'new-123' },
      jwtDecoded: { id: 'user-1' }
    } as any)

    expect(mockedBcrypt.hashSync).toHaveBeenCalledWith('new-123', 10)
    expect(mockedUserModel.update).toHaveBeenCalledWith('user-1', {
      password: 'hashed-new-password'
    })
    expect(result).toEqual({ _id: 'user-1', email: 'john@example.com' })
  })
})
