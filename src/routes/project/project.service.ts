import { Injectable } from '@nestjs/common'
import { CreateProjectBodyType } from './project.model'
import { ProjectRepo } from './project.repo'
import { GetListQueryType } from '~/shared/models/request.model'
import { isNotFoundPrismaError } from '~/shared/helpers'
import { ProjectNotFoundError } from './project.error'

@Injectable()
export class ProjectService {
  constructor(private readonly projectRepo: ProjectRepo) {}

  async findAll(query: GetListQueryType, userId: number) {
    return await this.projectRepo.findAll(query, userId)
  }

  async findById(id: number) {
    return await this.projectRepo.findById(id)
  }

  async create({ body, ownerId }: { body: CreateProjectBodyType; ownerId: number }) {
    return await this.projectRepo.create({ body, ownerId })
  }

  async update({ id, body }: { id: number; body: CreateProjectBodyType }) {
    try {
      return await this.projectRepo.update({ id, body })
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw ProjectNotFoundError
      }
      throw error
    }
  }

  async delete(id: number) {
    try {
      await this.projectRepo.delete(id)

      return { message: 'Project deleted successfully' }
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw ProjectNotFoundError
      }
      throw error
    }
  }
}
