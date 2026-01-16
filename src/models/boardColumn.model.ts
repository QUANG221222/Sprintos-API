import Joi from 'joi'
import { IBoardColumn } from '~/types/boardColumn.type'
import { GET_DB } from '~/configs/mongodb'
import { ObjectId } from 'mongodb'
import { OBJECT_ID_RULE, OBJECT_ID_RULE_MESSAGE } from '~/utils/validator'

const COLLECTION_NAME = 'boardColumns'
const COLLECTION_SCHEMA: Joi.ObjectSchema<IBoardColumn> = Joi.object({
  sprintId: Joi.string()
    .pattern(OBJECT_ID_RULE)
    .message(OBJECT_ID_RULE_MESSAGE)
    .required(),
  title: Joi.string().min(1).max(50).required(),
  taskOrderIds: Joi.array()
    .items(Joi.string().pattern(OBJECT_ID_RULE).message(OBJECT_ID_RULE_MESSAGE))
    .default([]),
  createdAt: Joi.date().timestamp('javascript').default(Date.now),
  updatedAt: Joi.date().timestamp('javascript').default(null)
})

const INVALID_UPDATE_FIELDS = ['_id', 'sprintId', 'createdAt']

/**
 * Create a new board column in the database
 * @param columnData Partial board column data to create a new column
 * @returns The created board column document
 */
const createNew = async (columnData: Partial<IBoardColumn>): Promise<any> => {
  try {
    const validatedColumnData = await COLLECTION_SCHEMA.validateAsync(
      columnData,
      {
        abortEarly: false
      }
    )
    const newColumn = {
      ...validatedColumnData,
      sprintId: new ObjectId(validatedColumnData.sprintId)
    }
    const createdColumn = await GET_DB()
      .collection(COLLECTION_NAME)
      .insertOne(newColumn)

    return await findOneById(createdColumn.insertedId.toString())
  } catch (error: any) {
    throw new Error(error)
  }
}

/**
 * Find one board column by its id
 * @param id id of the board column
 * @returns The board column document or null if not found
 */
const findOneById = async (id: string): Promise<IBoardColumn | null> => {
  try {
    const result = await GET_DB()
      .collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id) })
    return result as IBoardColumn | null
  } catch (error: any) {
    throw new Error(error)
  }
}

/**
 * Find all board columns by sprint id
 * @param sprintId id of the sprint
 * @returns Array of board columns
 */
const findBySprintId = async (sprintId: string): Promise<IBoardColumn[]> => {
  try {
    const results = await GET_DB()
      .collection(COLLECTION_NAME)
      .find({
        sprintId: new ObjectId(sprintId)
      })
      .sort({ createdAt: 1 })
      .toArray()

    return results as IBoardColumn[]
  } catch (error) {
    throw new Error(error as string)
  }
}

/**
 * Update a board column by its id
 * @param id id of the board column
 * @param updateData Partial board column data to update
 * @returns The updated board column document or null if not found
 */
const update = async (id: string, updateData: Partial<IBoardColumn>) => {
  try {
    // Remove invalid fields
    Object.keys(updateData).forEach((fieldName) => {
      if (INVALID_UPDATE_FIELDS.includes(fieldName)) {
        delete updateData[fieldName as keyof IBoardColumn]
      }
    })

    const result = await GET_DB()
      .collection(COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateData },
        { returnDocument: 'after' }
      )

    return result as IBoardColumn | null
  } catch (error) {
    throw new Error(error as string)
  }
}

/**
 * Delete a board column by its id
 * @param id id of the board column
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
 * Delete all board columns by sprint id
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

export const boardColumnModel = {
  createNew,
  findOneById,
  findBySprintId,
  update,
  deleteById,
  deleteBySprintId
}
