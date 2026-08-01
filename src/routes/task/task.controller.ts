import { Body, Controller, Delete, Get, Param, ParseBoolPipe, Patch, Post, Put, Query } from '@nestjs/common'
import { TaskService } from './task.service'
import { ZodSerializerDto } from 'nestjs-zod'
import {
  AddTaskAttachmentBodyDTO,
  AddTaskCommentBodyDTO,
  CreateTaskBodyDTO,
  GetSprintParamDTO,
  GetTaskDetailResDTO,
  GetTaskParamDTO,
  TaskAttachmentResDTO,
  TaskCommentResDTO,
  UpdateTaskBodyDTO,
  CreateTaskDependencyBodyDTO,
  TaskDependencyResDTO,
  SprintNetworkDiagramResDTO,
  GetBoardColumnParamDTO,
  ReorderTasksBodyDTO,
  MoveTaskBodyDTO
} from './task.dto'
import { MessageResDTO } from '~/shared/dtos/response.dto'
import { ActiveUser } from '~/shared/decorators/active-user.decorator'
import { SprintBoardDetailDTO } from '~/shared/dtos/shared-sprint-board.dto'

@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post('dependencies')
  @ZodSerializerDto(TaskDependencyResDTO)
  createDependency(@Body() body: CreateTaskDependencyBodyDTO) {
    return this.taskService.createDependency(body)
  }

  @Delete('dependencies/:dependencyId')
  @ZodSerializerDto(MessageResDTO)
  deleteDependency(@Param('dependencyId') dependencyId: string) {
    return this.taskService.deleteDependency(dependencyId)
  }

  @Get('sprint/:sprintId/network-diagram')
  @ZodSerializerDto(SprintNetworkDiagramResDTO)
  getSprintNetworkDiagram(@Param() params: GetSprintParamDTO) {
    return this.taskService.getSprintNetworkDiagram(params.sprintId)
  }

  @Post()
  @ZodSerializerDto(GetTaskDetailResDTO)
  create(@Body() body: CreateTaskBodyDTO, @ActiveUser('userId') userId: string) {
    return this.taskService.create(body, userId)
  }

  @Get(':taskId')
  @ZodSerializerDto(GetTaskDetailResDTO)
  findById(@Param() params: GetTaskParamDTO) {
    return this.taskService.findById(params.taskId)
  }

  @Put(':taskId')
  @ZodSerializerDto(GetTaskDetailResDTO)
  update(@Param() params: GetTaskParamDTO, @Body() body: UpdateTaskBodyDTO, @ActiveUser('userId') userId: string) {
    return this.taskService.update({ id: params.taskId, body, userId })
  }

  @Delete(':taskId')
  @ZodSerializerDto(MessageResDTO)
  delete(
    @Param() params: GetTaskParamDTO,
    @ActiveUser('userId') userId: string,
    @Query('isHard', new ParseBoolPipe({ optional: true })) isHard?: boolean
  ) {
    return this.taskService.delete({ id: params.taskId, userId }, isHard)
  }

  @Get('sprint/:sprintId')
  @ZodSerializerDto(SprintBoardDetailDTO)
  findAllBySprintId(@Param() params: GetSprintParamDTO) {
    return this.taskService.findAllBySprintId(params)
  }

  @Post(':taskId/comments')
  @ZodSerializerDto(TaskCommentResDTO)
  addComment(
    @Param() params: GetTaskParamDTO,
    @Body() body: AddTaskCommentBodyDTO,
    @ActiveUser('userId') memberId: string
  ) {
    return this.taskService.addComment({ taskId: params.taskId, memberId, body })
  }

  @Post(':taskId/attachments')
  @ZodSerializerDto(TaskAttachmentResDTO)
  addAttachment(@Param() params: GetTaskParamDTO, @Body() body: AddTaskAttachmentBodyDTO) {
    return this.taskService.addAttachment({ taskId: params.taskId, body })
  }

  @Put('board-column/:boardColumnId/reorder')
  @ZodSerializerDto(SprintBoardDetailDTO)
  reorderTasks(@Param() params: GetBoardColumnParamDTO, @Body() body: ReorderTasksBodyDTO) {
    return this.taskService.reorderTasks(params.boardColumnId, body.taskOrderIds)
  }

  @Patch(':taskId/move')
  @ZodSerializerDto(SprintBoardDetailDTO)
  moveTask(@Param() params: GetTaskParamDTO, @Body() body: MoveTaskBodyDTO) {
    return this.taskService.moveTask(params.taskId, body.targetColumnId, body.newIndex)
  }
}
