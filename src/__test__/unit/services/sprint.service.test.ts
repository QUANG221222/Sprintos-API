import { jest } from '@jest/globals'

jest.mock('~/models/sprint.model', () => ({
  sprintModel: {
    findOneById: jest.fn(),
    findByProjectId: jest.fn(),
    createNew: jest.fn(),
    update: jest.fn(),
    deleteById: jest.fn()
  }
}))

jest.mock('~/models/project.model', () => ({
  projectModel: {
    findOneById: jest.fn()
  }
}))

jest.mock('~/models/boardColumn.model', () => ({
  boardColumnModel: {
    createNew: jest.fn(),
    deleteBySprintId: jest.fn()
  }
}))

jest.mock('~/models/task.model', () => ({
  taskModel: {
    deleteBySprintId: jest.fn()
  }
}))

jest.mock('~/models/user.model', () => ({
  userModel: {
    findOneById: jest.fn()
  }
}))

jest.mock('~/utils/formatter', () => ({
  pickSprint: jest.fn()
}))

jest.mock('~/services/notification.service', () => ({
  notificationService: {
    createNotification: jest.fn()
  }
}))

import { sprintService } from '~/services/sprint.service'
import { sprintModel } from '~/models/sprint.model'
import { projectModel } from '~/models/project.model'
import { boardColumnModel } from '~/models/boardColumn.model'
import { taskModel } from '~/models/task.model'
import { userModel } from '~/models/user.model'
import { pickSprint } from '~/utils/formatter'
import { notificationService } from '~/services/notification.service'

const mockedSprintModel = sprintModel as jest.Mocked<typeof sprintModel>
const mockedProjectModel = projectModel as jest.Mocked<typeof projectModel>
const mockedBoardColumnModel = boardColumnModel as jest.Mocked<
  typeof boardColumnModel
>
const mockedTaskModel = taskModel as jest.Mocked<typeof taskModel>
const mockedUserModel = userModel as jest.Mocked<typeof userModel>
const mockedPickSprint = pickSprint as jest.MockedFunction<typeof pickSprint>
const mockedNotificationService = notificationService as jest.Mocked<
  typeof notificationService
>

describe('sprintService.createNew', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('throws not found when project does not exist', async () => {
    // Arrange
    mockedProjectModel.findOneById.mockResolvedValue(null)

    // Act + Assert
    await expect(
      sprintService.createNew({
        body: { projectId: 'project-1', name: 'Sprint 1' },
        jwtDecoded: { id: 'user-1' }
      } as any)
    ).rejects.toMatchObject({ statusCode: 404, message: 'Project not found' })
  })

  test('throws forbidden when requester is not owner role', async () => {
    // Arrange
    mockedProjectModel.findOneById.mockResolvedValue({
      _id: 'project-1',
      ownerId: 'owner-1',
      members: [{ memberId: 'member-1', role: 'member', status: 'active' }]
    } as any)

    // Act + Assert
    await expect(
      sprintService.createNew({
        body: { projectId: 'project-1', name: 'Sprint 1' },
        jwtDecoded: { id: 'member-1' }
      } as any)
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Only project owner can create sprints'
    })
  })

  test('creates sprint, template columns and notifications', async () => {
    // Arrange
    mockedProjectModel.findOneById.mockResolvedValue({
      _id: 'project-1',
      name: 'Alpha',
      ownerId: 'owner-1',
      members: [
        { memberId: 'owner-1', role: 'owner', status: 'active' },
        { memberId: 'member-1', role: 'member', status: 'active' }
      ]
    } as any)
    mockedSprintModel.createNew.mockResolvedValue({
      _id: 'sprint-1',
      name: 'S1'
    } as any)
    mockedUserModel.findOneById.mockResolvedValue({
      displayName: 'Owner'
    } as any)
    mockedPickSprint.mockReturnValue({ _id: 'sprint-1', name: 'S1' })

    // Act
    const result = await sprintService.createNew({
      body: { projectId: 'project-1', name: 'S1' },
      jwtDecoded: { id: 'owner-1' }
    } as any)

    // Assert
    expect(mockedBoardColumnModel.createNew).toHaveBeenCalledTimes(5)
    expect(mockedNotificationService.createNotification).toHaveBeenCalled()
    expect(result).toEqual({ _id: 'sprint-1', name: 'S1' })
  })
})

describe('sprintService.getSprintById', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('throws forbidden when requester has no access', async () => {
    // Arrange
    mockedSprintModel.findOneById.mockResolvedValue({
      _id: 'sprint-1',
      projectId: 'project-1'
    } as any)
    mockedProjectModel.findOneById.mockResolvedValue({
      ownerId: 'owner-1',
      members: [{ memberId: 'member-1', status: 'active' }]
    } as any)

    // Act + Assert
    await expect(
      sprintService.getSprintById({
        params: { id: 'sprint-1' },
        jwtDecoded: { id: 'outsider' }
      } as any)
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'You do not have access to this sprint'
    })
  })
})

describe('sprintService.updateSprint', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('updates sprint and sends started notification when status changes to active', async () => {
    // Arrange
    mockedSprintModel.findOneById.mockResolvedValue({
      _id: 'sprint-1',
      name: 'S1',
      status: 'planned',
      projectId: 'project-1'
    } as any)
    mockedProjectModel.findOneById.mockResolvedValue({
      _id: 'project-1',
      name: 'Alpha',
      ownerId: 'owner-1',
      members: [
        { memberId: 'owner-1', role: 'owner', status: 'active' },
        { memberId: 'member-1', role: 'member', status: 'active' }
      ]
    } as any)
    mockedSprintModel.update.mockResolvedValue({
      _id: 'sprint-1',
      status: 'active'
    } as any)
    mockedPickSprint.mockReturnValue({ _id: 'sprint-1', status: 'active' })

    // Act
    const result = await sprintService.updateSprint({
      params: { id: 'sprint-1' },
      body: { status: 'active' },
      jwtDecoded: { id: 'owner-1' }
    } as any)

    // Assert
    expect(mockedNotificationService.createNotification).toHaveBeenCalledWith(
      'sprint_started',
      'Sprint Started',
      'Sprint "S1" has started',
      '',
      'project-1'
    )
    expect(result).toEqual({ _id: 'sprint-1', status: 'active' })
  })
})

describe('sprintService.deleteSprintById', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('deletes sprint and related data for owner role', async () => {
    // Arrange
    mockedSprintModel.findOneById.mockResolvedValue({
      _id: 'sprint-1',
      name: 'S1',
      projectId: 'project-1'
    } as any)
    mockedProjectModel.findOneById.mockResolvedValue({
      _id: 'project-1',
      ownerId: 'owner-1',
      members: [{ memberId: 'owner-1', role: 'owner', status: 'active' }]
    } as any)
    mockedSprintModel.deleteById.mockResolvedValue(true as any)

    // Act
    await sprintService.deleteSprintById({
      params: { id: 'sprint-1' },
      jwtDecoded: { id: 'owner-1' }
    } as any)

    // Assert
    expect(mockedBoardColumnModel.deleteBySprintId).toHaveBeenCalledWith(
      'sprint-1'
    )
    expect(mockedTaskModel.deleteBySprintId).toHaveBeenCalledWith('sprint-1')
    expect(mockedSprintModel.deleteById).toHaveBeenCalledWith('sprint-1')
  })
})
