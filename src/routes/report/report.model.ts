import z from 'zod'

export const ProgressItemSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  value: z.number(),
  color: z.string(),
  isDone: z.boolean().optional()
})

export const BurndownItemSchema = z.object({
  day: z.string(),
  ideal: z.number(),
  actual: z.number()
})

export const SprintProgressResSchema = z.object({
  progressData: z.array(ProgressItemSchema),
  burndown: z.array(BurndownItemSchema)
})

export const VelocityItemSchema = z.object({
  sprint: z.string(),
  planned: z.number(),
  completed: z.number()
})

export const ProjectVelocityResSchema = z.object({
  velocityData: z.array(VelocityItemSchema)
})

export const MemberWorkloadSchema = z.object({
  name: z.string(),
  done: z.number(),
  inProgress: z.number(),
  todo: z.number(),
  totalPoints: z.number()
})

export const MemberDistributionResSchema = z.object({
  memberDistribution: z.array(MemberWorkloadSchema)
})

export const GetSprintReportParamSchema = z.object({
  sprintId: z.string()
})

export const GetProjectReportParamSchema = z.object({
  projectId: z.string()
})

// Network Diagram Schemas
export const TaskNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  duration: z.number(),
  storyPoint: z.number(),
  earlyStart: z.number(),
  earlyFinish: z.number(),
  lateStart: z.number(),
  lateFinish: z.number(),
  float: z.number(),
  isCritical: z.boolean(),
  status: z.string().optional(),
  assignees: z.array(z.any()).optional()
})

export const TaskDependencyItemSchema = z.object({
  id: z.string(),
  predecessorId: z.string(),
  successorId: z.string(),
  type: z.string(),
  lag: z.number()
})

export const SprintNetworkDiagramResSchema = z.object({
  tasks: z.array(TaskNodeSchema),
  dependencies: z.array(TaskDependencyItemSchema),
  criticalPathLength: z.number(),
  criticalTaskIds: z.array(z.string())
})

// Gantt Chart Schemas
export const GanttTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  startDate: z.string(),
  dueDate: z.string(),
  duration: z.number(),
  storyPoint: z.number(),
  progress: z.number(),
  status: z.string(),
  boardColumnTitle: z.string().optional(),
  priority: z.string().nullable().optional(),
  assignees: z.array(z.any()).optional(),
  predecessorIds: z.array(z.string()).optional()
})

export const SprintGanttChartResSchema = z.object({
  sprint: z.object({
    id: z.string(),
    name: z.string(),
    startDate: z.string(),
    endDate: z.string()
  }),
  tasks: z.array(GanttTaskSchema)
})

export type SprintProgressResType = z.infer<typeof SprintProgressResSchema>
export type ProjectVelocityResType = z.infer<typeof ProjectVelocityResSchema>
export type MemberDistributionResType = z.infer<typeof MemberDistributionResSchema>
export type GetSprintReportParamType = z.infer<typeof GetSprintReportParamSchema>
export type GetProjectReportParamType = z.infer<typeof GetProjectReportParamSchema>
export type SprintNetworkDiagramResType = z.infer<typeof SprintNetworkDiagramResSchema>
export type SprintGanttChartResType = z.infer<typeof SprintGanttChartResSchema>
