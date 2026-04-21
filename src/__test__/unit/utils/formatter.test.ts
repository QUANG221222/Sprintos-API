import {
  pickBoardColumn,
  pickProject,
  pickSprint,
  pickTask,
  pickUser
} from '~/utils/formatter'

describe('pickUser', () => {
  test('returns only allowed user fields', () => {
    // Arrange
    const user = {
      _id: 'user-id-1',
      email: 'john@example.com',
      displayName: 'john',
      role: 'user',
      isActive: true,
      address: 'HCM City',
      dob: '2000-01-01',
      gender: 'male',
      avatar: 'avatar-url',
      avatarPublicId: 'avatar-public-id',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      password: 'secret',
      verifyToken: 'verify-token'
    }

    // Act
    const result = pickUser(user)

    // Assert
    expect(result).toEqual({
      _id: 'user-id-1',
      email: 'john@example.com',
      displayName: 'john',
      role: 'user',
      isActive: true,
      address: 'HCM City',
      dob: '2000-01-01',
      gender: 'male',
      avatar: 'avatar-url',
      avatarPublicId: 'avatar-public-id',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02')
    })
    expect(result).not.toHaveProperty('password')
    expect(result).not.toHaveProperty('verifyToken')
  })

  test('returns an empty object when input has no allowed fields', () => {
    // Arrange
    const input = { randomKey: 'value' }

    // Act
    const result = pickUser(input)

    // Assert
    expect(result).toEqual({})
  })
})

describe('pickProject', () => {
  test('returns only allowed project fields', () => {
    // Arrange
    const project = {
      _id: 'project-1',
      ownerId: 'user-1',
      name: 'Sprintos',
      description: 'Project description',
      imageUrl: 'https://img.example.com/image.png',
      imagePublicId: 'cloudinary-id',
      members: [{ userId: 'user-1', role: 'owner' }],
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      secret: 'must-not-be-returned'
    }

    // Act
    const result = pickProject(project)

    // Assert
    expect(result).toEqual({
      _id: 'project-1',
      ownerId: 'user-1',
      name: 'Sprintos',
      description: 'Project description',
      imageUrl: 'https://img.example.com/image.png',
      imagePublicId: 'cloudinary-id',
      members: [{ userId: 'user-1', role: 'owner' }],
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02')
    })
    expect(result).not.toHaveProperty('secret')
  })
})

describe('pickSprint', () => {
  test('returns only allowed sprint fields', () => {
    // Arrange
    const sprint = {
      _id: 'sprint-1',
      projectId: 'project-1',
      name: 'Sprint 1',
      goal: 'Ship auth module',
      maxStoryPoint: 40,
      startDate: '2026-01-01',
      endDate: '2026-01-15',
      status: 'active',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      hidden: true
    }

    // Act
    const result = pickSprint(sprint)

    // Assert
    expect(result).toEqual({
      _id: 'sprint-1',
      projectId: 'project-1',
      name: 'Sprint 1',
      goal: 'Ship auth module',
      maxStoryPoint: 40,
      startDate: '2026-01-01',
      endDate: '2026-01-15',
      status: 'active',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02')
    })
    expect(result).not.toHaveProperty('hidden')
  })
})

describe('pickBoardColumn', () => {
  test('returns only allowed board column fields', () => {
    // Arrange
    const column = {
      _id: 'column-1',
      sprintId: 'sprint-1',
      title: 'To Do',
      taskOrderIds: ['task-1', 'task-2'],
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      internalOrder: 1
    }

    // Act
    const result = pickBoardColumn(column)

    // Assert
    expect(result).toEqual({
      _id: 'column-1',
      sprintId: 'sprint-1',
      title: 'To Do',
      taskOrderIds: ['task-1', 'task-2'],
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02')
    })
    expect(result).not.toHaveProperty('internalOrder')
  })
})

describe('pickTask', () => {
  test('returns only allowed task fields', () => {
    // Arrange
    const task = {
      _id: 'task-1',
      sprintId: 'sprint-1',
      boardColumnId: 'column-1',
      title: 'Implement login',
      description: 'Implement login service and tests',
      labels: ['backend'],
      priority: 'high',
      storyPoint: 5,
      dueDate: '2026-01-10',
      assigneeIds: ['user-1'],
      comments: [],
      attachments: [],
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      confidentialNote: 'do-not-return'
    }

    // Act
    const result = pickTask(task)

    // Assert
    expect(result).toEqual({
      _id: 'task-1',
      sprintId: 'sprint-1',
      boardColumnId: 'column-1',
      title: 'Implement login',
      description: 'Implement login service and tests',
      labels: ['backend'],
      priority: 'high',
      storyPoint: 5,
      dueDate: '2026-01-10',
      assigneeIds: ['user-1'],
      comments: [],
      attachments: [],
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02')
    })
    expect(result).not.toHaveProperty('confidentialNote')
  })

  test('returns an empty object when input has no allowed fields', () => {
    // Arrange
    const input = { foo: 'bar' }

    // Act
    const result = pickTask(input)

    // Assert
    expect(result).toEqual({})
  })
})
