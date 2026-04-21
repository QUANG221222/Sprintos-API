import { jest } from '@jest/globals'

jest.mock('~/models/sprint.model', () => ({
  sprintModel: {
    findOneById: jest.fn(),
    findByProjectId: jest.fn()
  }
}))

jest.mock('~/models/project.model', () => ({
  projectModel: {
    findOneById: jest.fn()
  }
}))

jest.mock('~/models/boardColumn.model', () => ({
  boardColumnModel: {
    findBySprintId: jest.fn()
  }
}))

jest.mock('~/models/task.model', () => ({
  taskModel: {
    findByBoardColumnId: jest.fn(),
    findBySprintId: jest.fn()
  }
}))

jest.mock('~/models/user.model', () => ({
  userModel: {
    findOneById: jest.fn()
  }
}))

import { reportService } from '~/services/report.service'
import { sprintModel } from '~/models/sprint.model'
import { projectModel } from '~/models/project.model'
import { boardColumnModel } from '~/models/boardColumn.model'
import { taskModel } from '~/models/task.model'
import { userModel } from '~/models/user.model'

const mockedSprintModel = sprintModel as jest.Mocked<typeof sprintModel>
const mockedProjectModel = projectModel as jest.Mocked<typeof projectModel>
const mockedBoardColumnModel = boardColumnModel as jest.Mocked<
  typeof boardColumnModel
>
const mockedTaskModel = taskModel as jest.Mocked<typeof taskModel>
const mockedUserModel = userModel as jest.Mocked<typeof userModel>

describe('reportService.getSprintProgressReport', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('throws not found when sprint is missing', async () => {
    // Arrange
    mockedSprintModel.findOneById.mockResolvedValue(null)

    // Act + Assert
    await expect(
      reportService.getSprintProgressReport({
        params: { sprintId: 'sprint-1' },
        jwtDecoded: { id: 'user-1' }
      } as any)
    ).rejects.toMatchObject({ statusCode: 404, message: 'Sprint not found' })
  })

  test('returns progress data for authorized user', async () => {
    // Arrange
    mockedSprintModel.findOneById.mockResolvedValue({
      _id: 'sprint-1',
      name: 'Sprint 1',
      projectId: 'project-1'
    } as any)
    mockedProjectModel.findOneById.mockResolvedValue({
      _id: 'project-1',
      ownerId: 'owner-1',
      members: [{ memberId: 'user-1', status: 'active' }]
    } as any)
    mockedBoardColumnModel.findBySprintId.mockResolvedValue([
      { _id: 'col-backlog', title: 'backlog' },
      { _id: 'col-done', title: 'done' }
    ] as any)
    mockedTaskModel.findByBoardColumnId
      .mockResolvedValueOnce([{ _id: 't1' }, { _id: 't2' }] as any)
      .mockResolvedValueOnce([{ _id: 't3' }] as any)

    // Act
    const result = await reportService.getSprintProgressReport({
      params: { sprintId: 'sprint-1' },
      jwtDecoded: { id: 'user-1' }
    } as any)

    // Assert
    expect(result).toEqual({
      sprintId: 'sprint-1',
      sprintName: 'Sprint 1',
      progressData: [
        { name: 'backlog', value: 2, color: '#94a3b8' },
        { name: 'done', value: 1, color: '#10b981' }
      ]
    })
  })
})

describe('reportService.getProjectVelocityReport', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('throws forbidden for non-member non-owner', async () => {
    // Arrange
    mockedProjectModel.findOneById.mockResolvedValue({
      _id: 'project-1',
      ownerId: 'owner-1',
      name: 'Project 1',
      members: [{ memberId: 'member-1', status: 'active' }]
    } as any)

    // Act + Assert
    await expect(
      reportService.getProjectVelocityReport({
        params: { projectId: 'project-1' },
        jwtDecoded: { id: 'outsider' }
      } as any)
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'You do not have access to this project'
    })
  })

  test('returns velocity data by sprint', async () => {
    // Arrange
    mockedProjectModel.findOneById.mockResolvedValue({
      _id: 'project-1',
      ownerId: 'owner-1',
      name: 'Project 1',
      members: [{ memberId: 'member-1', status: 'active' }]
    } as any)
    mockedSprintModel.findByProjectId.mockResolvedValue([
      { _id: 's1', name: 'Sprint A', maxStoryPoint: 20 },
      { _id: 's2', name: 'Sprint B', maxStoryPoint: 10 }
    ] as any)
    mockedBoardColumnModel.findBySprintId
      .mockResolvedValueOnce([{ _id: 'done-a', title: 'done' }] as any)
      .mockResolvedValueOnce([{ _id: 'todo-b', title: 'todo' }] as any)
    mockedTaskModel.findByBoardColumnId.mockResolvedValueOnce([
      { storyPoint: 5 },
      { storyPoint: 3 }
    ] as any)

    // Act
    const result = await reportService.getProjectVelocityReport({
      params: { projectId: 'project-1' },
      jwtDecoded: { id: 'member-1' }
    } as any)

    // Assert
    expect(result).toEqual({
      projectId: 'project-1',
      projectName: 'Project 1',
      velocityData: [
        { sprint: 'Sprint A', planned: 20, completed: 8 },
        { sprint: 'Sprint B', planned: 10, completed: 0 }
      ]
    })
  })
})

describe('reportService.getSprintMemberDistribution', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('throws not found when project is missing', async () => {
    // Arrange
    mockedSprintModel.findOneById.mockResolvedValue({
      _id: 'sprint-1',
      name: 'Sprint 1',
      projectId: 'project-1'
    } as any)
    mockedProjectModel.findOneById.mockResolvedValue(null)

    // Act + Assert
    await expect(
      reportService.getSprintMemberDistribution({
        params: { sprintId: 'sprint-1' },
        jwtDecoded: { id: 'user-1' }
      } as any)
    ).rejects.toMatchObject({ statusCode: 404, message: 'Project not found' })
  })

  test('returns distribution sorted by total tasks desc', async () => {
    // Arrange
    mockedSprintModel.findOneById.mockResolvedValue({
      _id: 'sprint-1',
      name: 'Sprint 1',
      projectId: 'project-1'
    } as any)
    mockedProjectModel.findOneById.mockResolvedValue({
      _id: 'project-1',
      ownerId: 'owner-1',
      members: [{ memberId: 'user-1', status: 'active' }]
    } as any)
    mockedBoardColumnModel.findBySprintId.mockResolvedValue([
      { _id: 'col-done', title: 'done' },
      { _id: 'col-in', title: 'in_process' },
      { _id: 'col-todo', title: 'todo' },
      { _id: 'col-backlog', title: 'backlog' }
    ] as any)
    mockedTaskModel.findBySprintId.mockResolvedValue([
      { assigneeIds: ['u1'], boardColumnId: 'col-done' },
      { assigneeIds: ['u1'], boardColumnId: 'col-in' },
      { assigneeIds: ['u2'], boardColumnId: 'col-todo' },
      { assigneeIds: ['u2'], boardColumnId: 'col-backlog' }
    ] as any)
    mockedUserModel.findOneById
      .mockResolvedValueOnce({ _id: 'u1', displayName: 'Alice' } as any)
      .mockResolvedValueOnce({ _id: 'u2', displayName: 'Bob' } as any)

    // Act
    const result = await reportService.getSprintMemberDistribution({
      params: { sprintId: 'sprint-1' },
      jwtDecoded: { id: 'user-1' }
    } as any)

    // Assert
    expect(result).toEqual({
      sprintId: 'sprint-1',
      sprintName: 'Sprint 1',
      totalMembers: 2,
      memberDistribution: [
        { name: 'Alice', done: 1, inProgress: 1, todo: 0 },
        { name: 'Bob', done: 0, inProgress: 0, todo: 2 }
      ]
    })
  })
})
