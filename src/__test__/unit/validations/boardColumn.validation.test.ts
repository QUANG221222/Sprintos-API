import { jest } from '@jest/globals'
import { boardColumnValidation } from '~/validations/boardColumn.validation'

describe('boardColumnValidation', () => {
  test('createBoardColumn calls next for valid payload', async () => {
    // Arrange
    const req = {
      body: {
        sprintId: '507f1f77bcf86cd799439011',
        title: 'In Review'
      }
    } as any
    const next = jest.fn()

    // Act
    await boardColumnValidation.createBoardColumn(req, {} as any, next)

    // Assert
    expect(next).toHaveBeenCalledWith()
  })

  test('createBoardColumn passes Joi error for invalid sprint id', async () => {
    // Arrange
    const req = { body: { sprintId: 'bad-id', title: 'In Review' } } as any
    const next = jest.fn()

    // Act
    await boardColumnValidation.createBoardColumn(req, {} as any, next)

    // Assert
    const error = next.mock.calls[0][0] as any
    expect(error).toBeTruthy()
    expect(error.message).toContain('Object Id pattern')
  })

  test('updateBoardColumn calls next for valid payload', async () => {
    // Arrange
    const req = {
      body: {
        title: 'Done',
        taskOrderIds: ['507f1f77bcf86cd799439011']
      }
    } as any
    const next = jest.fn()

    // Act
    await boardColumnValidation.updateBoardColumn(req, {} as any, next)

    // Assert
    expect(next).toHaveBeenCalledWith()
  })

  test('updateBoardColumn passes Joi error for invalid taskOrderIds', async () => {
    // Arrange
    const req = { body: { taskOrderIds: ['not-object-id'] } } as any
    const next = jest.fn()

    // Act
    await boardColumnValidation.updateBoardColumn(req, {} as any, next)

    // Assert
    const error = next.mock.calls[0][0] as any
    expect(error).toBeTruthy()
    expect(error.message).toContain('Object Id pattern')
  })
})
