import ApiError from '~/utils/ApiError'

describe('ApiError', () => {
  test('creates an error instance with statusCode and message', () => {
    // Arrange
    const statusCode = 400
    const message = 'Bad request payload'

    // Act
    const error = new ApiError(statusCode, message)

    // Assert
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.name).toBe('ApiError')
    expect(error.statusCode).toBe(400)
    expect(error.message).toBe('Bad request payload')
  })

  test('captures stack trace when instantiated', () => {
    // Arrange
    const statusCode = 500
    const message = 'Internal server error'

    // Act
    const error = new ApiError(statusCode, message)

    // Assert
    expect(error.stack).toBeDefined()
    expect(error.stack).toContain('ApiError')
  })
})
