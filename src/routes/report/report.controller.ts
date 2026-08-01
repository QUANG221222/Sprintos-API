import { Controller, Get, Param } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'
import { ReportService } from './report.service'
import {
  GetProjectReportParamDTO,
  GetSprintReportParamDTO,
  MemberDistributionResDTO,
  ProjectVelocityResDTO,
  SprintGanttChartResDTO,
  SprintNetworkDiagramResDTO,
  SprintProgressResDTO
} from './report.dto'

@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('sprint/:sprintId/progress')
  @ZodSerializerDto(SprintProgressResDTO)
  getSprintProgress(@Param() params: GetSprintReportParamDTO) {
    return this.reportService.getSprintProgress(params.sprintId)
  }

  @Get('project/:projectId/velocity')
  @ZodSerializerDto(ProjectVelocityResDTO)
  getProjectVelocity(@Param() params: GetProjectReportParamDTO) {
    return this.reportService.getProjectVelocity(params.projectId)
  }

  @Get('sprint/:sprintId/member-distribution')
  @ZodSerializerDto(MemberDistributionResDTO)
  getMemberDistribution(@Param() params: GetSprintReportParamDTO) {
    return this.reportService.getMemberDistribution(params.sprintId)
  }

  @Get('sprint/:sprintId/network-diagram')
  @ZodSerializerDto(SprintNetworkDiagramResDTO)
  getSprintNetworkDiagram(@Param() params: GetSprintReportParamDTO) {
    return this.reportService.getSprintNetworkDiagram(params.sprintId)
  }

  @Get('sprint/:sprintId/gantt-chart')
  @ZodSerializerDto(SprintGanttChartResDTO)
  getSprintGanttChart(@Param() params: GetSprintReportParamDTO) {
    return this.reportService.getSprintGanttChart(params.sprintId)
  }
}
