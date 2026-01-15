import Joi from 'joi'
import { ISprint } from '~/types/sprint.type'
import { GET_DB } from '~/configs/mongodb'
import { ObjectId } from 'mongodb'
import { OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validator'

const COLLECTION_NAME = 'sprints'
const COLLECTION_SCHEMA: Joi.ObjectSchema<ISprint> = Joi.object({
  projectId: Joi.string()
    .pattern(OBJECT_ID_RULE)
    .message(OBJECT_ID_RULE_MESSAGE)
    .required(),
  name: Joi.string().min(3).max(100).required(),
  goal: Joi.string().max(500).optional().allow(''),
  maxStoryPoint: Joi.number().min(0).default(0),
  startDate: Joi.date().timestamp('javascript').default(Date.now),
  endDate: Joi.date().timestamp('javascript').default(Date.now),
  status: Joi.string()
    .valid('planned', 'active', 'completed')
    .default('planned'),
  createdAt: Joi.date().timestamp('javascript').default(Date.now),
  updatedAt: Joi.date().timestamp('javascript').default(null)
})

const INVALID_UPDATE_FIELDS = ['_id', 'projectId', 'createdAt']

/**
 * Create a new sprint in the database
 * @param sprintData Partial sprint data to create a new sprint
 * @returns The created sprint document
 */
const createNew = async (sprintData: Partial<ISprint>): Promise<any> => {
  try {
    const validatedSprintData = await COLLECTION_SCHEMA.validateAsync(
      sprintData,
      {
        abortEarly: false
      }
    )
    const newSprint = {
      ...validatedSprintData,
      projectId: new ObjectId(validatedSprintData.projectId),
      startDate: new Date(validatedSprintData.startDate).getTime(),
      endDate: new Date(validatedSprintData.endDate).getTime()
    }
    const createdSprint = await GET_DB()
      .collection(COLLECTION_NAME)
      .insertOne(newSprint)

    return await findOneById(createdSprint.insertedId.toString())
  } catch (error: any) {
    throw new Error(error)
  }
}

/**
 * Find one sprint by its id
 * @param id id of the sprint
 * @returns The sprint document or null if not found
 */
const findOneById = async (id: string): Promise<ISprint | null> => {
  try {
    const result = await GET_DB()
      .collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id) })
    return result as ISprint | null
  } catch (error: any) {
    throw new Error(error)
  }
}

/**
 * Find all sprints by project id
 * @param projectId id of the project
 * @returns Array of sprints
 */
const findByProjectId = async (projectId: string): Promise<ISprint[]> => {
  try {
    const results = await GET_DB()
      .collection(COLLECTION_NAME)
      .find({
        projectId: new ObjectId(projectId)
      })
      .sort({ createdAt: -1 })
      .toArray()

    return results as ISprint[]
  } catch (error) {
    throw new Error(error as string)
  }
}

/**
 * Update a sprint by its id
 * @param id id of the sprint
 * @param updateData Partial sprint data to update
 * @returns The updated sprint document or null if not found
 */
const update = async (id: string, updateData: Partial<ISprint>) => {
  try {
    // Remove invalid fields
    Object.keys(updateData).forEach((fieldName) => {
      if (INVALID_UPDATE_FIELDS.includes(fieldName)) {
        delete updateData[fieldName as keyof ISprint]
      }
    })

    const result = await GET_DB()
      .collection(COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateData },
        { returnDocument: 'after' }
      )

    return result as ISprint | null
  } catch (error) {
    throw new Error(error as string)
  }
}

/**
 * Delete a sprint by its id (soft delete)
 * @param id id of the sprint
 * @returns The deleted sprint document or null if not found
 */
const deleteById = async (id: string) => {
  try {
    const result = await GET_DB()
      .collection(COLLECTION_NAME)
      .deleteOne({ _id: new ObjectId(id) })

    return result
  } catch (error) {
    throw new Error(error as string)
  }
}

const deleteSprintsByProjectId = async (projectId: string) => {
  try {
    const result = await GET_DB()
      .collection(COLLECTION_NAME)
      .deleteMany({ projectId: new ObjectId(projectId) })
    return result
  } catch (error) {
    throw new Error(error as string)
  }
}

export const sprintModel = {
  createNew,
  findOneById,
  findByProjectId,
  update,
  deleteById,
  deleteSprintsByProjectId
}
