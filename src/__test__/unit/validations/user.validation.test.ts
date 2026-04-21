import { jest } from '@jest/globals'
import { userValidation } from '~/validations/user.validation'

describe('userValidation', () => {
  test('update calls next for valid payload', async () => {
    // Arrange
    const req = {
      body: {
        displayName: 'John Doe',
        gender: 'male',
        dob: '2000-01-01',
        address: 'HCM City'
      }
    } as any
    const next = jest.fn()

    // Act
    await userValidation.update(req, {} as any, next)

    // Assert
    expect(next).toHaveBeenCalledWith()
  })

  test('update passes ApiError when dob is in the future', async () => {
    // Arrange
    const req = {
      body: {
        displayName: 'John Doe',
        dob: '2099-01-01'
      }
    } as any
    const next = jest.fn()

    // Act
    await userValidation.update(req, {} as any, next)

    // Assert
    const error = next.mock.calls[0][0] as any
    expect(error).toMatchObject({ statusCode: 422 })
    expect(error.message).toContain('Date of birth cannot be in the future')
  })
})
