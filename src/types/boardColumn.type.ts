import { ObjectId } from 'mongodb'

interface IBoardColumn {
  _id?: ObjectId
  sprintId: ObjectId
  title: 'backlog' | 'todo' | 'in_process' | 'review' | 'done'
  taskOrderIds: string[]
  createdAt: Date | number
  updatedAt: Date | number | null
}

interface CreateBoardColumnRequest {
  sprintId: string
  title: 'backlog' | 'todo' | 'in_process' | 'review' | 'done'
}

interface CreateBoardColumnResponse {
  message: string
  data: Partial<IBoardColumn>
}

interface UpdateBoardColumnRequest {
  title?: 'todo' | 'in_process' | 'review' | 'done'
  taskOrderIds?: string[]
}

interface UpdateBoardColumnResponse {
  message: string
  data: Partial<IBoardColumn>
}

interface GetBoardColumnResponse {
  message: string
  data: Partial<IBoardColumn>
}

interface GetAllBoardColumnsResponse {
  message: string
  data: Array<Partial<IBoardColumn>>
}

export type {
  IBoardColumn,
  CreateBoardColumnRequest,
  CreateBoardColumnResponse,
  UpdateBoardColumnRequest,
  UpdateBoardColumnResponse,
  GetBoardColumnResponse,
  GetAllBoardColumnsResponse
}
