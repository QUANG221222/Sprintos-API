import { Request } from 'express'
import { sprintModel } from '~/models/sprint.model'
import { boardColumnModel } from '~/models/boardColumn.model'
import { taskModel } from '~/models/task.model'
import { projectModel } from '~/models/project.model'
import { userModel } from '~/models/user.model'
import ApiError from '~/utils/ApiError'
import { StatusCodes } from 'http-status-codes'

/**
 * Get sprint progress report with task distribution across board columns
 * @param req Request object containing sprint id
 * @returns Progress data with task counts per column
 */
const getSprintProgressReport = async (req: Request): Promise<any> => {
  try {
    const { sprintId } = req.params
    const userId = req.jwtDecoded.id

    // Check if sprint exists
    const sprint = await sprintModel.findOneById(sprintId)
    if (!sprint) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Sprint not found')
    }

    // Check if user has access to the project
    const project = await projectModel.findOneById(sprint.projectId.toString())
    if (!project) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Project not found')
    }

    const isMember = project.members.some(
      (m) => m.memberId.toString() === userId && m.status === 'active'
    )
    if (!isMember && project.ownerId.toString() !== userId) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'You do not have access to this sprint'
      )
    }

    // Get all board columns for the sprint
    const boardColumns = await boardColumnModel.findBySprintId(sprintId)

    // Define color mapping for each column type
    const colorMap: Record<string, string> = {
      backlog: '#94a3b8',
      todo: '#3b82f6',
      in_process: '#f59e0b',
      review: '#8b5cf6',
      done: '#10b981'
    }

    // Get task counts for each board column
    const progressData = await Promise.all(
      boardColumns.map(async (column) => {
        const tasks = await taskModel.findByBoardColumnId(
          column._id!.toString()
        )
        return {
          name: column.title,
          value: tasks.length,
          color: colorMap[column.title] || '#6b7280'
        }
      })
    )

    // // Calculate total tasks and completion percentage
    // const totalTasks = progressData.reduce((sum, col) => sum + col.value, 0)
    // const completedTasks =
    //   progressData.find((col) => col.name === 'done')?.value || 0
    // const progress =
    //   totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

    return {
      sprintId,
      sprintName: sprint.name,
      progressData
    }
  } catch (error) {
    throw error
  }
}

/**
 * Get project velocity report
 * @param req Request object containing project id
 * @returns Velocity data comparing planned vs completed story points across sprints
 */
const getProjectVelocityReport = async (req: Request): Promise<any> => {
  try {
    const { projectId } = req.params
    const userId = req.jwtDecoded.id

    // Check if project exists
    const project = await projectModel.findOneById(projectId)
    if (!project) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Project not found')
    }

    // Check if user has access to the project
    const isMember = project.members.some(
      (m) => m.memberId.toString() === userId && m.status === 'active'
    )
    if (!isMember && project.ownerId.toString() !== userId) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'You do not have access to this project'
      )
    }

    // Get all sprints for the project, sorted by creation date
    const sprints = await sprintModel.findByProjectId(projectId)

    // Calculate velocity data for each sprint
    const velocityData = await Promise.all(
      sprints.map(async (sprint) => {
        const planned = sprint.maxStoryPoint || 0

        // Get all board columns for the sprint
        const boardColumns = await boardColumnModel.findBySprintId(
          sprint._id!.toString()
        )

        // Find the "done" column
        const doneColumn = boardColumns.find((col) => col.title === 'done')

        let completed = 0

        if (doneColumn) {
          // Get all tasks in the done column
          const doneTasks = await taskModel.findByBoardColumnId(
            doneColumn._id!.toString()
          )

          // Sum up story points of completed tasks
          completed = doneTasks.reduce(
            (sum, task) => sum + (task.storyPoint || 0),
            0
          )
        }

        return {
          sprint: sprint.name,
          planned,
          completed
        }
      })
    )

    return {
      projectId,
      projectName: project.name,
      velocityData
    }
  } catch (error) {
    throw error
  }
}

/**
 * Get sprint member distribution report
 * @param req Request object containing sprint id
 * @returns Member distribution data showing tasks by status for each member
 */
const getSprintMemberDistribution = async (req: Request): Promise<any> => {
  try {
    const { sprintId } = req.params
    const userId = req.jwtDecoded.id

    // Check if sprint exists
    const sprint = await sprintModel.findOneById(sprintId)
    if (!sprint) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Sprint not found')
    }

    // Check if user has access to the project
    const project = await projectModel.findOneById(sprint.projectId.toString())
    if (!project) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Project not found')
    }

    const isMember = project.members.some(
      (m) => m.memberId.toString() === userId && m.status === 'active'
    )
    if (!isMember && project.ownerId.toString() !== userId) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'You do not have access to this sprint'
      )
    }

    // Get all board columns for the sprint
    const boardColumns = await boardColumnModel.findBySprintId(sprintId)

    // Find specific columns
    const doneColumn = boardColumns.find((col) => col.title === 'done')
    const inProgressColumn = boardColumns.find(
      (col) => col.title === 'in_process'
    )
    const todoColumn = boardColumns.find((col) => col.title === 'todo')
    const backlogColumn = boardColumns.find((col) => col.title === 'backlog')

    // Get all tasks for the sprint
    const allTasks = await taskModel.findBySprintId(sprintId)

    // Get all unique assignee IDs
    const assigneeIds = new Set<string>()
    allTasks.forEach((task) => {
      task.assigneeIds.forEach((id) => assigneeIds.add(id.toString()))
    })

    // Build member distribution
    const memberDistribution = await Promise.all(
      Array.from(assigneeIds).map(async (assigneeId) => {
        // Get user info
        const user = await userModel.findOneById(assigneeId)
        if (!user) return null

        // Count tasks by status for this member
        const memberTasks = allTasks.filter((task) =>
          task.assigneeIds.some((id) => id.toString() === assigneeId)
        )

        let done = 0
        let inProgress = 0
        let todo = 0

        memberTasks.forEach((task) => {
          const columnId = task.boardColumnId.toString()

          if (doneColumn && columnId === doneColumn._id?.toString()) {
            done++
          } else if (
            inProgressColumn &&
            columnId === inProgressColumn._id?.toString()
          ) {
            inProgress++
          } else if (todoColumn && columnId === todoColumn._id?.toString()) {
            todo++
          } else if (
            backlogColumn &&
            columnId === backlogColumn._id?.toString()
          ) {
            todo++ // Count backlog as todo
          }
        })

        return {
          name: user.displayName,
          done,
          inProgress,
          todo
        }
      })
    )

    // Filter out null values and sort by total tasks (descending)
    const filteredDistribution = memberDistribution
      .filter((member) => member !== null)
      .sort((a, b) => {
        const totalA = a!.done + a!.inProgress + a!.todo
        const totalB = b!.done + b!.inProgress + b!.todo
        return totalB - totalA
      })

    return {
      sprintId,
      sprintName: sprint.name,
      totalMembers: filteredDistribution.length,
      memberDistribution: filteredDistribution
    }
  } catch (error) {
    throw error
  }
}

export const reportService = {
  getSprintProgressReport,
  getProjectVelocityReport,
  getSprintMemberDistribution
}