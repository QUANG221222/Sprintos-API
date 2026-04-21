import { jest } from '@jest/globals'
import { sprintValidation } from '~/validations/sprint.validation'

describe('sprintValidation', () => {
  test('createSprint calls next for valid payload', async () => {
    // Arrange
    const req = {
      body: {
        projectId: '507f1f77bcf86cd799439011',
        name: 'Sprint 1',
        goal: 'Release auth',
        maxStoryPoint: 30,
        startDate: '2026-01-01',
        endDate: '2026-01-10'
      }
    } as any
    const next = jest.fn()

    // Act
    await sprintValidation.createSprint(req, {} as any, next)

    // Assert
    expect(next).toHaveBeenCalledWith()
  })

  test('createSprint passes error when endDate is before startDate', async () => {
    // Arrange
    const req = {
      body: {
        projectId: '507f1f77bcf86cd799439011',
        name: 'Sprint 1',
        startDate: '2026-01-10',
        endDate: '2026-01-01'
      }
    } as any
    const next = jest.fn()

    // Act
    await sprintValidation.createSprint(req, {} as any, next)

    // Assert
    const error = next.mock.calls[0][0] as any
    expect(error.message).toContain('End date must be after start date')
  })

  test('updateSprint calls next for valid payload', async () => {
    // Arrange
    const req = { body: { status: 'active', maxStoryPoint: 10 } } as any
    const next = jest.fn()

    // Act
    await sprintValidation.updateSprint(req, {} as any, next)

    // Assert
    expect(next).toHaveBeenCalledWith()
  })

  test('updateSprint passes error for invalid status', async () => {
    // Arrange
    const req = { body: { status: 'archived' } } as any
    const next = jest.fn()

    // Act
    await sprintValidation.updateSprint(req, {} as any, next)

    // Assert
    const error = next.mock.calls[0][0] as any
    expect(error.message).toContain(
      'Status must be planned, active, or completed'
    )
  })
})
