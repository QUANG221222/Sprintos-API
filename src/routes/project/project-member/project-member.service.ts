import { SharedProjectMemberRepo } from './../../../shared/repositories/shared-project-member.repo'
import { Injectable } from '@nestjs/common'
import {
  GetProjectMemberListQueryType,
  UpdateProjectMemberRoleBodyType,
  VerifyProjectMemberInviteBodyType
} from './project-member.model'
import { ProjectMemberRepo } from './project-member.repo'
import {
  ProjectMemberInviteInvalidError,
  ProjectMemberNotFoundError,
  ProjectMemberOwnerOnlyError,
  ProjectMemberPrimaryOwnerDeleteError,
  ProjectMemberRoleChangeForbiddenError
} from './project-member.error'
import { ProjectNotFoundError } from '../project.error'
import { isNotFoundPrismaError } from '~/shared/helpers'
import { ProjectMemberRole } from '~/shared/constants/project.constants'

@Injectable()
export class ProjectMemberService {
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepo,
    private readonly sharedProjectMemberRepo: SharedProjectMemberRepo
  ) {}

  async findAll(query: GetProjectMemberListQueryType) {
    try {
      return await this.projectMemberRepo.findAllByProjectId(query)
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw ProjectNotFoundError
      }
      throw error
    }
  }

  async verifyInvite(body: VerifyProjectMemberInviteBodyType) {
    try {
      const invite = await this.sharedProjectMemberRepo.findInviteByToken(body.projectId, body.email, body.token)
      if (!invite) {
        throw ProjectMemberInviteInvalidError
      }

      return await this.projectMemberRepo.verifyInvite(invite.id, invite.memberId)
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw ProjectNotFoundError
      }
      throw error
    }
  }

  async updateRole({
    memberId,
    body,
    requesterId
  }: {
    memberId: number
    body: UpdateProjectMemberRoleBodyType
    requesterId: number
  }) {
    try {
      const { projectId, role } = body

      const project = await this.projectMemberRepo.findProjectById(projectId)
      if (!project) {
        throw ProjectNotFoundError
      }

      const isOwner = project.ownerId === requesterId

      const requesterMember = await this.sharedProjectMemberRepo.findMemberByProjectAndMemberId(projectId, requesterId)
      const isRequesterOwner =
        (requesterMember?.role === ProjectMemberRole.OWNER || requesterMember?.role === ProjectMemberRole.CO_OWNER) &&
        requesterMember?.status === 'ACTIVE'

      if (!isOwner && !isRequesterOwner) {
        throw ProjectMemberOwnerOnlyError
      }

      const targetMember = await this.sharedProjectMemberRepo.findMemberByProjectAndMemberId(projectId, memberId)
      if (!targetMember) {
        throw ProjectMemberNotFoundError
      }

      if (targetMember.memberId === project.ownerId && role !== ProjectMemberRole.OWNER) {
        throw ProjectMemberRoleChangeForbiddenError
      }

      if (
        (role === ProjectMemberRole.OWNER ||
          targetMember.role === ProjectMemberRole.OWNER ||
          role === ProjectMemberRole.CO_OWNER ||
          targetMember.role === ProjectMemberRole.CO_OWNER) &&
        !isOwner
      ) {
        throw ProjectMemberRoleChangeForbiddenError
      }

      return await this.projectMemberRepo.updateRole(targetMember.id, role, requesterId)
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw ProjectNotFoundError
      }
      throw error
    }
  }

  async removeMember(
    {
      memberId,
      projectId,
      requesterId
    }: {
      memberId: number
      projectId: string
      requesterId: number
    },
    isHard?: boolean
  ) {
    const project = await this.projectMemberRepo.findProjectById(projectId)
    if (!project) {
      throw ProjectNotFoundError
    }

    if (memberId === project.ownerId) {
      throw ProjectMemberPrimaryOwnerDeleteError
    }

    const isPrimaryOwner = project.ownerId === requesterId
    const requesterMember = await this.sharedProjectMemberRepo.findMemberByProjectAndMemberId(projectId, requesterId)
    const isRequesterOwner =
      (requesterMember?.role === ProjectMemberRole.OWNER || requesterMember?.role === ProjectMemberRole.CO_OWNER) &&
      requesterMember?.status === 'ACTIVE'

    if (!isPrimaryOwner && !isRequesterOwner) {
      throw ProjectMemberOwnerOnlyError
    }

    const targetMember = await this.sharedProjectMemberRepo.findMemberByProjectAndMemberId(projectId, memberId)
    if (!targetMember) {
      throw ProjectMemberNotFoundError
    }

    if (
      (targetMember.role === ProjectMemberRole.OWNER || targetMember.role === ProjectMemberRole.CO_OWNER) &&
      !isPrimaryOwner
    ) {
      throw ProjectMemberRoleChangeForbiddenError
    }

    await this.projectMemberRepo.deleteByProjectMemberId({ id: targetMember.id, deletedById: requesterId }, isHard)

    return {
      message: 'Project member deleted successfully'
    }
  }
}
