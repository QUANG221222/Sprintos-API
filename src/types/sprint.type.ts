import { ObjectId } from 'mongodb'

interface ISprint {
  _id?: ObjectId
  projectId: ObjectId
  name: string
  goal: string
  maxStoryPoint: number
  startDate: Date | number
  endDate: Date | number
  status: 'planned' | 'active' | 'completed'
  createdAt: Date | number
  updatedAt: Date | number | null
}

interface CreateSprintRequest {
  projectId: string
  name: string
  goal?: string
  maxStoryPoint?: number
  startDate?: Date | number
  endDate?: Date | number
}

interface CreateSprintResponse {
  message: string
  data: Partial<ISprint>
}

interface UpdateSprintRequest {
  name?: string
  goal?: string
  maxStoryPoint?: number
  startDate?: Date | number
  endDate?: Date | number
  status?: 'planned' | 'active' | 'completed'
}

interface UpdateSprintResponse {
  message: string
  data: Partial<ISprint>
}

interface GetSprintResponse {
  message: string
  data: Partial<ISprint>
}

interface GetAllSprintsResponse {
  message: string
  data: Array<Partial<ISprint>>
}

export type {
  ISprint,
  CreateSprintRequest,
  CreateSprintResponse,
  UpdateSprintRequest,
  UpdateSprintResponse,
  GetSprintResponse,
  GetAllSprintsResponse
}
