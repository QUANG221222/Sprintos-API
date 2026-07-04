import { Module } from '@nestjs/common'
import { BoardColumnService } from './board-column.service'
import { BoardColumnController } from './board-column.controller'
import { BoardColumnRepo } from './board-column.repo'

@Module({
  providers: [BoardColumnService, BoardColumnRepo],
  controllers: [BoardColumnController]
})
export class BoardColumnModule {}
