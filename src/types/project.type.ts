import { ObjectId } from 'mongodb'

interface IMember {
  memberId: ObjectId
  email: string
  role: string
  joinAt: Date | number
  inviteToken: string
  invitedAt: Date | number
  status: string
}

interface IProject {
  _id: ObjectId
  ownerId: ObjectId
  name: string
  description: string
  imageUrl: string
  imagePublicId: string
  members: Array<IMember>
  createdAt: Date | number
  updateAt: Date | number | null
  _destroy: boolean
}

interface CreateProjectRequest {
  name: string
  description?: string
  members?: Array<{
    email: string
    role: 'owner' | 'member' | 'viewer'
  }>
}

interface CreateProjectResponse {
  message: string
  data: Partial<IProject>
}

interface AcceptProjectInvitationRequest {
  inviteToken: string
  email: string
  projectId: string
}

interface AcceptProjectInvitationResponse {
  message: string
  data: Partial<IProject>
}

interface GetAllProjectsResponse {
  message: string
  data: Array<Partial<IProject>>
}

export type {
  IProject,
  IMember,
  CreateProjectRequest,
  CreateProjectResponse,
  GetAllProjectsResponse,
  AcceptProjectInvitationRequest,
  AcceptProjectInvitationResponse
}
