import { ObjectId } from 'mongodb'

interface IComment {
  memberId: string
  memberDisplayName: string
  memberAvatar: string
  content: string
  createdAt: Date | number
}

interface IAttachment {
  fileName: string
  fileType: string
  fileUrl: string
  createdAt: Date | number
}

interface ITask {
  _id?: ObjectId
  sprintId: ObjectId
  boardColumnId: ObjectId
  title: string
  description: string
  labels: 'task' | 'bug' | 'feature' | 'story'
  priority: 'low' | 'medium' | 'high' | 'critical'
  storyPoint: number
  dueDate: Date | number
  assigneeIds: ObjectId[]
  comments: IComment[]
  attachments: IAttachment[]
  createdAt: Date | number
  updatedAt: Date | number | null
}

interface CreateTaskRequest {
  sprintId: string
  title: string
  description?: string
  labels?: 'task' | 'bug' | 'feature' | 'story'
  priority?: 'low' | 'medium' | 'high' | 'critical'
  storyPoint?: number
  dueDate?: Date | number
  assigneeIds?: string[]
}

interface CreateTaskResponse {
  message: string
  data: Partial<ITask>
}

interface UpdateTaskRequest {
  title?: string
  description?: string
  labels?: 'task' | 'bug' | 'feature' | 'story'
  priority?: 'low' | 'medium' | 'high' | 'critical'
  storyPoint?: number
  dueDate?: Date | number
  assigneeIds?: string[]
  boardColumnId?: string
}

interface UpdateTaskResponse {
  message: string
  data: Partial<ITask>
}

interface GetTaskResponse {
  message: string
  data: Partial<ITask>
}

interface GetAllTasksResponse {
  message: string
  data: Array<Partial<ITask>>
}

interface AddCommentRequest {
  content: string
}

interface AddCommentResponse {
  message: string
  data: Partial<ITask>
}

interface AddAttachmentRequest {
  fileName: string
  fileType: string
  fileUrl: string
}

interface AddAttachmentResponse {
  message: string
  data: Partial<ITask>
}

export type {
  ITask,
  IComment,
  IAttachment,
  CreateTaskRequest,
  CreateTaskResponse,
  UpdateTaskRequest,
  UpdateTaskResponse,
  GetTaskResponse,
  GetAllTasksResponse,
  AddCommentRequest,
  AddCommentResponse,
  AddAttachmentRequest,
  AddAttachmentResponse
}
