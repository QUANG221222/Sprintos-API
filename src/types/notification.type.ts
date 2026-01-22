import { ObjectId } from 'mongodb'

interface INotification {
  _id: ObjectId
  userId?: ObjectId
  projectId?: ObjectId
  taskId?: ObjectId
  type: string
  title: string
  message: string
  isRead: boolean
  createdAt: Date
}

export type { INotification }
