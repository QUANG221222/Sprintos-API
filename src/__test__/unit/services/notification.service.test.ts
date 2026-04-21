import { jest } from '@jest/globals'

jest.mock('~/models/notification.model', () => ({
  notificationModel: {
    findByUserId: jest.fn(),
    findByProjectId: jest.fn(),
    findByTaskId: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn()
  }
}))

jest.mock('~/sockets/notification.socket', () => ({
  notificationSocket: {
    sendNotificationToUser: jest.fn(),
    sendNotificationToProject: jest.fn(),
    sendNotificationToTask: jest.fn()
  }
}))

import { notificationService } from '~/services/notification.service'
import { notificationModel } from '~/models/notification.model'
import { notificationSocket } from '~/sockets/notification.socket'

const mockedNotificationModel = notificationModel as jest.Mocked<
  typeof notificationModel
>
const mockedNotificationSocket = notificationSocket as jest.Mocked<
  typeof notificationSocket
>

describe('notificationService.createNotification', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('sends notification to a user when only userId is provided', async () => {
    // Arrange
    mockedNotificationSocket.sendNotificationToUser.mockResolvedValue({
      _id: 'notif-1'
    } as any)

    // Act
    const result = await notificationService.createNotification(
      'task_assigned',
      'Assigned',
      'You have a new task',
      'user-1'
    )

    // Assert
    expect(
      mockedNotificationSocket.sendNotificationToUser
    ).toHaveBeenCalledWith('user-1', {
      type: 'task_assigned',
      title: 'Assigned',
      message: 'You have a new task'
    })
    expect(result).toEqual({ _id: 'notif-1' })
  })

  test('sends notification to a project when only projectId is provided', async () => {
    // Arrange
    mockedNotificationSocket.sendNotificationToProject.mockResolvedValue({
      _id: 'notif-2'
    } as any)

    // Act
    const result = await notificationService.createNotification(
      'project_updated',
      'Project Updated',
      'Project changed',
      undefined,
      'project-1'
    )

    // Assert
    expect(
      mockedNotificationSocket.sendNotificationToProject
    ).toHaveBeenCalledWith('project-1', {
      type: 'project_updated',
      title: 'Project Updated',
      message: 'Project changed'
    })
    expect(result).toEqual({ _id: 'notif-2' })
  })

  test('sends notification to a task in fallback branch', async () => {
    // Arrange
    mockedNotificationSocket.sendNotificationToTask.mockResolvedValue({
      _id: 'notif-3'
    } as any)

    // Act
    const result = await notificationService.createNotification(
      'task_commented',
      'New Comment',
      'Someone commented',
      undefined,
      undefined,
      'task-1'
    )

    // Assert
    expect(
      mockedNotificationSocket.sendNotificationToTask
    ).toHaveBeenCalledWith('task-1', {
      type: 'task_commented',
      title: 'New Comment',
      message: 'Someone commented'
    })
    expect(result).toEqual({ _id: 'notif-3' })
  })
})

describe('notificationService.read APIs', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('gets notifications by user id from jwt payload', async () => {
    // Arrange
    mockedNotificationModel.findByUserId.mockResolvedValue([
      { _id: 'n1' }
    ] as any)
    const req = { jwtDecoded: { id: 'user-1' } } as any

    // Act
    const result = await notificationService.getUserNotifications(req)

    // Assert
    expect(mockedNotificationModel.findByUserId).toHaveBeenCalledWith('user-1')
    expect(result).toEqual([{ _id: 'n1' }])
  })

  test('gets notifications by project id from params', async () => {
    // Arrange
    mockedNotificationModel.findByProjectId.mockResolvedValue([
      { _id: 'n2' }
    ] as any)
    const req = { params: { id: 'project-1' } } as any

    // Act
    const result = await notificationService.getProjectNotifications(req)

    // Assert
    expect(mockedNotificationModel.findByProjectId).toHaveBeenCalledWith(
      'project-1'
    )
    expect(result).toEqual([{ _id: 'n2' }])
  })

  test('gets notifications by task id from params', async () => {
    // Arrange
    mockedNotificationModel.findByTaskId.mockResolvedValue([
      { _id: 'n3' }
    ] as any)
    const req = { params: { id: 'task-1' } } as any

    // Act
    const result = await notificationService.getTaskNotifications(req)

    // Assert
    expect(mockedNotificationModel.findByTaskId).toHaveBeenCalledWith('task-1')
    expect(result).toEqual([{ _id: 'n3' }])
  })

  test('marks one notification as read', async () => {
    // Arrange
    mockedNotificationModel.markAsRead.mockResolvedValue({
      _id: 'n4',
      isRead: true
    } as any)
    const req = { params: { id: 'n4' } } as any

    // Act
    const result = await notificationService.markAsRead(req)

    // Assert
    expect(mockedNotificationModel.markAsRead).toHaveBeenCalledWith('n4')
    expect(result).toEqual({ _id: 'n4', isRead: true })
  })

  test('marks all notifications as read for current user', async () => {
    // Arrange
    mockedNotificationModel.markAllAsRead.mockResolvedValue(undefined as any)
    const req = { jwtDecoded: { id: 'user-2' } } as any

    // Act
    await notificationService.markAllAsRead(req)

    // Assert
    expect(mockedNotificationModel.markAllAsRead).toHaveBeenCalledWith('user-2')
  })
})
