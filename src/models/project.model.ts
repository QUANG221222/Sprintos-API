import Joi from 'joi'
import { IMember, IProject } from '~/types/project.type'
import { GET_DB } from '~/configs/mongodb'
import { ObjectId } from 'mongodb'
import { EMAIL_RULE, EMAIL_RULE_MESSAGE } from '~/utils/validator'

const COLLECTION_NAME = 'projects'
const COLLECTION_SCHEMA: Joi.ObjectSchema<IProject> = Joi.object({
  ownerId: Joi.string().required(),
  name: Joi.string().min(3).max(100).required(),
  description: Joi.string().max(500).optional().allow(''),
  members: Joi.array()
    .items(
      Joi.object({
        memberId: Joi.string().required(),
        email: Joi.string()
          .pattern(EMAIL_RULE)
          .message(EMAIL_RULE_MESSAGE)
          .required(),
        role: Joi.string().valid('owner', 'member', 'viewer').required(),
        status: Joi.string().valid('active', 'pending').default('pending'),
        inviteToken: Joi.string().optional().allow(''),
        joinAt: Joi.date().timestamp('javascript').default(null),
        invitedAt: Joi.date().timestamp('javascript').default(Date.now)
      })
    )
    .default([]),
  imageUrl: Joi.string().optional().allow(''),
  imagePublicId: Joi.string().optional().allow(''),
  createdAt: Joi.date().timestamp('javascript').default(Date.now),
  updatedAt: Joi.date().timestamp('javascript').default(null),
  _destroy: Joi.boolean().default(false)
})

const INVALID_UPDATE_FIELDS = ['_id', 'ownerId', 'createdAt']

/**
 * Create a new project in the database
 * @param projectData Partial project data to create a new project
 * @returns The created project document
 */
const createNew = async (projectData: Partial<IProject>): Promise<any> => {
  try {
    const validatedProjectData = await COLLECTION_SCHEMA.validateAsync(
      projectData,
      {
        abortEarly: false
      }
    )
    const newProject = {
      ...validatedProjectData,
      members: validatedProjectData.members.map((member) => ({
        ...member,
        memberId: new ObjectId(member.memberId),
        joinAt: member.joinAt ? new Date(member.joinAt).getTime() : null,
        invitedAt: member.invitedAt
          ? new Date(member.invitedAt).getTime()
          : new Date().getTime()
      })),
      ownerId: new ObjectId(validatedProjectData.ownerId)
    }
    const createdProject = await GET_DB()
      .collection(COLLECTION_NAME)
      .insertOne(newProject)

    return await findOneById(createdProject.insertedId.toString())
  } catch (error: any) {
    throw new Error(error)
  }
}

/**
 * Find one project by its id
 * @param id id of the project
 * @returns The project document or null if not found
 */
const findOneById = async (id: string): Promise<IProject | null> => {
  try {
    const result = await GET_DB()
      .collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id), _destroy: false })
    return result as IProject | null
  } catch (error: any) {
    throw new Error(error)
  }
}

/**
 * Find one project by name and owner id
 * @param name Name of the project
 * @param ownerId Owner ID of the project
 * @returns The project document or null if not found
 */
const findOneByNameAndOwnerId = async (
  name: string,
  ownerId: string
): Promise<IProject | null> => {
  try {
    const result = await GET_DB()
      .collection(COLLECTION_NAME)
      .findOne({ name, ownerId: new ObjectId(ownerId), _destroy: false })
    return result as IProject | null
  } catch (error: any) {
    throw new Error(error)
  }
}

/**
 * Find projects by user id
 * @param userId id of the user
 * @returns Array of projects the user is a member of
 */
const findByUserId = async (userId: string) => {
  try {
    const results = await GET_DB()
      .collection(COLLECTION_NAME)
      .find({
        ownerId: new ObjectId(userId)
      })
      .toArray()

    return results as IProject[]
  } catch (error) {
    throw new Error(error as string)
  }
}

/**
 * Find projects by member id
 * @param memberId id of the member
 * @returns array of projects the member is part of
 */
const findByMemberId = async (memberId: string) => {
  try {
    const results = await GET_DB()
      .collection(COLLECTION_NAME)
      .find({
        'members.memberId': new ObjectId(memberId),
        ownerId: { $ne: new ObjectId(memberId) },
        _destroy: false
      })
      .toArray()
    return results as IProject[]
  } catch (error) {
    throw new Error(error as string)
  }
}

/**
 * Update a project by its id
 * @param id id of the project
 * @param updateData Partial project data to update
 * @returns The updated project document or null if not found
 */
const update = async (id: string, updateData: Partial<IProject>) => {
  try {
    // Remove invalid fields
    Object.keys(updateData).forEach((fieldName) => {
      if (INVALID_UPDATE_FIELDS.includes(fieldName)) {
        delete updateData[fieldName as keyof IProject]
      }
    })

    const result = await GET_DB()
      .collection(COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateData },
        { returnDocument: 'after' }
      )

    return result as IProject | null
  } catch (error) {
    throw new Error(error as string)
  }
}

/**
 * Delete a project by its id (soft delete)
 * @param id id of the project
 * @returns The deleted project document or null if not found
 */
const deleteById = async (id: string) => {
  try {
    const result = await GET_DB()
      .collection(COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { _destroy: true } },
        { returnDocument: 'after' }
      )

    return result as IProject | null
  } catch (error) {
    throw new Error(error as string)
  }
}

/**
 * Add a member to a project
 * @param projectId id of the project
 * @param member member data to add
 * @returns The updated project document or null if not found
 */
const addMember = async (projectId: string, member: Partial<IMember>) => {
  try {
    const result = await GET_DB()
      .collection<IProject>(COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(projectId) },
        {
          $push: {
            members: {
              ...member,
              memberId: new ObjectId(member.memberId)
            } as IMember
          }
        },
        { returnDocument: 'after' }
      )

    return result as IProject | null
  } catch (error) {
    throw new Error(error as string)
  }
}

/**
 * Update a member in a project
 * @param projectId id of the project
 * @param memberId id of the member
 * @param updates Partial member data to update
 * @returns The updated project document or null if not found
 */
const updateMember = async (
  projectId: string,
  memberId: string,
  updates: Partial<IMember>
) => {
  try {
    const updateFields: any = {}

    Object.keys(updates).forEach((key) => {
      updateFields[`members.$.${key}`] = updates[key as keyof IMember]
    })

    const result = await GET_DB()
      .collection(COLLECTION_NAME)
      .findOneAndUpdate(
        {
          _id: new ObjectId(projectId),
          'members.memberId': new ObjectId(memberId)
        },
        { $set: updateFields },
        { returnDocument: 'after' }
      )

    return result as IProject | null
  } catch (error) {
    throw new Error(error as string)
  }
}

/**
 * Remove a member from a project
 * @param projectId id of the project
 * @param memberId id of the member
 * @returns The updated project document or null if not found
 */
const removeMember = async (projectId: string, memberId: string) => {
  try {
    const result = await GET_DB()
      .collection<IProject>(COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(projectId) },
        {
          $pull: {
            members: { memberId: new ObjectId(memberId) }
          }
        },
        { returnDocument: 'after' }
      )

    return result as IProject | null
  } catch (error) {
    throw new Error(error as string)
  }
}

export const projectModel = {
  createNew,
  findOneById,
  findByUserId,
  update,
  deleteById,
  addMember,
  updateMember,
  removeMember,
  findOneByNameAndOwnerId,
  findByMemberId
}
