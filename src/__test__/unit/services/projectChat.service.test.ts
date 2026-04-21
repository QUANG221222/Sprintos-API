import { jest } from '@jest/globals'

jest.mock('~/models/project.model', () => ({
  projectModel: {
    findOneById: jest.fn()
  }
}))

jest.mock('~/models/projectChat.model', () => ({
  projectChatModel: {
    createChatRoom: jest.fn(),
    findChatByProjectId: jest.fn(),
    findOneById: jest.fn(),
    getAllChatsById: jest.fn(),
    deleteMessage: jest.fn(),
    deleteChatRoom: jest.fn()
  }
}))

import { projectChatService } from '~/services/projectChat.service'
import { projectModel } from '~/models/project.model'
import { projectChatModel } from '~/models/projectChat.model'

const mockedProjectModel = projectModel as jest.Mocked<typeof projectModel>
const mockedProjectChatModel = projectChatModel as jest.Mocked<
  typeof projectChatModel
>

describe('projectChatService.createChatRoom', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('throws not found when project does not exist', async () => {
    // Arrange
    mockedProjectModel.findOneById.mockResolvedValue(null)

    // Act + Assert
    await expect(
      projectChatService.createChatRoom('project-1')
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Project not found'
    })
  })

  test('creates chat room when project exists', async () => {
    // Arrange
    mockedProjectModel.findOneById.mockResolvedValue({
      _id: 'project-1'
    } as any)
    mockedProjectChatModel.createChatRoom.mockResolvedValue({
      _id: 'room-1',
      projectId: 'project-1'
    } as any)

    // Act
    const result = await projectChatService.createChatRoom('project-1')

    // Assert
    expect(mockedProjectChatModel.createChatRoom).toHaveBeenCalledWith({
      projectId: 'project-1',
      messages: [],
      lastMessage: '',
      lastMessageTime: null
    })
    expect(result).toEqual({ _id: 'room-1', projectId: 'project-1' })
  })
})

describe('projectChatService.getChatByProjectId', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('throws not found when project does not exist', async () => {
    // Arrange
    mockedProjectModel.findOneById.mockResolvedValue(null)

    // Act + Assert
    await expect(
      projectChatService.getChatByProjectId({
        params: { projectId: 'project-1' },
        jwtDecoded: { id: 'user-1' }
      } as any)
    ).rejects.toMatchObject({ statusCode: 404, message: 'Project not found' })
  })

  test('throws forbidden when user is not owner/member', async () => {
    // Arrange
    mockedProjectModel.findOneById.mockResolvedValue({
      _id: 'project-1',
      ownerId: 'owner-1',
      members: [{ memberId: 'member-1', status: 'active' }]
    } as any)

    // Act + Assert
    await expect(
      projectChatService.getChatByProjectId({
        params: { projectId: 'project-1' },
        jwtDecoded: { id: 'outsider' }
      } as any)
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'You do not have access to this project chat'
    })
  })

  test('throws not found when chat room does not exist', async () => {
    // Arrange
    mockedProjectModel.findOneById.mockResolvedValue({
      _id: 'project-1',
      ownerId: 'owner-1',
      members: [{ memberId: 'owner-1', status: 'active' }]
    } as any)
    mockedProjectChatModel.findChatByProjectId.mockResolvedValue(null)

    // Act + Assert
    await expect(
      projectChatService.getChatByProjectId({
        params: { projectId: 'project-1' },
        jwtDecoded: { id: 'owner-1' }
      } as any)
    ).rejects.toMatchObject({ statusCode: 404, message: 'Chat room not found' })
  })

  test('returns chat room for authorized user', async () => {
    // Arrange
    mockedProjectModel.findOneById.mockResolvedValue({
      _id: 'project-1',
      ownerId: 'owner-1',
      members: [{ memberId: 'member-1', status: 'active' }]
    } as any)
    mockedProjectChatModel.findChatByProjectId.mockResolvedValue({
      _id: 'room-1'
    } as any)

    // Act
    const result = await projectChatService.getChatByProjectId({
      params: { projectId: 'project-1' },
      jwtDecoded: { id: 'member-1' }
    } as any)

    // Assert
    expect(mockedProjectChatModel.findChatByProjectId).toHaveBeenCalledWith(
      'project-1'
    )
    expect(result).toEqual({ _id: 'room-1' })
  })
})

describe('projectChatService.getChatMessages', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('throws not found when room does not exist', async () => {
    // Arrange
    mockedProjectChatModel.findOneById.mockResolvedValue(null)

    // Act + Assert
    await expect(
      projectChatService.getChatMessages({
        params: { roomId: 'room-1' }
      } as any)
    ).rejects.toMatchObject({ statusCode: 404, message: 'Chat room not found' })
  })

  test('throws not found when room has no messages payload', async () => {
    // Arrange
    mockedProjectChatModel.findOneById.mockResolvedValue({
      _id: 'room-1'
    } as any)
    mockedProjectChatModel.getAllChatsById.mockResolvedValue(null as any)

    // Act + Assert
    await expect(
      projectChatService.getChatMessages({
        params: { roomId: 'room-1' }
      } as any)
    ).rejects.toMatchObject({ statusCode: 404, message: 'No messages found' })
  })

  test('returns messages when room and payload exist', async () => {
    // Arrange
    mockedProjectChatModel.findOneById.mockResolvedValue({
      _id: 'room-1'
    } as any)
    mockedProjectChatModel.getAllChatsById.mockResolvedValue([
      { _id: 'msg-1', content: 'hello' }
    ] as any)

    // Act
    const result = await projectChatService.getChatMessages({
      params: { roomId: 'room-1' }
    } as any)

    // Assert
    expect(mockedProjectChatModel.getAllChatsById).toHaveBeenCalledWith(
      'room-1'
    )
    expect(result).toEqual([{ _id: 'msg-1', content: 'hello' }])
  })
})

describe('projectChatService.deleteMessage', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('delegates delete message to model', async () => {
    // Arrange
    mockedProjectChatModel.deleteMessage.mockResolvedValue(undefined as any)

    // Act
    await projectChatService.deleteMessage('room-1', 'message-1')

    // Assert
    expect(mockedProjectChatModel.deleteMessage).toHaveBeenCalledWith(
      'room-1',
      'message-1'
    )
  })
})

describe('projectChatService.deleteChatRoom', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('throws not found when chat room does not exist', async () => {
    // Arrange
    mockedProjectChatModel.findOneById.mockResolvedValue(null)

    // Act + Assert
    await expect(
      projectChatService.deleteChatRoom({
        params: { roomId: 'room-1' },
        jwtDecoded: { id: 'owner-1' }
      } as any)
    ).rejects.toMatchObject({ statusCode: 404, message: 'Chat room not found' })
  })

  test('throws forbidden when requester is not project owner', async () => {
    // Arrange
    mockedProjectChatModel.findOneById.mockResolvedValue({
      _id: 'room-1',
      projectId: 'project-1'
    } as any)
    mockedProjectModel.findOneById.mockResolvedValue({
      _id: 'project-1',
      ownerId: 'owner-1'
    } as any)

    // Act + Assert
    await expect(
      projectChatService.deleteChatRoom({
        params: { roomId: 'room-1' },
        jwtDecoded: { id: 'member-1' }
      } as any)
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Only project owner can delete the chat room'
    })
  })

  test('deletes chat room when requester is owner', async () => {
    // Arrange
    mockedProjectChatModel.findOneById.mockResolvedValue({
      _id: 'room-1',
      projectId: 'project-1'
    } as any)
    mockedProjectModel.findOneById.mockResolvedValue({
      _id: 'project-1',
      ownerId: 'owner-1'
    } as any)
    mockedProjectChatModel.deleteChatRoom.mockResolvedValue(undefined as any)

    // Act
    await projectChatService.deleteChatRoom({
      params: { roomId: 'room-1' },
      jwtDecoded: { id: 'owner-1' }
    } as any)

    // Assert
    expect(mockedProjectChatModel.deleteChatRoom).toHaveBeenCalledWith('room-1')
  })
})
