import { Injectable } from '@nestjs/common'
import { SprintRepo } from './sprint.repo'
import { GetListQueryType } from '~/shared/models/request.model'
import { isNotFoundPrismaError } from '~/shared/helpers'
import { SprintNotFoundError } from './sprint.error'
import { CreateSprintBodyType, UpdateSprintBodyType } from './sprint.model'
import { GetProjectParamType } from '~/shared/models/shared-project.model'

@Injectable()
export class SprintService {
  constructor(private readonly sprintRepo: SprintRepo) {}

  async findAllByProjectId(params: GetProjectParamType, query: GetListQueryType) {
    return await this.sprintRepo.findAllByProjectId(params, query)
  }

  async findById(id: string) {
    const sprint = await this.sprintRepo.findById({ sprintId: id })
    if (!sprint) {
      throw SprintNotFoundError
    }
    return sprint
  }

  async create(body: CreateSprintBodyType, userId: string) {
    return await this.sprintRepo.create(body, userId)
  }

  async update({ id, body, userId }: { id: string; body: UpdateSprintBodyType; userId: string }) {
    try {
      return await this.sprintRepo.update({ id, body, userId })
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw SprintNotFoundError
      }
      throw error
    }
  }

  async delete({ id, userId }: { id: string; userId: string }, isHard?: boolean) {
    try {
      await this.sprintRepo.delete({ id, userId }, isHard)
      return { message: 'Sprint deleted successfully' }
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw SprintNotFoundError
      }
      throw error
    }
  }
}
