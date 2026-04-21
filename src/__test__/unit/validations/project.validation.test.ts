import { jest } from '@jest/globals'
import { projectValidation } from '~/validations/project.validation'

describe('projectValidation', () => {
  test('createProject calls next for valid payload', async () => {
    // Arrange
    const req = {
      body: {
        name: 'Project Alpha',
        description: 'Desc',
        members: [{ email: 'alice@example.com', role: 'member' }]
      }
    } as any
    const next = jest.fn()

    // Act
    await projectValidation.createProject(req, {} as any, next)

    // Assert
    expect(next).toHaveBeenCalledWith()
  })

  test('acceptProjectInvitation passes error for invalid project id', async () => {
    // Arrange
    const req = {
      body: { email: 'alice@example.com', token: 'token-1', projectId: 'bad' }
    } as any
    const next = jest.fn()

    // Act
    await projectValidation.acceptProjectInvitation(req, {} as any, next)

    // Assert
    const error = next.mock.calls[0][0] as any
    expect(error.message).toContain('Object Id pattern')
  })

  test('updateProject calls next for valid payload', async () => {
    // Arrange
    const req = { body: { name: 'New Name', description: '' } } as any
    const next = jest.fn()

    // Act
    await projectValidation.updateProject(req, {} as any, next)

    // Assert
    expect(next).toHaveBeenCalledWith()
  })

  test('inviteMemberToProject passes error for invalid role', async () => {
    // Arrange
    const req = {
      body: {
        projectId: '507f1f77bcf86cd799439011',
        email: 'alice@example.com',
        role: 'admin'
      }
    } as any
    const next = jest.fn()

    // Act
    await projectValidation.inviteMemberToProject(req, {} as any, next)

    // Assert
    const error = next.mock.calls[0][0] as any
    expect(error.message).toContain('Role must be owner, member, or viewer')
  })

  test('updateMemberInProject calls next for valid role', async () => {
    // Arrange
    const req = { body: { role: 'viewer' } } as any
    const next = jest.fn()

    // Act
    await projectValidation.updateMemberInProject(req, {} as any, next)

    // Assert
    expect(next).toHaveBeenCalledWith()
  })

  test('removeMemberFromProject validates params and calls next', async () => {
    // Arrange
    const req = {
      params: {
        projectId: '507f1f77bcf86cd799439011',
        memberId: '507f1f77bcf86cd799439012'
      }
    } as any
    const next = jest.fn()

    // Act
    await projectValidation.removeMemberFromProject(req, {} as any, next)

    // Assert
    expect(next).toHaveBeenCalledWith()
  })
})
