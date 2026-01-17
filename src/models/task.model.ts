import Joi from 'joi'
import { ITask, IComment, IAttachment } from '~/types/task.type'
import { GET_DB } from '~/configs/mongodb'
import { ObjectId } from 'mongodb'
import { OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validator'

const COLLECTION_NAME = 'tasks'

const COMMENT_SCHEMA = Joi.object({
  memberId: Joi.string()
    .pattern(OBJECT_ID_RULE)
    .message(OBJECT_ID_RULE_MESSAGE)
    .required(),
  memberDisplayName: Joi.string().required(),
  memberAvatar: Joi.string().optional().allow(''),
  content: Joi.string().required(),
  createdAt: Joi.date().timestamp('javascript').default(Date.now)
})

const ATTACHMENT_SCHEMA = Joi.object({
  fileName: Joi.string().required(),
  fileType: Joi.string().required(),
  fileUrl: Joi.string().required(),
  createdAt: Joi.date().timestamp('javascript').default(Date.now)
})

const COLLECTION_SCHEMA: Joi.ObjectSchema<ITask> = Joi.object({
  sprintId: Joi.string()
    .pattern(OBJECT_ID_RULE)
    .message(OBJECT_ID_RULE_MESSAGE)
    .required(),
  boardColumnId: Joi.string()
    .pattern(OBJECT_ID_RULE)
    .message(OBJECT_ID_RULE_MESSAGE)
    .required(),
  title: Joi.string().min(1).max(200).required(),
  description: Joi.string().max(2000).optional().allow(''),
  labels: Joi.array().items(Joi.string().min(1).max(50).optional()).default([]),
  priority: Joi.string()
    .valid('low', 'medium', 'high', 'critical')
    .optional()
    .allow(''),
  storyPoint: Joi.number().min(0).default(0),
  dueDate: Joi.date().timestamp('javascript').optional().allow(null),
  assigneeIds: Joi.array()
    .items(Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE))
    .default([]),
  comments: Joi.array().items(COMMENT_SCHEMA).default([]),
  attachments: Joi.array().items(ATTACHMENT_SCHEMA).default([]),
  createdAt: Joi.date().timestamp('javascript').default(Date.now),
  updatedAt: Joi.date().timestamp('javascript').default(null)
})

const INVALID_UPDATE_FIELDS = ['_id', 'sprintId', 'createdAt']

/**
 * Create a new task in the database
 * @param taskData Partial task data to create a new task
 * @returns The created task document
 */
const createNew = async (taskData: Partial<ITask>): Promise<any> => {
  try {
    const validatedTaskData = await COLLECTION_SCHEMA.validateAsync(taskData, {
      abortEarly: false
    })
    const newTask = {
      ...validatedTaskData,
      sprintId: new ObjectId(validatedTaskData.sprintId),
      boardColumnId: new ObjectId(validatedTaskData.boardColumnId),
      assigneeIds: validatedTaskData.assigneeIds.map((id) => new ObjectId(id)),
      dueDate: validatedTaskData.dueDate
        ? new Date(validatedTaskData.dueDate).getTime()
        : null
    }
    const createdTask = await GET_DB()
      .collection(COLLECTION_NAME)
      .insertOne(newTask)

    return await findOneById(createdTask.insertedId.toString())
  } catch (error: any) {
    throw new Error(error)
  }
}

/**
 * Find one task by its id
 * @param id id of the task
 * @returns The task document or null if not found
 */
const findOneById = async (id: string): Promise<ITask | null> => {
  try {
    const result = await GET_DB()
      .collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id) })
    return result as ITask | null
  } catch (error: any) {
    throw new Error(error)
  }
}

/**
 * Find all tasks by sprint id
 * @param sprintId id of the sprint
 * @returns Array of tasks
 */
const findBySprintId = async (sprintId: string): Promise<ITask[]> => {
  try {
    const results = await GET_DB()
      .collection(COLLECTION_NAME)
      .find({
        sprintId: new ObjectId(sprintId)
      })
      .sort({ createdAt: -1 })
      .toArray()

    return results as ITask[]
  } catch (error) {
    throw new Error(error as string)
  }
}

/**
 * Find all tasks by board column id
 * @param boardColumnId id of the board column
 * @returns Array of tasks
 */
const findByBoardColumnId = async (boardColumnId: string): Promise<ITask[]> => {
  try {
    const results = await GET_DB()
      .collection(COLLECTION_NAME)
      .find({
        boardColumnId: new ObjectId(boardColumnId)
      })
      .sort({ createdAt: -1 })
      .toArray()

    return results as ITask[]
  } catch (error) {
    throw new Error(error as string)
  }
}

/**
 * Update a task by its id
 * @param id id of the task
 * @param updateData Partial task data to update
 * @returns The updated task document or null if not found
 */
const update = async (id: string, updateData: Partial<ITask>) => {
  try {
    // Remove invalid fields
    Object.keys(updateData).forEach((fieldName) => {
      if (INVALID_UPDATE_FIELDS.includes(fieldName)) {
        delete updateData[fieldName as keyof ITask]
      }
    })

    // Convert assigneeIds to ObjectId array if present
    if (updateData.assigneeIds) {
      updateData.assigneeIds = updateData.assigneeIds.map(
        (id) => new ObjectId(id as any)
      )
    }

    // Convert boardColumnId to ObjectId if present
    if (updateData.boardColumnId) {
      updateData.boardColumnId = new ObjectId(
        updateData.boardColumnId as any
      ) as any
    }

    // Convert dueDate to timestamp if present
    if (updateData.dueDate) {
      updateData.dueDate = new Date(updateData.dueDate).getTime()
    }

    const result = await GET_DB()
      .collection(COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateData },
        { returnDocument: 'after' }
      )

    return result as ITask | null
  } catch (error) {
    throw new Error(error as string)
  }
}

/**
 * Delete a task by its id
 * @param id id of the task
 * @returns The deletion result
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

/**
 * Delete all tasks by sprint id
 * @param sprintId id of the sprint
 * @returns The deletion result
 */
const deleteBySprintId = async (sprintId: string) => {
  try {
    const result = await GET_DB()
      .collection(COLLECTION_NAME)
      .deleteMany({ sprintId: new ObjectId(sprintId) })
    return result
  } catch (error) {
    throw new Error(error as string)
  }
}

/**
 * Delete all tasks by board column id
 * @param boardColumnId id of the board column
 * @returns The deletion result
 */
const deleteByBoardColumnId = async (boardColumnId: string) => {
  try {
    const result = await GET_DB()
      .collection(COLLECTION_NAME)
      .deleteMany({ boardColumnId: new ObjectId(boardColumnId) })
    return result
  } catch (error) {
    throw new Error(error as string)
  }
}

/**
 * Add a comment to a task
 * @param taskId id of the task
 * @param comment comment data
 * @returns The updated task document or null if not found
 */
const addComment = async (taskId: string, comment: IComment) => {
  try {
    const validatedComment = await COMMENT_SCHEMA.validateAsync(comment)
    const commentWithObjectId = {
      ...validatedComment,
      memberId: new ObjectId(validatedComment.memberId)
    }

    const result = await GET_DB()
      .collection(COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(taskId) },
        {
          $push: { comments: commentWithObjectId },
          $set: { updatedAt: Date.now() }
        },
        { returnDocument: 'after' }
      )

    return result as ITask | null
  } catch (error) {
    throw new Error(error as string)
  }
}

/**
 * Add an attachment to a task
 * @param taskId id of the task
 * @param attachment attachment data
 * @returns The updated task document or null if not found
 */
const addAttachment = async (taskId: string, attachment: IAttachment) => {
  try {
    const validatedAttachment = await ATTACHMENT_SCHEMA.validateAsync(
      attachment
    )

    const result = await GET_DB()
      .collection(COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(taskId) },
        {
          $push: { attachments: validatedAttachment },
          $set: { updatedAt: Date.now() }
        },
        { returnDocument: 'after' }
      )

    return result as ITask | null
  } catch (error) {
    throw new Error(error as string)
  }
}

export const taskModel = {
  createNew,
  findOneById,
  findBySprintId,
  findByBoardColumnId,
  update,
  deleteById,
  deleteBySprintId,
  deleteByBoardColumnId,
  addComment,
  addAttachment
}
