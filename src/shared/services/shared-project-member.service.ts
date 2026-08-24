import { Injectable } from '@nestjs/common'
import { isForeignKeyConstraintPrismaError, isNotFoundPrismaError } from '../helpers'
import { missingEmailsError, NotFoundRecordException } from '../error'
import { WebsiteDomain } from '../constants/auth.constants'
import { SharedUserRepository } from '../repositories/shared-user.repo'
import { EmailService } from './email.service'
import { ProjectMemberStatus } from '../constants/project.constants'
import { v4 as uuidv4 } from 'uuid'
import {
  InviteProjectMemberBodyType,
  GetProjectMembersDetailResType
} from '~/routes/project/project-member/project-member.model'
import {
  ProjectMemberAlreadyExistsError,
  ProjectMemberInvalidReferenceError
} from '~/routes/project/project-member/project-member.error'
import { SharedProjectMemberRepo } from '../repositories/shared-project-member.repo'
import { QueueService } from '~/routes/queue/queue.service'

@Injectable()
export class SharedProjectMemberService {
  constructor(
    private readonly sharedUserRepo: SharedUserRepository,
    private readonly emailService: EmailService,
    private readonly sharedProjectMemberRepo: SharedProjectMemberRepo,
    private readonly queueService: QueueService
  ) {}

  async invite(body: InviteProjectMemberBodyType & { invitedById?: string }) {
    try {
      // Destructure projectId and members from the body
      const { projectId, members, invitedById } = body

      const invitedMembers: GetProjectMembersDetailResType = []

      const emailNotExisting: string[] = []

      // Check project, members{email, role} is exist
      for (const member of members) {
        const { email, role } = member
        if (!email) {
          throw ProjectMemberInvalidReferenceError
        }

        const user = await this.sharedUserRepo.findByEmail(email)
        if (!user) {
          emailNotExisting.push(email)
          continue
        }

        // Check if member already exists in the project
        const existingMember = await this.sharedProjectMemberRepo.findMemberByProjectAndEmail(projectId, email)
        if (existingMember) {
          if (existingMember.status === ProjectMemberStatus.ACTIVE) {
            throw ProjectMemberAlreadyExistsError
          }

          // If invitation is pending, regenerate the token and resend the email
          const inviteToken = uuidv4()
          const [updatedMember] = await Promise.all([
            this.sharedProjectMemberRepo.updateInviteToken(existingMember.id, inviteToken, role, invitedById),
            this.queueService.sendInvitationEmail({
              email,
              token: inviteToken,
              websiteDomain: WebsiteDomain,
              role,
              projectId
            })
          ])

          invitedMembers.push(updatedMember)
        } else {
          // Create new invitation
          const inviteToken = uuidv4()
          const [newMember] = await Promise.all([
            this.sharedProjectMemberRepo.createInvite({
              projectId,
              memberId: user.id,
              email,
              role,
              inviteToken,
              invitedById
            }),
            this.queueService.sendInvitationEmail({
              email,
              token: inviteToken,
              websiteDomain: WebsiteDomain,
              role,
              projectId
            })
          ])

          invitedMembers.push(newMember)
        }
      }

      if (emailNotExisting.length > 0) {
        throw missingEmailsError(emailNotExisting, [])
      }

      return invitedMembers
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw NotFoundRecordException
      }

      if (isForeignKeyConstraintPrismaError(error)) {
        throw ProjectMemberInvalidReferenceError
      }
      throw error
    }
  }
}
