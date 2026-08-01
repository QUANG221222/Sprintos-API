import { Injectable, NotFoundException } from '@nestjs/common'
import { ReportRepo } from './report.repo'
import {
  MemberDistributionResType,
  ProjectVelocityResType,
  SprintGanttChartResType,
  SprintNetworkDiagramResType,
  SprintProgressResType
} from './report.model'

@Injectable()
export class ReportService {
  constructor(private readonly reportRepo: ReportRepo) {}

  private getDoneColumnId(sprint: { boardColumnIds?: string[]; boardColumns?: any[] }): string | null {
    if (!sprint || !sprint.boardColumns || sprint.boardColumns.length === 0) return null

    const orderIds = sprint.boardColumnIds || []
    const sortedCols = [...sprint.boardColumns].sort((a, b) => {
      const idxA = orderIds.indexOf(a.id)
      const idxB = orderIds.indexOf(b.id)
      if (idxA !== -1 && idxB !== -1) return idxA - idxB
      return 0
    })

    // 1. Mandatory exact "Done" column match
    const doneCol = sortedCols.find((col) => col.title && col.title.trim().toLowerCase() === 'done')
    if (doneCol) return doneCol.id

    // 2. Fallback for legacy board data: rightmost column
    return sortedCols[sortedCols.length - 1].id
  }

  async getSprintProgress(sprintId: string): Promise<SprintProgressResType> {
    const sprint = await this.reportRepo.findSprintWithTasks(sprintId)
    if (!sprint) {
      throw new NotFoundException('Sprint not found')
    }

    const orderIds = sprint.boardColumnIds || []
    const sortedCols = [...(sprint.boardColumns || [])].sort((a, b) => {
      const idxA = orderIds.indexOf(a.id)
      const idxB = orderIds.indexOf(b.id)
      if (idxA !== -1 && idxB !== -1) return idxA - idxB
      return 0
    })

    const doneColumnId = this.getDoneColumnId(sprint)
    const colors = ['#3b82f6', '#f59e0b', '#8b5cf6', '#10b981', '#06b6d4', '#ec4899', '#64748b']

    const columnCountMap = new Map<string, number>()
    for (const col of sortedCols) {
      columnCountMap.set(col.id, 0)
    }

    let totalStoryPoints = 0
    let completedStoryPoints = 0
    const tasks = sprint.tasks || []

    for (const task of tasks) {
      const sp = task.storyPoint > 0 ? task.storyPoint : 1
      totalStoryPoints += sp

      const colId = task.boardColumnId || task.boardColumn?.id
      if (colId && columnCountMap.has(colId)) {
        columnCountMap.set(colId, columnCountMap.get(colId)! + 1)
      }

      if (colId && colId === doneColumnId) {
        completedStoryPoints += sp
      }
    }

    const progressData = sortedCols.map((col, index) => {
      const isDone = col.id === doneColumnId
      return {
        id: col.id,
        name: col.title,
        value: columnCountMap.get(col.id) || 0,
        isDone,
        color: isDone ? '#10b981' : colors[index % colors.length]
      }
    })

    // Calculate Burndown
    const startDate = new Date(sprint.startDate)
    const endDate = new Date(sprint.endDate)
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime())
    const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)))
    const totalSteps = Math.min(Math.max(diffDays, 5), 14)

    const burndown: { day: string; ideal: number; actual: number }[] = []
    const pointsPerStep = totalStoryPoints / totalSteps

    for (let i = 0; i <= totalSteps; i++) {
      const ideal = Math.max(0, Math.round((totalStoryPoints - i * pointsPerStep) * 10) / 10)
      const progressFactor = i / totalSteps
      const remainingActual = Math.max(
        0,
        Math.round((totalStoryPoints - completedStoryPoints * Math.min(1, progressFactor * 1.1)) * 10) / 10
      )

      burndown.push({
        day: `Day ${i + 1}`,
        ideal,
        actual: remainingActual
      })
    }

    return {
      progressData,
      burndown
    }
  }

  async getProjectVelocity(projectId: string): Promise<ProjectVelocityResType> {
    const sprints = await this.reportRepo.findProjectSprintsWithTasks(projectId)

    const velocityData = sprints.map((sprint) => {
      let planned = sprint.maxStoryPoint || 0
      let completed = 0

      const doneColumnId = this.getDoneColumnId(sprint)

      const tasks = sprint.tasks || []
      let totalTaskPoints = 0

      for (const task of tasks) {
        const sp = task.storyPoint > 0 ? task.storyPoint : 1
        totalTaskPoints += sp

        const colId = task.boardColumnId || task.boardColumn?.id
        if (colId && colId === doneColumnId) {
          completed += sp
        }
      }

      if (planned === 0) {
        planned = totalTaskPoints
      }

      return {
        sprint: sprint.name,
        planned,
        completed
      }
    })

    return { velocityData }
  }

  async getMemberDistribution(sprintId: string): Promise<MemberDistributionResType> {
    const { members, tasks } = await this.reportRepo.findSprintProjectMembers(sprintId)
    const sprint = await this.reportRepo.findSprintWithTasks(sprintId)
    const doneColumnId = sprint ? this.getDoneColumnId(sprint) : null

    const memberStatsMap = new Map<
      string,
      { name: string; done: number; inProgress: number; todo: number; totalPoints: number }
    >()

    for (const pm of members) {
      const user = pm.member
      if (user) {
        memberStatsMap.set(user.id, {
          name: user.displayName || user.email,
          done: 0,
          inProgress: 0,
          todo: 0,
          totalPoints: 0
        })
      }
    }

    for (const task of tasks) {
      const colId = task.boardColumnId || task.boardColumn?.id
      const sp = task.storyPoint > 0 ? task.storyPoint : 1
      const assignees = task.assignees || []

      for (const assignee of assignees) {
        const user = assignee.user
        if (!user) continue

        if (!memberStatsMap.has(user.id)) {
          memberStatsMap.set(user.id, {
            name: user.displayName || user.email,
            done: 0,
            inProgress: 0,
            todo: 0,
            totalPoints: 0
          })
        }

        const stats = memberStatsMap.get(user.id)!
        stats.totalPoints += sp

        if (colId && colId === doneColumnId) {
          stats.done++
        } else {
          stats.inProgress++
        }
      }
    }

    const memberDistribution = Array.from(memberStatsMap.values())

    return { memberDistribution }
  }

  async getSprintNetworkDiagram(sprintId: string): Promise<SprintNetworkDiagramResType> {
    const [tasks, dependencies] = await Promise.all([
      this.reportRepo.getTasksWithFullDetailsBySprintId(sprintId),
      this.reportRepo.getDependenciesBySprintId(sprintId)
    ])

    const taskMap = new Map<string, any>()
    for (const task of tasks) {
      taskMap.set(task.id, task)
    }

    const formattedDeps = dependencies.map((dep) => ({
      id: dep.id,
      predecessorId: dep.predecessorId,
      successorId: dep.successorId,
      type: dep.type || 'FS',
      lag: dep.lag || 0
    }))

    // Maps for predecessor and successor dependency objects
    const incomingDepsMap = new Map<string, typeof formattedDeps>()
    const outgoingDepsMap = new Map<string, typeof formattedDeps>()

    for (const task of tasks) {
      incomingDepsMap.set(task.id, [])
      outgoingDepsMap.set(task.id, [])
    }

    for (const dep of formattedDeps) {
      if (incomingDepsMap.has(dep.successorId)) {
        incomingDepsMap.get(dep.successorId)!.push(dep)
      }
      if (outgoingDepsMap.has(dep.predecessorId)) {
        outgoingDepsMap.get(dep.predecessorId)!.push(dep)
      }
    }

    // CPM Calculation - Forward Pass (ES & EF)
    const earlyStartMap = new Map<string, number>()
    const earlyFinishMap = new Map<string, number>()

    let changed = true
    let iterations = 0
    const maxIterations = Math.max(tasks.length * 5, 50)

    while (changed && iterations < maxIterations) {
      changed = false
      iterations++

      for (const task of tasks) {
        const duration = task.duration && task.duration > 0 ? task.duration : (task.storyPoint > 0 ? task.storyPoint : 1)
        const incoming = incomingDepsMap.get(task.id) || []

        let calculatedES = 0

        for (const dep of incoming) {
          const predId = dep.predecessorId
          const predES = earlyStartMap.get(predId) || 0
          const predEF = earlyFinishMap.get(predId) || 0

          let reqES = 0
          switch (dep.type) {
            case 'SS':
              reqES = predES + dep.lag
              break
            case 'FF':
              reqES = predEF + dep.lag - duration
              break
            case 'SF':
              reqES = predES + dep.lag - duration
              break
            case 'FS':
            default:
              reqES = predEF + dep.lag
              break
          }
          if (reqES > calculatedES) {
            calculatedES = reqES
          }
        }

        calculatedES = Math.max(0, calculatedES)
        const calculatedEF = calculatedES + duration

        const currentES = earlyStartMap.get(task.id)
        const currentEF = earlyFinishMap.get(task.id)

        if (currentES !== calculatedES || currentEF !== calculatedEF) {
          earlyStartMap.set(task.id, calculatedES)
          earlyFinishMap.set(task.id, calculatedEF)
          changed = true
        }
      }
    }

    let criticalPathLength = 0
    for (const ef of earlyFinishMap.values()) {
      if (ef > criticalPathLength) {
        criticalPathLength = ef
      }
    }

    // CPM Calculation - Backward Pass (LS & LF)
    const lateStartMap = new Map<string, number>()
    const lateFinishMap = new Map<string, number>()

    for (const task of tasks) {
      const outgoing = outgoingDepsMap.get(task.id) || []
      if (outgoing.length === 0) {
        lateFinishMap.set(task.id, criticalPathLength)
        const duration = task.duration && task.duration > 0 ? task.duration : (task.storyPoint > 0 ? task.storyPoint : 1)
        lateStartMap.set(task.id, criticalPathLength - duration)
      }
    }

    changed = true
    iterations = 0

    while (changed && iterations < maxIterations) {
      changed = false
      iterations++

      for (const task of tasks) {
        const duration = task.duration && task.duration > 0 ? task.duration : (task.storyPoint > 0 ? task.storyPoint : 1)
        const outgoing = outgoingDepsMap.get(task.id) || []

        if (outgoing.length > 0) {
          let minAllowedLF = Infinity

          for (const dep of outgoing) {
            const succId = dep.successorId
            const succLS = lateStartMap.get(succId)
            const succLF = lateFinishMap.get(succId)

            if (succLS !== undefined && succLF !== undefined) {
              let allowedLF = Infinity
              switch (dep.type) {
                case 'SS':
                  allowedLF = succLS - dep.lag + duration
                  break
                case 'FF':
                  allowedLF = succLF - dep.lag
                  break
                case 'SF':
                  allowedLF = succLF - dep.lag + duration
                  break
                case 'FS':
                default:
                  allowedLF = succLS - dep.lag
                  break
              }
              if (allowedLF < minAllowedLF) {
                minAllowedLF = allowedLF
              }
            }
          }

          if (minAllowedLF !== Infinity) {
            const currentLF = lateFinishMap.get(task.id)
            const currentLS = lateStartMap.get(task.id)

            const newLF = minAllowedLF
            const newLS = newLF - duration

            if (currentLF !== newLF || currentLS !== newLS) {
              lateFinishMap.set(task.id, newLF)
              lateStartMap.set(task.id, newLS)
              changed = true
            }
          }
        }
      }
    }

    // Build Task Node objects
    const criticalTaskIds: string[] = []

    const taskNodes = tasks.map((task) => {
      const duration = task.duration && task.duration > 0 ? task.duration : (task.storyPoint > 0 ? task.storyPoint : 1)
      const es = earlyStartMap.get(task.id) || 0
      const ef = earlyFinishMap.get(task.id) || duration
      const lf = lateFinishMap.get(task.id) ?? ef
      const ls = lateStartMap.get(task.id) ?? es

      const floatVal = Math.max(0, ls - es)
      const isCritical = floatVal === 0

      if (isCritical) {
        criticalTaskIds.push(task.id)
      }

      const assignees = (task.assignees || []).map((a) => ({
        id: a.user?.id || a.userId,
        name: a.user?.displayName || a.user?.email || 'Unassigned',
        avatar: a.user?.avatar
      }))

      return {
        id: task.id,
        title: task.title,
        duration,
        storyPoint: task.storyPoint || 0,
        earlyStart: es,
        earlyFinish: ef,
        lateStart: ls,
        lateFinish: lf,
        float: floatVal,
        isCritical,
        status: task.boardColumn?.title || 'To Do',
        parentId: task.parentId || null,
        assignees
      }
    })

    return {
      tasks: taskNodes,
      dependencies: formattedDeps,
      criticalPathLength,
      criticalTaskIds
    }
  }

  async getSprintGanttChart(sprintId: string): Promise<SprintGanttChartResType> {
    const sprint = await this.reportRepo.findSprintWithTasks(sprintId)
    if (!sprint) {
      throw new NotFoundException('Sprint not found')
    }

    const tasks = await this.reportRepo.getTasksWithFullDetailsBySprintId(sprintId)

    const sprintStartDateStr = new Date(sprint.startDate).toISOString()
    const sprintEndDateStr = new Date(sprint.endDate).toISOString()

    const doneColumnId = this.getDoneColumnId(sprint)

    const ganttTasks = tasks.map((task) => {
      const colId = task.boardColumnId || task.boardColumn?.id
      const colTitle = task.boardColumn?.title || ''
      let progress = 0
      if (colId && colId === doneColumnId) {
        progress = 100
      } else if (colTitle.toLowerCase().includes('review') || colTitle.toLowerCase().includes('test')) {
        progress = 75
      } else if (colTitle.toLowerCase().includes('progress') || colTitle.toLowerCase().includes('doing')) {
        progress = 50
      }

      const duration = task.duration && task.duration > 0 ? task.duration : (task.storyPoint > 0 ? task.storyPoint : 1)
      const startDateStr = task.startDate ? new Date(task.startDate).toISOString() : sprintStartDateStr

      let dueDateStr = task.dueDate ? new Date(task.dueDate).toISOString() : ''
      if (!dueDateStr) {
        const start = new Date(startDateStr)
        start.setDate(start.getDate() + duration)
        dueDateStr = start.toISOString()
      }

      const assignees = (task.assignees || []).map((a) => ({
        id: a.user?.id || a.userId,
        name: a.user?.displayName || a.user?.email || 'Unassigned',
        avatar: a.user?.avatar
      }))

      const predecessorIds = (task.predecessors || []).map((p) => p.predecessorId)

      return {
        id: task.id,
        title: task.title,
        startDate: startDateStr,
        dueDate: dueDateStr,
        duration,
        storyPoint: task.storyPoint || 0,
        progress,
        status: colTitle || 'To Do',
        boardColumnTitle: colTitle,
        priority: task.priority || null,
        assignees,
        predecessorIds
      }
    })

    return {
      sprint: {
        id: sprint.id,
        name: sprint.name,
        startDate: sprintStartDateStr,
        endDate: sprintEndDateStr
      },
      tasks: ganttTasks
    }
  }
}
