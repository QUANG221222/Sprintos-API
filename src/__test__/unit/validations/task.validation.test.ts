import { jest } from '@jest/globals'
import { taskValidation } from '~/validations/task.validation'

describe('taskValidation', () => {
  test('createTask calls next for valid payload', async () => {
    // Arrange
    const req = {
      body: {
        sprintId: '507f1f77bcf86cd799439011',
        title: 'Implement login',
        storyPoint: 3,
        assigneeIds: ['507f1f77bcf86cd799439012']
      }
    } as any
    const next = jest.fn()

    // Act
    await taskValidation.createTask(req, {} as any, next)

    // Assert
    expect(next).toHaveBeenCalledWith()
  })

  test('createTask passes error when storyPoint is invalid', async () => {
    // Arrange
    const req = {
      body: {
        sprintId: '507f1f77bcf86cd799439011',
        title: 'Implement login',
        storyPoint: 0
      }
    } as any
    const next = jest.fn()

    // Act
    await taskValidation.createTask(req, {} as any, next)

    // Assert
    const error = next.mock.calls[0][0] as any
    expect(error.message).toContain('Story point must be at least 1')
  })

  test('updateTask calls next for valid payload', async () => {
    // Arrange
    const req = { body: { priority: 'high', storyPoint: 8 } } as any
    const next = jest.fn()

    // Act
    await taskValidation.updateTask(req, {} as any, next)

    // Assert
    expect(next).toHaveBeenCalledWith()
  })

  test('addComment calls next for valid payload', async () => {
    // Arrange
    const req = { body: { content: 'Looks good' } } as any
    const next = jest.fn()

    // Act
    await taskValidation.addComment(req, {} as any, next)

    // Assert
    expect(next).toHaveBeenCalledWith()
  })

  test('addAttachment passes error for invalid URL', async () => {
    // Arrange
    const req = {
      body: {
        fileName: 'doc.pdf',
        fileType: 'application/pdf',
        fileUrl: 'not-a-valid-url'
      }
    } as any
    const next = jest.fn()

    // Act
    await taskValidation.addAttachment(req, {} as any, next)

    // Assert
    const error = next.mock.calls[0][0] as any
    expect(error.message).toContain('File URL must be a valid URL')
  })
})
