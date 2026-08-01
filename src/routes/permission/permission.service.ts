import { Injectable } from '@nestjs/common'
import { CreatePermissionBodyType, GetPermissionQueryType, UpdatePermissionBodyType } from './permission.model'
import { PermissionRepository } from './permission.repo'
import { NotFoundRecordException } from '~/shared/error'
import { isNotFoundPrismaError, isUniqueConstraintPrismaError } from '~/shared/helpers'
import { PermissionAlreadyExistsException } from './permission.error'

@Injectable()
export class PermissionService {
  constructor(private readonly permissionRepository: PermissionRepository) {}

  async list(pagination: GetPermissionQueryType) {
    return await this.permissionRepository.list(pagination)
  }

  async findById(permissionId: string) {
    const permission = await this.permissionRepository.findById(permissionId)
    if (!permission) {
      throw NotFoundRecordException
    }
    return permission
  }

  async create({ createdById, data }: { createdById: string | null; data: CreatePermissionBodyType }) {
    try {
      return await this.permissionRepository.create({ createdById, data })
    } catch (error) {
      if (isUniqueConstraintPrismaError(error)) {
        throw PermissionAlreadyExistsException
      }
      throw error
    }
  }

  async update({
    permissionId,
    updatedById,
    data
  }: {
    permissionId: string
    updatedById: string | null
    data: UpdatePermissionBodyType
  }) {
    try {
      const permission = await this.permissionRepository.update({ permissionId, updatedById, data })
      return permission
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw NotFoundRecordException
      }
      if (isUniqueConstraintPrismaError(error)) {
        throw PermissionAlreadyExistsException
      }
      throw error
    }
  }

  async delete(
    { permissionId, deletedById }: { permissionId: string; deletedById: string | null; isHard?: boolean },
    isHard?: boolean
  ) {
    try {
      await this.permissionRepository.delete({ permissionId, deletedById }, isHard)
      return {
        message: 'Delete permission successfully'
      }
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw NotFoundRecordException
      }
      throw error
    }
  }
}
