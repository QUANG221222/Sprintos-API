interface ProgressData {
  name: string
  value: number
  color: string
}

interface SprintProgressReport {
  sprintId: string
  sprintName: string
  totalTasks: number
  completedTasks: number
  progress: string
  progressData: ProgressData[]
  sprint: {
    goal: string
    startDate: Date | number
    endDate: Date | number
    status: string
    maxStoryPoint: number
  }
}

interface GetSprintProgressReportResponse {
  message: string
  data: SprintProgressReport
}

interface VelocityData {
  sprint: string
  planned: number
  completed: number
}

interface ProjectVelocityReport {
  projectId: string
  projectName: string
  velocityData: VelocityData[]
}

interface GetProjectVelocityReportResponse {
  message: string
  data: ProjectVelocityReport
}

interface MemberDistributionData {
  name: string
  done: number
  inProgress: number
  todo: number
}

interface SprintMemberDistribution {
  sprintId: string
  sprintName: string
  totalMembers: number
  memberDistribution: MemberDistributionData[]
}

interface GetSprintMemberDistributionResponse {
  message: string
  data: SprintMemberDistribution
}

export type {
  ProgressData,
  SprintProgressReport,
  GetSprintProgressReportResponse,
  VelocityData,
  ProjectVelocityReport,
  GetProjectVelocityReportResponse,
  MemberDistributionData,
  SprintMemberDistribution,
  GetSprintMemberDistributionResponse
}