import { Injectable } from '@nestjs/common'
import { CreateRoleBodyType, GetRolesQueryType, UpdateRoleBodyType } from './role.model'
import { RoleRepository } from './role.repo'
import { ProhibitedActionOnBaseRoleException, RoleAlreadyExistsException } from './role.error'
import { NotFoundRecordException } from '~/shared/error'
import { isNotFoundPrismaError, isUniqueConstraintPrismaError } from '~/shared/helpers'
import { RoleName } from '~/shared/constants/role.constants'

@Injectable()
export class RoleService {
  constructor(private readonly roleRepository: RoleRepository) {}

  list({ page, limit }: GetRolesQueryType) {
    return this.roleRepository.list({ page, limit })
  }

  async findById(id: string) {
    const role = await this.roleRepository.findById(id)
    if (!role) {
      throw NotFoundRecordException
    }
    return role
  }

  async create({ createdById, data }: { createdById: string | null; data: CreateRoleBodyType }) {
    try {
      const role = await this.roleRepository.create({
        createdById,
        data
      })
      return role
    } catch (error) {
      if (isUniqueConstraintPrismaError(error)) {
        throw RoleAlreadyExistsException
      }
      throw error
    }
  }

  private async verifyRole(roleId: string) {
    const role = await this.roleRepository.findById(roleId)
    if (!role) {
      throw NotFoundRecordException
    }
    const baseRoles: string[] = Object.values(RoleName)

    if (baseRoles.includes(role.name)) {
      throw ProhibitedActionOnBaseRoleException
    }
  }

  async update({ id, updatedById, data }: { id: string; updatedById: string | null; data: UpdateRoleBodyType }) {
    try {
      await this.verifyRole(id)
      const updatedRole = await this.roleRepository.update({
        id,
        updatedById,
        data
      })
      return updatedRole
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw NotFoundRecordException
      }
      if (isUniqueConstraintPrismaError(error)) {
        throw RoleAlreadyExistsException
      }
      throw error
    }
  }

  async delete({ id, deletedById }: { id: string; deletedById: string | null }, isHard?: boolean) {
    try {
      await this.verifyRole(id)
      await this.roleRepository.delete({ id, deletedById }, isHard)
      return { message: 'Role deleted successfully' }
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw NotFoundRecordException
      }
      throw error
    }
  }
}
