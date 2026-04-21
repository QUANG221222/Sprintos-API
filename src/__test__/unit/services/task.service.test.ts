import { jest } from '@jest/globals'

jest.mock('~/models/task.model', () => ({
  taskModel: {
    findOneById: jest.fn(),
    findBySprintId: jest.fn(),
    findByBoardColumnId: jest.fn(),
    deleteById: jest.fn(),
    addComment: jest.fn(),
    addAttachment: jest.fn()
  }
}))

jest.mock('~/models/sprint.model', () => ({
  sprintModel: {
    findOneById: jest.fn()
  }
}))

jest.mock('~/models/boardColumn.model', () => ({
  boardColumnModel: {
    findOneById: jest.fn(),
    update: jest.fn()
  }
}))

jest.mock('~/models/project.model', () => ({
  projectModel: {
    findOneById: jest.fn()
  }
}))

jest.mock('~/models/user.model', () => ({
  userModel: {
    findOneById: jest.fn()
  }
}))

jest.mock('~/utils/formatter', () => ({
  pickTask: jest.fn()
}))

jest.mock('~/services/notification.service', () => ({
  notificationService: {
    createNotification: jest.fn()
  }
}))

import { taskService } from '~/services/task.service'
import { taskModel } from '~/models/task.model'
import { sprintModel } from '~/models/sprint.model'
import { projectModel } from '~/models/project.model'
import { userModel } from '~/models/user.model'
import { pickTask } from '~/utils/formatter'

const mockedTaskModel = taskModel as jest.Mocked<typeof taskModel>
const mockedSprintModel = sprintModel as jest.Mocked<typeof sprintModel>
const mockedProjectModel = projectModel as jest.Mocked<typeof projectModel>
const mockedUserModel = userModel as jest.Mocked<typeof userModel>
const mockedPickTask = pickTask as jest.MockedFunction<typeof pickTask>

describe('taskService.getTaskById', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('throws not found when task does not exist', async () => {
    // Arrange
    mockedTaskModel.findOneById.mockResolvedValue(null)

    // Act + Assert
    await expect(
      taskService.getTaskById({
        params: { id: 'task-1' },
        jwtDecoded: { id: 'user-1' }
      } as any)
    ).rejects.toMatchObject({ statusCode: 404, message: 'Task not found' })
  })

  test('returns picked task for authorized member', async () => {
    // Arrange
    const task = { _id: 'task-1', sprintId: 'sprint-1' }
    mockedTaskModel.findOneById.mockResolvedValue(task as any)
    mockedSprintModel.findOneById.mockResolvedValue({
      projectId: 'project-1'
    } as any)
    mockedProjectModel.findOneById.mockResolvedValue({
      ownerId: 'owner-1',
      members: [{ memberId: 'user-1', status: 'active' }]
    } as any)
    mockedPickTask.mockReturnValue({ _id: 'task-1' })

    // Act
    const result = await taskService.getTaskById({
      params: { id: 'task-1' },
      jwtDecoded: { id: 'user-1' }
    } as any)

    // Assert
    expect(mockedPickTask).toHaveBeenCalledWith(task)
    expect(result).toEqual({ _id: 'task-1' })
  })
})

describe('taskService.getAllTasksBySprintId', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('throws not found when sprint does not exist', async () => {
    // Arrange
    mockedSprintModel.findOneById.mockResolvedValue(null)

    // Act + Assert
    await expect(
      taskService.getAllTasksBySprintId({
        params: { sprintId: 'sprint-1' },
        jwtDecoded: { id: 'user-1' }
      } as any)
    ).rejects.toMatchObject({ statusCode: 404, message: 'Sprint not found' })
  })
})

describe('taskService.deleteTaskById', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('throws forbidden when requester is not owner role', async () => {
    // Arrange
    mockedTaskModel.findOneById.mockResolvedValue({
      _id: 'task-1',
      sprintId: 'sprint-1',
      boardColumnId: 'col-1',
      title: 'Task 1'
    } as any)
    mockedSprintModel.findOneById.mockResolvedValue({
      projectId: 'project-1'
    } as any)
    mockedProjectModel.findOneById.mockResolvedValue({
      ownerId: 'owner-1',
      members: [{ memberId: 'member-1', role: 'member', status: 'active' }]
    } as any)

    // Act + Assert
    await expect(
      taskService.deleteTaskById({
        params: { id: 'task-1' },
        jwtDecoded: { id: 'member-1' }
      } as any)
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Only project owner can delete tasks'
    })
  })
})

describe('taskService.addCommentToTask', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('throws not found when comment author does not exist', async () => {
    // Arrange
    mockedTaskModel.findOneById.mockResolvedValue({
      _id: 'task-1',
      sprintId: 'sprint-1'
    } as any)
    mockedSprintModel.findOneById.mockResolvedValue({
      projectId: 'project-1'
    } as any)
    mockedProjectModel.findOneById.mockResolvedValue({
      ownerId: 'owner-1',
      members: [{ memberId: 'user-1', status: 'active' }]
    } as any)
    mockedUserModel.findOneById.mockResolvedValue(null)

    // Act + Assert
    await expect(
      taskService.addCommentToTask({
        params: { id: 'task-1' },
        body: { content: 'hello' },
        jwtDecoded: { id: 'user-1' }
      } as any)
    ).rejects.toMatchObject({ statusCode: 404, message: 'User not found' })
  })
})

describe('taskService.addAttachmentToTask', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('throws forbidden when requester has no access', async () => {
    // Arrange
    mockedTaskModel.findOneById.mockResolvedValue({
      _id: 'task-1',
      sprintId: 'sprint-1'
    } as any)
    mockedSprintModel.findOneById.mockResolvedValue({
      projectId: 'project-1'
    } as any)
    mockedProjectModel.findOneById.mockResolvedValue({
      ownerId: 'owner-1',
      members: [{ memberId: 'member-1', status: 'active' }]
    } as any)

    // Act + Assert
    await expect(
      taskService.addAttachmentToTask({
        params: { id: 'task-1' },
        body: {
          fileName: 'doc.pdf',
          fileType: 'application/pdf',
          fileUrl: 'https://example.com/doc.pdf'
        },
        jwtDecoded: { id: 'outsider' }
      } as any)
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'You are not authorized to add attachment to this task'
    })
  })
})
