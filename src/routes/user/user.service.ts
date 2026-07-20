import { SharedRoleRepository } from '~/shared/repositories/shared-role.repo'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { CreateUserBodyType, GetUsersQueryType, UpdateUserBodyType } from './user.model'
import { UserRepository } from './user.repo'
import { UserType } from '~/shared/models/shared-user.model'
import {
  isForeignKeyConstraintPrismaError,
  isNotFoundPrismaError,
  isUniqueConstraintPrismaError
} from '~/shared/helpers'
import { NotFoundRecordException } from '~/shared/error'
import {
  CannotUpdateOrDeleteByYourselfException,
  RoleNotFoundException,
  UserAlreadyExistsException
} from './user.error'
import { HashingService } from '~/shared/services/hashing.service'
import { SharedUserRepository } from '~/shared/repositories/shared-user.repo'
import { RoleName } from '~/shared/constants/role.constants'

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly sharedUserRepository: SharedUserRepository,
    private readonly hashingService: HashingService,
    private readonly sharedRoleRepository: SharedRoleRepository
  ) {}

  list(navigation: GetUsersQueryType) {
    return this.userRepository.list(navigation)
  }

  async findById(id: number) {
    const user = await this.sharedUserRepository.findUnique({
      id
    })
    if (!user) {
      throw NotFoundRecordException
    }
    return user
  }

  private async verifyRole({ roleNameAgent, roleIdTarget }) {
    // Agent is admin can allow
    if (roleNameAgent === RoleName.Admin) {
      return true
    } else {
      // Agent is not admin cannot create or update user with role is admin
      const adminRoleId = await this.sharedRoleRepository.getAdminRoleId()
      if (roleIdTarget === adminRoleId) {
        throw new ForbiddenException('Error.CannotSetAdminRoleToUser')
      }
      return true
    }
  }

  async create({
    createdById,
    data,
    createdByRoleName
  }: {
    createdById: number | null
    data: CreateUserBodyType
    createdByRoleName: string
  }): Promise<UserType | null> {
    try {
      // Only admin can create user with role is ADMIN
      await this.verifyRole({
        roleNameAgent: createdByRoleName,
        roleIdTarget: data.roleId
      })

      const hashedPassword = await this.hashingService.hash(data.password)
      const user = await this.userRepository.create({
        createdById,
        data: {
          ...data,
          password: hashedPassword
        }
      })
      return user
    } catch (error) {
      if (isForeignKeyConstraintPrismaError(error)) {
        throw RoleNotFoundException
      }
      if (isUniqueConstraintPrismaError(error)) {
        throw UserAlreadyExistsException
      }
      throw error
    }
  }

  private verifyYourself({ userAgentId, userTargetId }: { userAgentId: number | null; userTargetId: number }) {
    if (userAgentId === userTargetId) {
      throw CannotUpdateOrDeleteByYourselfException
    }
  }

  async update({
    id,
    data,
    updateById,
    updatedByRoleName
  }: {
    id: number
    data: UpdateUserBodyType
    updateById: number | null
    updatedByRoleName: string
  }) {
    try {
      // Cannot update by yourself
      this.verifyYourself({ userAgentId: updateById, userTargetId: id })
      const currentUser = await this.sharedUserRepository.findUnique({
        id
      })
      if (!currentUser) {
        throw NotFoundRecordException
      }
      // Get first RoleId of update user to check if agent can update or not
      // Not use date.RoleId because it can use wrong RoleId by client
      const roleIdTarget = currentUser.roleId

      // Only admin can update user with role is ADMIN
      await this.verifyRole({
        roleNameAgent: updatedByRoleName,
        roleIdTarget
      })

      const updateUser = await this.sharedUserRepository.update(
        {
          id
        },
        {
          ...data,
          updatedById: updateById
        }
      )
      return updateUser
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw NotFoundRecordException
      }
      if (isForeignKeyConstraintPrismaError(error)) {
        throw RoleNotFoundException
      }
      if (isUniqueConstraintPrismaError(error)) {
        throw UserAlreadyExistsException
      }
      throw error
    }
  }
  async delete({ id, deletedById, deletedByRoleName }: { id: number; deletedById: number; deletedByRoleName: string }) {
    try {
      // Cannot delete by yourself
      this.verifyYourself({ userAgentId: deletedById, userTargetId: id })

      const currentUser = await this.sharedUserRepository.findUnique({
        id
      })
      if (!currentUser) {
        throw NotFoundRecordException
      }
      const roleIdTarget = currentUser.roleId
      // Only admin can delete user with role is ADMIN
      await this.verifyRole({
        roleNameAgent: deletedByRoleName,
        roleIdTarget
      })
      await this.userRepository.delete({
        id,
        deletedById
      })
      return {
        message: 'Delete user successfully'
      }
    } catch (error) {
      if (isNotFoundPrismaError(error)) {
        throw NotFoundRecordException
      }
      throw error
    }
  }
}
