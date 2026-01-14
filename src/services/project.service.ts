import { Request } from 'express'
import { projectModel } from '~/models/project.model'
import { WEBSITE_DOMAIN } from '~/utils/constants'
import { BrevoProvider } from '~/providers/BrevoProvider'
import { userModel } from '~/models/user.model'
import { v7 as uuidv7 } from 'uuid'
import ApiError from '~/utils/ApiError'
import { StatusCodes } from 'http-status-codes'
import { pickProject } from '~/utils/formatter'
import { CloudinaryProvider } from '~/providers/CloudinaryProvider'

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
          inviteToken: uuidv7(),
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
      try {
        await CloudinaryProvider.deleteImage((req.file as any).filename)
      } catch (deleteError) {
        // eslint-disable-next-line no-console
        console.error('Failed to cleanup uploaded image:', deleteError)
      }
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
  } catch (error: any) {
    throw error
  }
}

export const projectService = {
  createNew,
  inviteMember,
  acceptInvitation,
  getAllUserOwnedProjects,
  getAllUserParticipatedProjects
}
