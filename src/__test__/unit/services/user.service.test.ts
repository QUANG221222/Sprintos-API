import { jest } from '@jest/globals'

jest.mock('~/models/user.model', () => ({
  userModel: {
    findOneById: jest.fn(),
    update: jest.fn()
  }
}))

jest.mock('~/utils/formatter', () => ({
  pickUser: jest.fn()
}))

jest.mock('~/providers/CloudinaryProvider', () => ({
  CloudinaryProvider: {
    deleteImage: jest.fn()
  }
}))

import { userService } from '~/services/user.service'
import { userModel } from '~/models/user.model'
import { pickUser } from '~/utils/formatter'
import { CloudinaryProvider } from '~/providers/CloudinaryProvider'

const mockedUserModel = userModel as jest.Mocked<typeof userModel>
const mockedPickUser = pickUser as jest.MockedFunction<typeof pickUser>
const mockedCloudinaryProvider = CloudinaryProvider as jest.Mocked<
  typeof CloudinaryProvider
>

describe('userService.getProfile', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('throws not found when user does not exist', async () => {
    // Arrange
    mockedUserModel.findOneById.mockResolvedValue(null)

    // Act + Assert
    await expect(
      userService.getProfile({ jwtDecoded: { id: 'user-1' } } as any)
    ).rejects.toMatchObject({ statusCode: 404, message: 'User not found' })
  })

  test('returns picked profile when user exists', async () => {
    // Arrange
    const user = { _id: 'user-1', email: 'john@example.com' }
    mockedUserModel.findOneById.mockResolvedValue(user as any)
    mockedPickUser.mockReturnValue({ _id: 'user-1', email: 'john@example.com' })

    // Act
    const result = await userService.getProfile({
      jwtDecoded: { id: 'user-1' }
    } as any)

    // Assert
    expect(mockedPickUser).toHaveBeenCalledWith(user)
    expect(result).toEqual({ _id: 'user-1', email: 'john@example.com' })
  })
})

describe('userService.update', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('throws not found when user does not exist', async () => {
    // Arrange
    mockedUserModel.findOneById.mockResolvedValue(null)

    // Act + Assert
    await expect(
      userService.update({ jwtDecoded: { id: 'user-1' }, body: {} } as any)
    ).rejects.toMatchObject({ statusCode: 404, message: 'User not found' })
  })

  test('updates user and handles avatar replacement when file is provided', async () => {
    // Arrange
    mockedUserModel.findOneById.mockResolvedValue({
      _id: 'user-1',
      avatarPublicId: 'old-public-id'
    } as any)
    mockedUserModel.update.mockResolvedValue({
      _id: 'user-1',
      displayName: 'John Updated'
    } as any)
    mockedPickUser.mockReturnValue({
      _id: 'user-1',
      displayName: 'John Updated'
    })

    const req = {
      jwtDecoded: { id: 'user-1' },
      body: { displayName: 'John Updated' },
      file: {
        path: 'https://cdn.example.com/new-avatar.png',
        filename: 'new-public-id'
      }
    } as any

    // Act
    const result = await userService.update(req)

    // Assert
    expect(mockedCloudinaryProvider.deleteImage).toHaveBeenCalledWith(
      'old-public-id'
    )
    expect(mockedUserModel.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        displayName: 'John Updated',
        avatar: 'https://cdn.example.com/new-avatar.png',
        avatarPublicId: 'new-public-id'
      })
    )
    expect(result).toEqual({ _id: 'user-1', displayName: 'John Updated' })
  })
})
