import { createZodDto } from 'nestjs-zod'
import {
  GetProjectReportParamSchema,
  GetSprintReportParamSchema,
  MemberDistributionResSchema,
  ProjectVelocityResSchema,
  SprintGanttChartResSchema,
  SprintNetworkDiagramResSchema,
  SprintProgressResSchema
} from './report.model'

export class GetSprintReportParamDTO extends createZodDto(GetSprintReportParamSchema) {}
export class GetProjectReportParamDTO extends createZodDto(GetProjectReportParamSchema) {}

export class SprintProgressResDTO extends createZodDto(SprintProgressResSchema) {}
export class ProjectVelocityResDTO extends createZodDto(ProjectVelocityResSchema) {}
export class MemberDistributionResDTO extends createZodDto(MemberDistributionResSchema) {}
export class SprintNetworkDiagramResDTO extends createZodDto(SprintNetworkDiagramResSchema) {}
export class SprintGanttChartResDTO extends createZodDto(SprintGanttChartResSchema) {}
