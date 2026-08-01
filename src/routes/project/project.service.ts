import { Injectable } from '@nestjs/common'
import { CreateProjectBodyType } from './project.model'
import { ProjectRepo } from './project.repo'
import { GetListQueryType } from '~/shared/models/request.model'
import { isNotFoundPrismaError } from '~/shared/helpers'
import {
  ProjectNotFoundError,
  ProjectForbiddenError,
  CannotTransferToSelfError,
  TargetUserNotMemberError
} from './project.error'
import { SharedProjectRepository } from '~/shared/repositories/shared-project.repo'
import { ProjectMemberStatus } from '~/shared/constants/project.constants'
import { NotFoundRecordException } from '~/shared/error'
import { Prisma } from '~/generated/prisma/client'
import { SharedUserRepository } from '~/shared/repositories/shared-user.repo'
import { SharedProjectMemberService } from '~/shared/services/shared-project-member.service'
import { SharedRoleRepository } from '~/shared/repositories/shared-role.repo'

@Injectable()
export class ProjectService {
  constructor(
    private readonly projectRepo: ProjectRepo,
    private readonly sharedProjectRepo: SharedProjectRepository,
    private readonly sharedUserRepository: SharedUserRepository,
    private readonly sharedProjectMemberService: SharedProjectMemberService,
    private readonly sharedRoleRepository: SharedRoleRepository
  ) {}

  async findAll(query: GetListQueryType, userId: string) {
    return await this.projectRepo.findAll(query, userId)
  }

  async findAllOwnedByUser(userId: string, query: GetListQueryType) {
    return await this.projectRepo.findAllOwnedByUser(userId, query)
  }

  async findAllJoinedByUser(userId: string, query: GetListQueryType) {
    return await this.projectRepo.findAllJoinedByUser(userId, query)
  }

  async findById(id: string) {
    return await this.sharedProjectRepo.findProjectById(id)
  }

  async create({ body, ownerId }: { body: CreateProjectBodyType; ownerId: string }) {
    const { members, ...projectData } = body
    const owner = await this.sharedUserRepository.findUnique({ id: ownerId })
    if (!owner) {
      throw NotFoundRecordException
    }

    const ownerRoleId = await this.sharedRoleRepository.getOwnerRoleId()

    const membersToCreate: Prisma.ProjectMemberUncheckedCreateWithoutProjectInput[] = [
      {
        email: owner.email,
        memberId: owner.id,
        roleId: ownerRoleId,
        status: ProjectMemberStatus.ACTIVE
      }
    ]

    const project = await this.projectRepo.create({
      projectData,
      ownerId,
      membersToCreate
    })

    if (members && members.length > 0) {
      const uniqueInputMembers = Array.from(
        new Map(
          members.filter((member) => member.email !== owner.email).map((member) => [member.email, member])
        ).values()
      )

      if (uniqueInputMembers.length > 0) {
        await this.sharedProjectMemberService.invite({
          projectId: project.id,
          members: uniqueInputMembers,
          invitedById: ownerId
        })
      }
    }

    const updatedProject = await this.sharedProjectRepo.findProjectById(project.id)
    if (!updatedProject) {
      throw NotFoundRecordException
    }

    return updatedProject
  }

  async update({ id, body, updatedById }: { id: string; body: CreateProjectBodyType; updatedById: string }) {
    try {
      return await this.projectRepo.update({ id, body, updatedById })
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw ProjectNotFoundError
      }
      throw error
    }
  }

  async delete({ id, deletedById }: { id: string; deletedById: string }, isHard?: boolean) {
    try {
      await this.projectRepo.delete({ id, deletedById }, isHard)

      return { message: 'Project deleted successfully' }
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw ProjectNotFoundError
      }
      throw error
    }
  }

  async transfer({
    projectId,
    newOwnerId,
    requesterId
  }: {
    projectId: string
    newOwnerId: string
    requesterId: string
  }) {
    if (newOwnerId === requesterId) {
      throw CannotTransferToSelfError
    }

    const project = await this.sharedProjectRepo.findProjectById(projectId)
    if (!project) {
      throw ProjectNotFoundError
    }

    if (project.ownerId !== requesterId) {
      throw ProjectForbiddenError
    }

    const targetMember = project.members.find(
      (m) => m.memberId === newOwnerId && m.status === ProjectMemberStatus.ACTIVE
    )
    if (!targetMember) {
      throw TargetUserNotMemberError
    }

    const ownerRoleId = await this.sharedRoleRepository.getOwnerRoleId()
    const coOwnerRoleId = await this.sharedRoleRepository.getCoOwnerRoleId()

    const requesterMember = project.members.find(
      (m) => m.memberId === requesterId && m.status === ProjectMemberStatus.ACTIVE
    )

    return await this.projectRepo.transfer({
      projectId,
      newOwnerId,
      requesterId,
      requesterMemberId: requesterMember?.id,
      targetMemberId: targetMember.id,
      ownerRoleId,
      coOwnerRoleId
    })
  }
}

