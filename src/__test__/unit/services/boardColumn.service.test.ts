import { jest } from '@jest/globals'

jest.mock('~/models/boardColumn.model', () => ({
  boardColumnModel: {
    findOneById: jest.fn(),
    findBySprintId: jest.fn(),
    createNew: jest.fn(),
    update: jest.fn(),
    deleteById: jest.fn()
  }
}))

jest.mock('~/models/sprint.model', () => ({
  sprintModel: {
    findOneById: jest.fn()
  }
}))

jest.mock('~/models/project.model', () => ({
  projectModel: {
    findOneById: jest.fn()
  }
}))

jest.mock('~/models/task.model', () => ({
  taskModel: {
    deleteByBoardColumnId: jest.fn()
  }
}))

jest.mock('~/utils/formatter', () => ({
  pickBoardColumn: jest.fn()
}))

import { boardColumnService } from '~/services/boardColumn.service'
import { boardColumnModel } from '~/models/boardColumn.model'
import { sprintModel } from '~/models/sprint.model'
import { projectModel } from '~/models/project.model'
import { taskModel } from '~/models/task.model'
import { pickBoardColumn } from '~/utils/formatter'

const mockedBoardColumnModel = boardColumnModel as jest.Mocked<
  typeof boardColumnModel
>
const mockedSprintModel = sprintModel as jest.Mocked<typeof sprintModel>
const mockedProjectModel = projectModel as jest.Mocked<typeof projectModel>
const mockedTaskModel = taskModel as jest.Mocked<typeof taskModel>
const mockedPickBoardColumn = pickBoardColumn as jest.MockedFunction<
  typeof pickBoardColumn
>

describe('boardColumnService.createNew', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('throws not found when sprint does not exist', async () => {
    // Arrange
    mockedSprintModel.findOneById.mockResolvedValue(null)

    // Act + Assert
    await expect(
      boardColumnService.createNew({
        body: { sprintId: 'sprint-1', title: 'Done' },
        jwtDecoded: { id: 'user-1' }
      } as any)
    ).rejects.toMatchObject({ statusCode: 404, message: 'Sprint not found' })
  })

  test('throws bad request when title already exists', async () => {
    // Arrange
    mockedSprintModel.findOneById.mockResolvedValue({
      projectId: 'project-1'
    } as any)
    mockedProjectModel.findOneById.mockResolvedValue({
      ownerId: 'owner-1',
      members: [{ memberId: 'user-1', status: 'active', role: 'owner' }]
    } as any)
    mockedBoardColumnModel.findBySprintId.mockResolvedValue([
      { title: 'Done' }
    ] as any)

    // Act + Assert
    await expect(
      boardColumnService.createNew({
        body: { sprintId: 'sprint-1', title: 'Done' },
        jwtDecoded: { id: 'user-1' }
      } as any)
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Column with title "Done" already exists in this sprint'
    })
  })

  test('creates and returns picked board column', async () => {
    // Arrange
    mockedSprintModel.findOneById.mockResolvedValue({
      projectId: 'project-1'
    } as any)
    mockedProjectModel.findOneById.mockResolvedValue({
      ownerId: 'owner-1',
      members: [{ memberId: 'user-1', status: 'active', role: 'owner' }]
    } as any)
    mockedBoardColumnModel.findBySprintId.mockResolvedValue([] as any)
    mockedBoardColumnModel.createNew.mockResolvedValue({
      _id: 'col-1',
      title: 'Done'
    } as any)
    mockedPickBoardColumn.mockReturnValue({ _id: 'col-1', title: 'Done' })

    // Act
    const result = await boardColumnService.createNew({
      body: { sprintId: 'sprint-1', title: 'Done' },
      jwtDecoded: { id: 'user-1' }
    } as any)

    // Assert
    expect(mockedBoardColumnModel.createNew).toHaveBeenCalledWith({
      sprintId: 'sprint-1',
      title: 'Done',
      taskOrderIds: []
    })
    expect(result).toEqual({ _id: 'col-1', title: 'Done' })
  })
})

describe('boardColumnService.getBoardColumnById', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('throws forbidden for unauthorized user', async () => {
    // Arrange
    mockedBoardColumnModel.findOneById.mockResolvedValue({
      _id: 'col-1',
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
      boardColumnService.getBoardColumnById({
        params: { id: 'col-1' },
        jwtDecoded: { id: 'outsider' }
      } as any)
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'You do not have access to this board column'
    })
  })
})

describe('boardColumnService.updateBoardColumn', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('throws bad request when updating backlog title', async () => {
    // Arrange
    mockedBoardColumnModel.findOneById.mockResolvedValue({
      _id: 'col-1',
      title: 'backlog',
      sprintId: 'sprint-1'
    } as any)

    // Act + Assert
    await expect(
      boardColumnService.updateBoardColumn({
        params: { id: 'col-1' },
        body: { title: 'New Backlog' },
        jwtDecoded: { id: 'owner-1' }
      } as any)
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Backlog column cannot be updated'
    })
  })
})

describe('boardColumnService.deleteBoardColumnById', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('deletes board column and related tasks', async () => {
    // Arrange
    mockedBoardColumnModel.findOneById.mockResolvedValue({
      _id: 'col-1',
      title: 'done',
      sprintId: 'sprint-1'
    } as any)
    mockedSprintModel.findOneById.mockResolvedValue({
      projectId: 'project-1'
    } as any)
    mockedProjectModel.findOneById.mockResolvedValue({
      ownerId: 'owner-1',
      members: [{ memberId: 'owner-1', role: 'owner', status: 'active' }]
    } as any)

    // Act
    await boardColumnService.deleteBoardColumnById({
      params: { id: 'col-1' },
      jwtDecoded: { id: 'owner-1' }
    } as any)

    // Assert
    expect(mockedBoardColumnModel.deleteById).toHaveBeenCalledWith('col-1')
    expect(mockedTaskModel.deleteByBoardColumnId).toHaveBeenCalledWith('col-1')
  })
})
