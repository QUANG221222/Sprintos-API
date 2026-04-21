import { jest } from '@jest/globals'
import { authValidation } from '~/validations/auth.validation'

describe('authValidation', () => {
  test('register calls next without error for valid payload', async () => {
    // Arrange
    const req = {
      body: { email: 'john@example.com', password: 'Strong@123' }
    } as any
    const next = jest.fn()

    // Act
    await authValidation.register(req, {} as any, next)

    // Assert
    expect(next).toHaveBeenCalledWith()
  })

  test('register passes ApiError when payload is invalid', async () => {
    // Arrange
    const req = {
      body: { email: 'invalid-email', password: 'weak' }
    } as any
    const next = jest.fn()

    // Act
    await authValidation.register(req, {} as any, next)

    // Assert
    const error = next.mock.calls[0][0] as any
    expect(error).toMatchObject({ statusCode: 422 })
    expect(error.message).toContain('Email is invalid')
  })

  test('verifyEmail calls next without error for valid payload', async () => {
    // Arrange
    const req = {
      body: { email: 'john@example.com', token: 'token-1' }
    } as any
    const next = jest.fn()

    // Act
    await authValidation.verifyEmail(req, {} as any, next)

    // Assert
    expect(next).toHaveBeenCalledWith()
  })

  test('login passes ApiError when password is invalid', async () => {
    // Arrange
    const req = {
      body: { email: 'john@example.com', password: 'weak' }
    } as any
    const next = jest.fn()

    // Act
    await authValidation.login(req, {} as any, next)

    // Assert
    const error = next.mock.calls[0][0] as any
    expect(error).toMatchObject({ statusCode: 422 })
    expect(error.message).toContain('Password must be 8-256 characters')
  })

  test('changePassword calls next without error for valid payload', async () => {
    // Arrange
    const req = {
      body: { oldPassword: 'Oldpass@123', newPassword: 'Newpass@123' }
    } as any
    const next = jest.fn()

    // Act
    await authValidation.changePassword(req, {} as any, next)

    // Assert
    expect(next).toHaveBeenCalledWith()
  })
})
