import { jest } from '@jest/globals'

jest.mock('~/models/project.model', () => ({
  projectModel: {
    findByUserId: jest.fn(),
    findByMemberId: jest.fn(),
    findOneById: jest.fn()
  }
}))

jest.mock('~/models/user.model', () => ({
  userModel: {
    findOneByEmail: jest.fn()
  }
}))

jest.mock('~/models/sprint.model', () => ({
  sprintModel: {
    deleteByProjectId: jest.fn()
  }
}))

jest.mock('~/models/boardColumn.model', () => ({
  boardColumnModel: {
    deleteByProjectId: jest.fn()
  }
}))

jest.mock('~/models/task.model', () => ({
  taskModel: {
    deleteByProjectId: jest.fn()
  }
}))

jest.mock('~/providers/BrevoProvider', () => ({
  BrevoProvider: {
    sendEmail: jest.fn()
  }
}))

jest.mock('~/providers/CloudinaryProvider', () => ({
  CloudinaryProvider: {
    uploadFromBuffer: jest.fn(),
    deleteImage: jest.fn()
  }
}))

jest.mock('~/services/notification.service', () => ({
  notificationService: {
    createNotification: jest.fn()
  }
}))

jest.mock('~/services/projectChat.service', () => ({
  projectChatService: {
    createChatRoom: jest.fn()
  }
}))

jest.mock('~/utils/constants', () => ({
  WEBSITE_DOMAIN: 'http://frontend.local'
}))

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-token')
}))

jest.mock('~/utils/formatter', () => ({
  pickProject: jest.fn()
}))

import { projectService } from '~/services/project.service'
import { projectModel } from '~/models/project.model'
import { pickProject } from '~/utils/formatter'

const mockedProjectModel = projectModel as jest.Mocked<typeof projectModel>
const mockedPickProject = pickProject as jest.MockedFunction<typeof pickProject>

describe('projectService.simple queries', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('getAllUserOwnedProjects returns projects from model', async () => {
    // Arrange
    mockedProjectModel.findByUserId.mockResolvedValue([{ _id: 'p1' }] as any)

    // Act
    const result = await projectService.getAllUserOwnedProjects('user-1')

    // Assert
    expect(mockedProjectModel.findByUserId).toHaveBeenCalledWith('user-1')
    expect(result).toEqual([{ _id: 'p1' }])
  })

  test('getAllUserParticipatedProjects returns projects from model', async () => {
    // Arrange
    mockedProjectModel.findByMemberId.mockResolvedValue([{ _id: 'p2' }] as any)

    // Act
    const result = await projectService.getAllUserParticipatedProjects('user-1')

    // Assert
    expect(mockedProjectModel.findByMemberId).toHaveBeenCalledWith('user-1')
    expect(result).toEqual([{ _id: 'p2' }])
  })

  test('getAllProjectsOfUser merges and deduplicates by _id', async () => {
    // Arrange
    mockedProjectModel.findByUserId.mockResolvedValue([
      { _id: 'p1', name: 'Owned Project' }
    ] as any)
    mockedProjectModel.findByMemberId.mockResolvedValue([
      { _id: 'p1', name: 'Owned Project' },
      { _id: 'p2', name: 'Joined Project' }
    ] as any)

    // Act
    const result = await projectService.getAllProjectsOfUser('user-1')

    // Assert
    expect(result).toEqual([
      { _id: 'p1', name: 'Owned Project' },
      { _id: 'p2', name: 'Joined Project' }
    ])
  })
})

describe('projectService.getProjectById', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('throws not found when project does not exist', async () => {
    // Arrange
    mockedProjectModel.findOneById.mockResolvedValue(null)

    // Act + Assert
    await expect(
      projectService.getProjectById({
        params: { id: 'project-1' },
        jwtDecoded: { id: 'user-1' }
      } as any)
    ).rejects.toMatchObject({ statusCode: 404, message: 'Project not found' })
  })

  test('throws forbidden when user has no access', async () => {
    // Arrange
    mockedProjectModel.findOneById.mockResolvedValue({
      _id: 'project-1',
      ownerId: 'owner-1',
      members: [{ memberId: 'member-1', status: 'active' }]
    } as any)

    // Act + Assert
    await expect(
      projectService.getProjectById({
        params: { id: 'project-1' },
        jwtDecoded: { id: 'outsider' }
      } as any)
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'You do not have access to this project'
    })
  })

  test('returns picked project for authorized user', async () => {
    // Arrange
    const project = {
      _id: 'project-1',
      ownerId: 'owner-1',
      members: [{ memberId: 'member-1', status: 'active' }]
    }
    mockedProjectModel.findOneById.mockResolvedValue(project as any)
    mockedPickProject.mockReturnValue({ _id: 'project-1' })

    // Act
    const result = await projectService.getProjectById({
      params: { id: 'project-1' },
      jwtDecoded: { id: 'member-1' }
    } as any)

    // Assert
    expect(mockedPickProject).toHaveBeenCalledWith(project)
    expect(result).toEqual({ _id: 'project-1' })
  })
})
