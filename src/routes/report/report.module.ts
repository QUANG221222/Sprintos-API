import { Module } from '@nestjs/common'
import { ReportController } from './report.controller'
import { ReportService } from './report.service'
import { ReportRepo } from './report.repo'

@Module({
  controllers: [ReportController],
  providers: [ReportService, ReportRepo],
  exports: [ReportService, ReportRepo]
})
export class ReportModule {}
