import { Request } from 'express'
import { projectModel } from '~/models/project.model'
import { WEBSITE_DOMAIN } from '~/utils/constants'
import { BrevoProvider } from '~/providers/BrevoProvider'
import { userModel } from '~/models/user.model'
import { v4 as uuidv4 } from 'uuid'
import ApiError from '~/utils/ApiError'
import { StatusCodes } from 'http-status-codes'
import { pickProject } from '~/utils/formatter'
import { CloudinaryProvider } from '~/providers/CloudinaryProvider'
import { sprintModel } from '~/models/sprint.model'
import { boardColumnModel } from '~/models/boardColumn.model'
import { taskModel } from '~/models/task.model'
import { notificationService } from '~/services/notification.service'

/**
 * Create a new project
 * @param req Project Data from request
 * @returns The created project document
 */
const createNew = async (req: Request): Promise<any> => {
  try {
    const { name, description, members } = req.body

    // Get user ID from JWT token
    const ownerId = req.jwtDecoded.id
    // Get user email from JWT token
    const ownerEmail = req.jwtDecoded.email

    // Check if project name already exists for the owner
    const existingProject = await projectModel.findOneByNameAndOwnerId(
      name,
      ownerId
    )
    if (existingProject) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        'You already have a project with this name.'
      )
    }

    // Prepare members with invitation tokens
    const preparedMembers = []

    // Push owner as active member
    preparedMembers.push({
      memberId: ownerId,
      email: ownerEmail,
      role: 'owner',
      status: 'active',
      joinAt: Date.now(),
      inviteToken: ''
    })

    if (members && members.length > 0) {
      for (const member of members) {
        // Check if user exists
        const existingUser = await userModel.findOneByEmail(member.email)

        if (!existingUser) {
          throw new ApiError(
            StatusCodes.BAD_REQUEST,
            `User with email ${member.email} does not exist.`
          )
        }

        const memberData = {
          memberId: existingUser._id?.toString(),
          email: member.email,
          role: member.role || 'member',
          inviteToken: uuidv4(),
          status: 'pending'
        }

        preparedMembers.push(memberData)
      }
    }

    // Upload project image if provided
    let uploadedImage = null
    if (req.file && req.file.buffer) {
      uploadedImage = await CloudinaryProvider.uploadFromBuffer(
        req.file.buffer,
        'project',
        req.file.originalname,
        false
      )
    }

    // Prepare new project data
    const newProjectData: any = {
      ownerId,
      name,
      description,
      members: preparedMembers
    }

    if (uploadedImage) {
      newProjectData.imageUrl = uploadedImage.secure_url
      newProjectData.imagePublicId = uploadedImage.public_id
    }

    const createdProject = await projectModel.createNew(newProjectData)

    if (!createdProject) {
      throw new ApiError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Failed to create project'
      )
    }

    // Send Notification for owner
    await notificationService.createNotification(
      'project_created',
      'Project Created',
      `You have successfully created the project "${name}".`,
      ownerId,
      ''
    )

    if (preparedMembers.length > 1) {
      const createdProjectId = createdProject._id.toString()
      // Send invitation emails to members
      for (const member of preparedMembers) {
        if (member.email === ownerEmail) continue // Skip owner
        const existingUser = await userModel.findOneByEmail(member.email)
        await inviteMember(member, name, existingUser, createdProjectId)
      }
    }

    return pickProject(createdProject)
  } catch (error: any) {
    if (req.file) {
      await CloudinaryProvider.deleteImage((req.file as any).filename)
    }
    throw error
  }
}

/**
 * Get all projects of a user
 * @param userId id of the user
 * @returns Array of projects the user owns
 */
const getAllUserOwnedProjects = async (userId: string): Promise<any[]> => {
  try {
    const projects = await projectModel.findByUserId(userId)
    return projects
  } catch (error: any) {
    throw error
  }
}

/**
 * Get all projects a user is participating in
 * @param userId id of the user
 * @returns Array of projects the user is a member of
 */
const getAllUserParticipatedProjects = async (
  userId: string
): Promise<any[]> => {
  try {
    const projects = await projectModel.findByMemberId(userId)
    return projects
  } catch (error: any) {
    throw error
  }
}

/**
 * Update project details
 * @param req Request object containing project update data
 * @returns The updated project document
 */
const updateProject = async (req: Request): Promise<any> => {
  try {
    // Project ID from params
    const { id } = req.params

    // UserId from JWT
    const userId = req.jwtDecoded.id

    const existingProject = await projectModel.findOneById(id)
    if (!existingProject) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Project not found')
    }
    if (existingProject.ownerId.toString() !== userId) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'You are not authorized to update this project'
      )
    }
    // Upload project image if provided
    let uploadedImage = null
    if (req.file && req.file.buffer) {
      uploadedImage = await CloudinaryProvider.uploadFromBuffer(
        req.file.buffer,
        'project',
        req.file.originalname,
        false
      )
    }
    // Prepare update data
    if (uploadedImage) {
      // Delete old image if exists
      if (existingProject.imagePublicId) {
        await CloudinaryProvider.deleteImage(existingProject.imagePublicId)
      }
      req.body.imageUrl = uploadedImage.secure_url
      req.body.imagePublicId = uploadedImage.public_id
    }

    const updateData: any = {
      ...req.body,
      updatedAt: Date.now()
    }
    const updatedProject = await projectModel.update(id, updateData)

    if (!updatedProject) {
      throw new ApiError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Failed to update project'
      )
    }

    // Get Creator Name
    const creator = await userModel.findOneById(
      updatedProject.ownerId.toString()
    )
    const creatorName = creator
      ? creator.displayName || creator.email
      : 'Someone'

    // Noftification for project update
    await notificationService.createNotification(
      'project_updated',
      'Project Updated',
      `${creatorName} updated project "${updatedProject.name}".`,
      '',
      updatedProject._id.toString()
    )

    return pickProject(updatedProject)
  } catch (error: any) {
    if (req.file) {
      await CloudinaryProvider.deleteImage((req.file as any).filename)
    }
    throw error
  }
}

/**
 * Delete project by id
 * @param req Request object containing project id
 */
const deleteProjectById = async (req: Request): Promise<void> => {
  try {
    // Project ID from params
    const { id } = req.params

    // UserId from JWT
    const userId = req.jwtDecoded.id

    const existingProject = await projectModel.findOneById(id)
    if (!existingProject) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Project not found')
    }

    if (existingProject.ownerId.toString() !== userId) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'You are not authorized to delete this project'
      )
    }
    // Delete project image if exists
    if (existingProject.imagePublicId) {
      await CloudinaryProvider.deleteImage(existingProject.imagePublicId)
    }

    // Delete all associated sprints could be handled here or in a DB trigger
    // Delete associated sprints
    const sprints = await sprintModel.findByProjectId(id)
    for (const sprint of sprints) {
      // Delete associated board columns
      if (sprint._id) {
        await boardColumnModel.deleteBySprintId(sprint._id.toString())
      }

      // Delete tasks associated with the sprint
      await taskModel.deleteBySprintId(sprint._id?.toString() || '')
    }

    // delete the sprints
    await sprintModel.deleteSprintsByProjectId(id)

    // Finally, delete the project
    const result = await projectModel.deleteById(id)

    const owner = await userModel.findOneById(
      existingProject.ownerId.toString()
    )
    const ownerName = owner ? owner.displayName || owner.email : 'Someone'

    if (result) {
      for (const member of existingProject.members) {
        if (member.memberId.toString() === userId) continue
        if (member.status !== 'active') continue
        // Notification for all member in project deletion
        await notificationService.createNotification(
          'project_deleted',
          'Project Deleted',
          `A project named "${existingProject.name}" has been deleted by ${ownerName}.`,
          member.memberId.toString()
        )
      }
    }
  } catch (error: any) {
    throw error
  }
}

/**
 * Accept project invitation
 * @param req Request object containing invitation details
 * @returns The updated project document
 */
const acceptInvitation = async (req: Request): Promise<any> => {
  try {
    const { email, token, projectId } = req.body

    const project = await projectModel.findOneById(projectId)
    if (!project) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Project not found')
    }
    const member = project.members.find(
      (m) => m.email === email && m.inviteToken === token
    )

    if (!member) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        'Invalid invitation token or email'
      )
    }

    // Update member status to active
    member.status = 'active'
    member.joinAt = Date.now()
    member.inviteToken = ''

    const result = await projectModel.update(projectId, {
      members: project.members
    })

    if (!result) {
      throw new ApiError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Failed to accept invitation'
      )
    }

    // Fetch joining user details
    const joiningUser = await userModel.findOneByEmail(email)

    if (!joiningUser) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'User not found')
    }
    // Notify joining user
    await notificationService.createNotification(
      'invitation_accepted',
      'Invitation Accepted',
      `You have successfully joined the project "${project.name}".`,
      joiningUser._id?.toString(),
      ''
    )

    // Notify for project
    await notificationService.createNotification(
      'project_member_joined',
      'New Member Joined',
      `${joiningUser.displayName} has joined the project "${project.name}".`,
      joiningUser._id?.toString(),
      projectId
    )

    return pickProject(result)
  } catch (error: any) {
    throw error
  }
}

/**
 * Invite member to project via email
 * @param member member requiring invitation
 * @param projectName name of the project
 * @param existingUser existing user data
 * @param projectId id of the project
 */
const inviteMember = async (
  member: any,
  projectName: string,
  existingUser: any,
  projectId: string
) => {
  try {
    const verificationLink = `${WEBSITE_DOMAIN}/invite?email=${member.email}&token=${member.inviteToken}&projectId=${projectId}`

    const customSubject = `Sprintos: You've been invited to join "${projectName}" project!`

    const greeting = existingUser ? `Hi ${existingUser.displayName},` : 'Hello,'

    const message = existingUser
      ? `You've been invited to join the project <b>${projectName}</b> on Sprintos.`
      : `You've been invited to join the project <b>${projectName}</b> on Sprintos. You'll need to create an account first.`

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 32px 0;">
        <div style="max-width: 480px; margin: auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.07); padding: 32px;">
          <h2 style="color: #2d8cf0; margin-bottom: 16px;">Project Invitation</h2>
          <p style="font-size: 16px; color: #333;">${greeting}</p>
          <p style="font-size: 15px; color: #444;">${message}</p>
          <p style="font-size: 15px; color: #444;">Your role: <b>${member.role}</b></p>
          <a href="${verificationLink}" style="display: flex; justify-content: center; align-items: center; margin: 24px 0; padding: 12px 28px; background: #2d8cf0; color: #fff; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">Accept Invitation</a>
          <p style="font-size: 13px; color: #888;">If the button doesn't work, copy and paste this link into your browser:</p>
          <div style="word-break: break-all; background: #f4f4f4; padding: 8px 12px; border-radius: 4px; font-size: 13px; color: #2d8cf0;">${verificationLink}</div>
          <hr style="margin: 32px 0 16px 0; border: none; border-top: 1px solid #eee;">
          <div style="font-size: 13px; color: #888;">
            Sincerely,<br/>
            <b>Sprintos Team</b>
          </div>
        </div>
      </div>
    `

    await BrevoProvider.sendEmail(member.email, customSubject, htmlContent)

    // Send in-app notification
    if (existingUser && existingUser._id) {
      await notificationService.createNotification(
        'project_invitation',
        'Project Invitation',
        `You have been invited to join project "${projectName}"`,
        existingUser._id.toString(),
        ''
      )
    }
  } catch (error: any) {
    throw error
  }
}

/**
 * Invite a new member to project
 * @param req Request object containing project id, email and role
 * @returns Updated project data
 */
const inviteMemberToProject = async (req: Request): Promise<any> => {
  try {
    const { projectId, email, role } = req.body
    const userId = req.jwtDecoded.id

    // Check if project exists
    const project = await projectModel.findOneById(projectId)
    if (!project) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Project not found')
    }

    // Check if user is owner
    if (
      project.ownerId.toString() !== userId &&
      project.members.find((m) => m.memberId.toString() === userId)?.role !==
        'owner'
    ) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'Only project owner can invite members'
      )
    }

    // Check if user exists
    const existingUser = await userModel.findOneByEmail(email)
    if (!existingUser) {
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        `User with email ${email} does not exist`
      )
    }

    // Check if user is already a member
    const isMember = project.members.some(
      (m) => m.email === email && m.inviteToken === ''
    )
    if (isMember) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        'User is already a member of this project'
      )
    }

    // Check if user is pending invitation
    const isPending = project.members.some(
      (m) => m.email === email && m.inviteToken !== ''
    )

    // If pending, resend invitation
    if (isPending) {
      const member = project.members.find(
        (m) => m.email === email && m.inviteToken !== ''
      )
      if (!member) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Pending member not found')
      }
      // Update new token
      member.inviteToken = uuidv4()
      await projectModel.update(projectId, { members: project.members })

      // Resend invitation email
      await inviteMember(member, project.name, existingUser, projectId)
      return pickProject(project)
    }

    // Create new member data
    const newMember: any = {
      memberId: existingUser._id?.toString(),
      email: email,
      role: role,
      status: 'pending',
      inviteToken: uuidv4(),
      invitedAt: Date.now()
    }

    // Add member to project
    const updatedProject = await projectModel.addMember(projectId, newMember)

    if (!updatedProject) {
      throw new ApiError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Failed to invite member'
      )
    }

    // Notify project about new member invitation
    await notificationService.createNotification(
      'project_member_invited',
      'Member Invited',
      `Member with email "${email}" has been invited to the project.`,
      '',
      projectId
    )

    // Send invitation email
    await inviteMember(newMember, project.name, existingUser, projectId)

    return pickProject(updatedProject)
  } catch (error) {
    throw error
  }
}

/**
 * Update member role in project
 * @param req Request object containing project id, member id and new role
 * @returns Updated project data
 */
const updateMemberInProject = async (req: Request): Promise<any> => {
  try {
    const { projectId, memberId } = req.params
    const { role } = req.body
    const userId = req.jwtDecoded.id

    // Check if project exists
    const project = await projectModel.findOneById(projectId)
    if (!project) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Project not found')
    }

    // Check if user is owner
    if (
      project.ownerId.toString() !== userId &&
      project.members.find((m) => m.memberId.toString() === userId)?.role !==
        'owner'
    ) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'Only project primary owner can update member roles'
      )
    }

    // Check if member exists in project
    const member = project.members.find(
      (m) => m.memberId.toString() === memberId
    )
    if (!member) {
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        'Member not found in this project'
      )
    }

    // Prevent changing owner's role
    if (member.role === 'owner' && project.ownerId.toString() !== userId) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        'Cannot change role of the project owner. Please contact the primary owner.'
      )
    }

    // Update member role
    const updatedProject = await projectModel.updateMember(
      projectId,
      memberId,
      {
        role
      }
    )

    // Notify member about role change
    await notificationService.createNotification(
      'member_role_changed',
      'Member Role Changed',
      `Your role in project "${project.name}" has been changed to "${role}".`,
      memberId
    )

    // Notify project about member role change
    await notificationService.createNotification(
      'project_role_changed',
      'Project Role Changed',
      `Member with email "${member.email}" role has been changed to "${role}".`,
      '',
      projectId
    )

    return pickProject(updatedProject)
  } catch (error) {
    throw error
  }
}

/**
 * Remove member from project
 * @param req Request object containing project id and member id
 * @returns Success message
 */
const removeMemberFromProject = async (req: Request): Promise<void> => {
  try {
    const { projectId, memberId } = req.params
    const userId = req.jwtDecoded.id

    // Check if project exists
    const project = await projectModel.findOneById(projectId)
    if (!project) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Project not found')
    }

    // Check if user is owner
    if (
      project.ownerId.toString() !== userId &&
      project.members.find((m) => m.memberId.toString() === userId)?.role !==
        'owner'
    ) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'Only project owner can remove members'
      )
    }

    // Check if member exists in project
    const member = project.members.find(
      (m) => m.memberId.toString() === memberId
    )
    if (!member) {
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        'Member not found in this project'
      )
    }

    // Remove member from project
    const result = await projectModel.removeMember(projectId, memberId)

    if (result) {
      // Notify member about removal
      await notificationService.createNotification(
        'member_removed',
        'Removed from Project',
        `You have been removed from project "${project.name}".`,
        memberId
      )

      // Notify project about member removal
      await notificationService.createNotification(
        'project_member_removed',
        'Member Removed',
        `Member with email "${member.email}" has been removed from the project.`,
        '',
        projectId
      )
    }
  } catch (error) {
    throw error
  }
}

/**
 * Get project by id
 * @param req Request object containing project id
 * @returns Project data
 */
const getProjectById = async (req: Request): Promise<any> => {
  try {
    const { id } = req.params
    const userId = req.jwtDecoded.id

    const project = await projectModel.findOneById(id)
    if (!project) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Project not found')
    }

    // Kiểm tra quyền truy cập: owner hoặc là member active
    const isMember = project.members.some(
      (m) => m.memberId.toString() === userId && m.status === 'active'
    )
    if (!isMember && project.ownerId.toString() !== userId) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'You do not have access to this project')
    }

    return pickProject(project)
  } catch (error) {
    throw error
  }
}

export const projectService = {
  createNew,
  inviteMember,
  acceptInvitation,
  getAllUserOwnedProjects,
  getAllUserParticipatedProjects,
  updateProject,
  deleteProjectById,
  inviteMemberToProject,
  updateMemberInProject,
  removeMemberFromProject,
  getProjectById
}
