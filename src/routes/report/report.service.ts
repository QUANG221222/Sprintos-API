import { Injectable, NotFoundException } from '@nestjs/common'
import { ReportRepo } from './report.repo'
import {
  MemberDistributionResType,
  ProjectVelocityResType,
  SprintGanttChartResType,
  SprintNetworkDiagramResType,
  SprintProgressResType,
  SprintWorkTypeDistributionResType,
  SprintCfdResType
} from './report.model'

@Injectable()
export class ReportService {
  constructor(private readonly reportRepo: ReportRepo) {}

  private getSortedColumns(sprint: { boardColumnIds?: string[]; boardColumns?: any[] }) {
    if (!sprint || !sprint.boardColumns || sprint.boardColumns.length === 0) return []
    const orderIds = sprint.boardColumnIds || []
    return [...sprint.boardColumns].sort((a, b) => {
      const idxA = orderIds.indexOf(a.id)
      const idxB = orderIds.indexOf(b.id)
      if (idxA !== -1 && idxB !== -1) return idxA - idxB
      return 0
    })
  }

  private getDoneColumnIds(sprint: { boardColumnIds?: string[]; boardColumns?: any[] }): Set<string> {
    const doneIds = new Set<string>()
    if (!sprint || !sprint.boardColumns || sprint.boardColumns.length === 0) return doneIds

    for (const col of sprint.boardColumns) {
      if (col.isDone === true) {
        doneIds.add(col.id)
      }
    }

    if (doneIds.size === 0) {
      const sortedCols = this.getSortedColumns(sprint)
      const doneCol = sortedCols.find((col) => col.title && col.title.trim().toLowerCase() === 'done')
      if (doneCol) {
        doneIds.add(doneCol.id)
      } else if (sortedCols.length > 0) {
        doneIds.add(sortedCols[sortedCols.length - 1].id)
      }
    }

    return doneIds
  }

  async getSprintProgress(sprintId: string): Promise<SprintProgressResType> {
    const sprint = await this.reportRepo.findSprintWithTasks(sprintId)
    if (!sprint) {
      throw new NotFoundException('Sprint not found')
    }

    const sortedCols = this.getSortedColumns(sprint)
    const doneColumnIds = this.getDoneColumnIds(sprint)
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

      if (colId && doneColumnIds.has(colId)) {
        completedStoryPoints += sp
      }
    }

    const progressData = sortedCols.map((col, index) => {
      const isDone = doneColumnIds.has(col.id)
      return {
        id: col.id,
        name: col.title,
        value: columnCountMap.get(col.id) || 0,
        isDone,
        isWip: col.isWip ?? !isDone,
        isBlocked: col.isBlocked ?? false,
        isCancelled: col.isCancelled ?? false,
        color: col.color || (isDone ? '#10b981' : colors[index % colors.length])
      }
    })

    // Calculate Real-time Burndown
    const startDate = new Date(sprint.startDate)
    const endDate = new Date(sprint.endDate)
    const now = new Date()
    const diffTime = Math.max(1, Math.abs(endDate.getTime() - startDate.getTime()))
    const totalDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)))
    const steps = Math.min(Math.max(totalDays, 5), 30)

    const pointsPerStep = totalStoryPoints / steps
    const burndown: { day: string; ideal: number; actual: number }[] = []

    // 1. Kiểm tra xem có Daily Snapshots trong database chưa
    const snapshots = await this.reportRepo.findSprintSnapshots(sprintId)

    if (snapshots.length > 0) {
      // Dùng dữ liệu snapshot thực tế
      snapshots.forEach((snap, idx) => {
        const ideal = Math.max(0, Math.round((totalStoryPoints - idx * pointsPerStep) * 10) / 10)
        burndown.push({
          day: `Day ${idx + 1}`,
          ideal,
          actual: snap.remainingStoryPoints
        })
      })
    } else {
      // 2. Tính toán lịch sử thực tế dựa trên ngày hoàn thành của các task
      const completedTasks = tasks.filter((t) => {
        const colId = t.boardColumnId || t.boardColumn?.id
        return colId && doneColumnIds.has(colId)
      })

      const elapsedMs = Math.max(0, now.getTime() - startDate.getTime())
      const currentDayIndex = Math.min(steps, Math.ceil(elapsedMs / (1000 * 60 * 60 * 24)))

      for (let i = 0; i <= steps; i++) {
        const ideal = Math.max(0, Math.round((totalStoryPoints - i * pointsPerStep) * 10) / 10)
        const stepDate = new Date(startDate.getTime() + i * (diffTime / steps))

        // Điểm thực tế hoàn thành tính đến thời điểm stepDate
        if (i <= currentDayIndex) {
          const pointsDoneToDate = completedTasks
            .filter((t) => new Date(t.updatedAt || t.createdAt).getTime() <= stepDate.getTime())
            .reduce((sum, t) => sum + (t.storyPoint > 0 ? t.storyPoint : 1), 0)

          const remainingActual = Math.max(0, totalStoryPoints - pointsDoneToDate)
          burndown.push({
            day: `Day ${i + 1}`,
            ideal,
            actual: remainingActual
          })
        } else {
          // Các ngày tương lai: Giữ nguyên mức remaining hiện tại (không vẽ giả lập giảm xuống)
          burndown.push({
            day: `Day ${i + 1}`,
            ideal,
            actual: Math.max(0, totalStoryPoints - completedStoryPoints)
          })
        }
      }
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

      const doneColumnIds = this.getDoneColumnIds(sprint)
      const tasks = sprint.tasks || []
      let totalTaskPoints = 0

      for (const task of tasks) {
        const sp = task.storyPoint > 0 ? task.storyPoint : 1
        totalTaskPoints += sp

        const colId = task.boardColumnId || task.boardColumn?.id
        if (colId && doneColumnIds.has(colId)) {
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
    const sortedCols = sprint ? this.getSortedColumns(sprint) : []
    const doneColumnIds = sprint ? this.getDoneColumnIds(sprint) : new Set<string>()

    const colMap = new Map<string, any>()
    sortedCols.forEach((c) => colMap.set(c.id, c))

    const memberStatsMap = new Map<
      string,
      { name: string; done: number; inProgress: number; todo: number; blocked: number; totalPoints: number }
    >()

    for (const pm of members) {
      const user = pm.member
      if (user) {
        memberStatsMap.set(user.id, {
          name: user.displayName || user.email,
          done: 0,
          inProgress: 0,
          todo: 0,
          blocked: 0,
          totalPoints: 0
        })
      }
    }

    for (const task of tasks) {
      const colId = task.boardColumnId || task.boardColumn?.id
      const sp = task.storyPoint > 0 ? task.storyPoint : 1
      const assignees = task.assignees || []
      const col = colId ? colMap.get(colId) : null

      for (const assignee of assignees) {
        const user = assignee.user
        if (!user) continue

        if (!memberStatsMap.has(user.id)) {
          memberStatsMap.set(user.id, {
            name: user.displayName || user.email,
            done: 0,
            inProgress: 0,
            todo: 0,
            blocked: 0,
            totalPoints: 0
          })
        }

        const stats = memberStatsMap.get(user.id)!
        stats.totalPoints += sp

        if (colId && doneColumnIds.has(colId)) {
          stats.done++
        } else if (col?.isBlocked === true) {
          stats.blocked++
        } else if (col?.isWip === true) {
          stats.inProgress++
        } else {
          // Các cột To Do / Chưa bắt đầu (isWip = false, isDone = false, isBlocked = false)
          stats.todo++
        }
      }
    }

    const memberDistribution = Array.from(memberStatsMap.values())

    return { memberDistribution }
  }

  /**
   * Helper to perform CPM (Critical Path Method) Forward and Backward passes
   */
  private computeCpmSchedule(tasks: any[], dependencies: any[]) {
    const formattedDeps = dependencies.map((dep) => ({
      id: dep.id,
      predecessorId: dep.predecessorId,
      successorId: dep.successorId,
      type: dep.type || 'FS',
      lag: dep.lag || 0
    }))

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

    // Cycle detection via DFS
    const visited = new Map<string, number>() // 0 = unvisited, 1 = visiting, 2 = visited
    let hasCycle = false

    const checkCycle = (taskId: string) => {
      visited.set(taskId, 1)
      const outgoing = outgoingDepsMap.get(taskId) || []
      for (const dep of outgoing) {
        const state = visited.get(dep.successorId) || 0
        if (state === 1) {
          hasCycle = true
          return
        }
        if (state === 0) {
          checkCycle(dep.successorId)
        }
      }
      visited.set(taskId, 2)
    }

    for (const task of tasks) {
      if (!visited.has(task.id)) {
        checkCycle(task.id)
      }
    }

    // Forward Pass (ES & EF)
    const earlyStartMap = new Map<string, number>()
    const earlyFinishMap = new Map<string, number>()

    for (const task of tasks) {
      const duration = task.duration && task.duration > 0 ? task.duration : (task.storyPoint > 0 ? task.storyPoint : 1)
      earlyStartMap.set(task.id, 0)
      earlyFinishMap.set(task.id, duration)
    }

    let changed = true
    let iterations = 0
    const maxIterations = hasCycle ? tasks.length : Math.max(tasks.length * 4, 30)

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

    // Backward Pass (LS & LF)
    const lateStartMap = new Map<string, number>()
    const lateFinishMap = new Map<string, number>()

    // Initialize terminal tasks (no outgoing dependencies) to project criticalPathLength
    for (const task of tasks) {
      const outgoing = outgoingDepsMap.get(task.id) || []
      const duration = task.duration && task.duration > 0 ? task.duration : (task.storyPoint > 0 ? task.storyPoint : 1)
      if (outgoing.length === 0) {
        lateFinishMap.set(task.id, criticalPathLength)
        lateStartMap.set(task.id, Math.max(0, criticalPathLength - duration))
      } else {
        lateFinishMap.set(task.id, Infinity)
        lateStartMap.set(task.id, Infinity)
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

            if (succLS !== undefined && succLS !== Infinity && succLF !== undefined && succLF !== Infinity) {
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

          // Fallback if none of successors have resolved yet: use criticalPathLength
          if (minAllowedLF === Infinity && lateFinishMap.get(task.id) === Infinity) {
            minAllowedLF = criticalPathLength
          }

          if (minAllowedLF !== Infinity) {
            const currentLF = lateFinishMap.get(task.id)
            const newLS = Math.max(0, minAllowedLF - duration)

            if (currentLF !== minAllowedLF) {
              lateFinishMap.set(task.id, minAllowedLF)
              lateStartMap.set(task.id, newLS)
              changed = true
            }
          }
        }
      }
    }

    // Final sweep: normalize any unresolved Infinity tasks
    for (const task of tasks) {
      const duration = task.duration && task.duration > 0 ? task.duration : (task.storyPoint > 0 ? task.storyPoint : 1)
      if (lateFinishMap.get(task.id) === Infinity) {
        lateFinishMap.set(task.id, criticalPathLength)
        lateStartMap.set(task.id, Math.max(0, criticalPathLength - duration))
      }
    }

    // Build Task Node objects
    const criticalTaskIds: string[] = []

    const taskNodes = tasks.map((task) => {
      const duration = task.duration && task.duration > 0 ? task.duration : (task.storyPoint > 0 ? task.storyPoint : 1)
      const es = earlyStartMap.get(task.id) || 0
      const ef = earlyFinishMap.get(task.id) || duration
      const lf = lateFinishMap.get(task.id) ?? criticalPathLength
      const ls = lateStartMap.get(task.id) ?? Math.max(0, lf - duration)

      const floatVal = Math.max(0, ls - es)
      // A task is critical if float === 0 and it contributes to the project duration
      const isCritical = floatVal === 0 && criticalPathLength > 0

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
      criticalTaskIds,
      earlyStartMap,
      earlyFinishMap,
      hasCycle
    }
  }

  async getSprintNetworkDiagram(sprintId: string): Promise<SprintNetworkDiagramResType> {
    const [tasks, dependencies] = await Promise.all([
      this.reportRepo.getTasksWithFullDetailsBySprintId(sprintId),
      this.reportRepo.getDependenciesBySprintId(sprintId)
    ])

    const cpm = this.computeCpmSchedule(tasks, dependencies)

    return {
      tasks: cpm.tasks,
      dependencies: cpm.dependencies,
      criticalPathLength: cpm.criticalPathLength,
      criticalTaskIds: cpm.criticalTaskIds
    }
  }

  async getSprintGanttChart(sprintId: string): Promise<SprintGanttChartResType> {
    const sprint = await this.reportRepo.findSprintWithTasks(sprintId)
    if (!sprint) {
      throw new NotFoundException('Sprint not found')
    }

    const [tasks, dependencies] = await Promise.all([
      this.reportRepo.getTasksWithFullDetailsBySprintId(sprintId),
      this.reportRepo.getDependenciesBySprintId(sprintId)
    ])

    // Use CPM earlyStart as schedule fallback when tasks lack explicit dates
    const cpm = this.computeCpmSchedule(tasks, dependencies)

    const sprintStartDateObj = new Date(sprint.startDate)
    const sprintStartDateStr = sprintStartDateObj.toISOString()
    const sprintEndDateStr = new Date(sprint.endDate).toISOString()

    const doneColumnIds = this.getDoneColumnIds(sprint)

    const ganttTasks = tasks.map((task) => {
      const colId = task.boardColumnId || task.boardColumn?.id
      const colTitle = task.boardColumn?.title || ''
      let progress = 0
      if (colId && doneColumnIds.has(colId)) {
        progress = 100
      } else if (colTitle.toLowerCase().includes('review') || colTitle.toLowerCase().includes('test')) {
        progress = 75
      } else if (colTitle.toLowerCase().includes('progress') || colTitle.toLowerCase().includes('doing')) {
        progress = 50
      }

      const duration = task.duration && task.duration > 0 ? task.duration : (task.storyPoint > 0 ? task.storyPoint : 1)

      // Use explicit startDate if provided; otherwise schedule from CPM Early Start
      let startDateStr = task.startDate ? new Date(task.startDate).toISOString() : ''
      if (!startDateStr) {
        const es = cpm.earlyStartMap.get(task.id) || 0
        const calculatedStart = new Date(sprintStartDateObj)
        calculatedStart.setDate(calculatedStart.getDate() + es)
        startDateStr = calculatedStart.toISOString()
      }

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

  async getSprintWorkTypeDistribution(sprintId: string): Promise<SprintWorkTypeDistributionResType> {
    const sprint = await this.reportRepo.findSprintWithTasks(sprintId)
    if (!sprint) {
      throw new NotFoundException('Sprint not found')
    }

    const tasks = sprint.tasks || []
    const typeCountMap: Record<string, { count: number; sp: number }> = {
      STORY: { count: 0, sp: 0 },
      TASK: { count: 0, sp: 0 },
      BUG: { count: 0, sp: 0 },
      TECH_DEBT: { count: 0, sp: 0 },
      EPIC: { count: 0, sp: 0 }
    }

    let totalTasks = 0
    let totalStoryPoints = 0
    let bugCount = 0

    for (const task of tasks) {
      totalTasks++
      const sp = task.storyPoint > 0 ? task.storyPoint : 1
      totalStoryPoints += sp

      const t = (task.type as string) || 'TASK'
      if (!typeCountMap[t]) {
        typeCountMap[t] = { count: 0, sp: 0 }
      }
      typeCountMap[t].count++
      typeCountMap[t].sp += sp

      if (t === 'BUG') {
        bugCount++
      }
    }

    const WORK_TYPE_META: Record<string, { name: string; color: string }> = {
      STORY: { name: 'Feature Stories', color: '#0d9488' },
      BUG: { name: 'Bug Fixes', color: '#f43f5e' },
      TECH_DEBT: { name: 'Tech Debt & Refactor', color: '#6366f1' },
      TASK: { name: 'Standard Tasks', color: '#3b82f6' },
      EPIC: { name: 'Epic Initiatives', color: '#8b5cf6' }
    }

    const workTypes = Object.entries(typeCountMap)
      .filter(([_, data]) => data.count > 0 || ['STORY', 'BUG', 'TASK', 'TECH_DEBT'].includes(_))
      .map(([type, data]) => ({
        type,
        name: WORK_TYPE_META[type]?.name || type,
        count: data.count,
        storyPoints: data.sp,
        color: WORK_TYPE_META[type]?.color || '#64748b'
      }))

    const defectDensity = totalTasks > 0 ? Number(((bugCount / totalTasks) * 100).toFixed(1)) : 0

    return {
      workTypes,
      totalTasks,
      totalStoryPoints,
      defectDensity
    }
  }

  async getSprintCfd(sprintId: string): Promise<SprintCfdResType> {
    const sprint = await this.reportRepo.findSprintWithTasks(sprintId)
    if (!sprint) {
      throw new NotFoundException('Sprint not found')
    }

    const sortedCols = this.getSortedColumns(sprint)
    const columns = sortedCols.map((c, idx) => ({
      id: c.id,
      title: c.title,
      name: c.title,
      color: c.color || (c.isDone ? '#10b981' : ['#94a3b8', '#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b'][idx % 5])
    }))

    const startDate = sprint.startDate ? new Date(sprint.startDate) : new Date(sprint.createdAt || Date.now())
    const endDate = sprint.endDate ? new Date(sprint.endDate) : new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000)
    const now = new Date()
    const diffTime = Math.max(86400000, Math.abs(endDate.getTime() - startDate.getTime()))
    const totalDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)))
    const steps = Math.min(Math.max(totalDays, 5), 30)

    const tasks = sprint.tasks || []
    const cfdData: Record<string, any>[] = []

    const elapsedMs = Math.max(0, now.getTime() - startDate.getTime())
    const currentDayIndex = Math.min(steps, Math.ceil(elapsedMs / (1000 * 60 * 60 * 24)))

    for (let i = 0; i <= steps; i++) {
      const stepDate = new Date(startDate.getTime() + i * (diffTime / steps))
      const dayStr = stepDate.getDate().toString().padStart(2, '0')
      const monthStr = (stepDate.getMonth() + 1).toString().padStart(2, '0')
      const row: Record<string, any> = {
        date: `${dayStr}/${monthStr}`,
        isoDate: stepDate.toISOString().split('T')[0],
        day: `Day ${i + 1}`
      }

      for (const col of sortedCols) {
        row[col.title] = 0
        row[col.id] = 0
      }

      for (const task of tasks) {
        const col = sortedCols.find((c) => c.id === (task.boardColumnId || task.boardColumn?.id))
        const colTitle = col ? col.title : (sortedCols[0]?.title || 'To Do')
        const colId = col ? col.id : (sortedCols[0]?.id || '')

        if (i >= currentDayIndex) {
          row[colTitle] = (row[colTitle] || 0) + 1
          if (colId) row[colId] = (row[colId] || 0) + 1
        } else {
          const isTaskUpdatedLater = new Date(task.updatedAt || task.createdAt).getTime() > stepDate.getTime()
          if (isTaskUpdatedLater) {
            const initialCol = sortedCols[0]
            const initialColTitle = initialCol?.title || 'To Do'
            const initialColId = initialCol?.id || ''
            row[initialColTitle] = (row[initialColTitle] || 0) + 1
            if (initialColId) row[initialColId] = (row[initialColId] || 0) + 1
          } else {
            row[colTitle] = (row[colTitle] || 0) + 1
            if (colId) row[colId] = (row[colId] || 0) + 1
          }
        }
      }

      cfdData.push(row)
    }

    return {
      columns,
      cfdData,
      timeline: cfdData
    }
  }
}
