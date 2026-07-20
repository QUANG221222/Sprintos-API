import { z } from 'zod'
import { SprintSchema } from '~/routes/sprint/sprint.model'
import { BoardColumnSchema } from '~/routes/board-column/board-column.model'
import { TaskSchema, TaskAssigneeSchema } from '~/routes/task/task.model'

export const SprintBoardColumnTaskSchema = TaskSchema.extend({
  assignees: z.array(TaskAssigneeSchema).optional()
}).strict()

export const SprintBoardColumnSchema = BoardColumnSchema.extend({
  tasks: z.array(SprintBoardColumnTaskSchema)
}).strict()

export const SprintBoardDetailSchema = SprintSchema.omit({ boardColumnIds: true }).extend({
  boardColumns: z.array(SprintBoardColumnSchema)
}).strip()

export type SprintBoardColumnTaskType = z.infer<typeof SprintBoardColumnTaskSchema>
export type SprintBoardColumnType = z.infer<typeof SprintBoardColumnSchema>
export type SprintBoardDetailType = z.infer<typeof SprintBoardDetailSchema>
