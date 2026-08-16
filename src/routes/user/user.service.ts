import { SharedRoleRepository } from '~/shared/repositories/shared-role.repo'
import { ForbiddenException, Injectable } from '@nestjs/common'
import {
  CreateUserBodyType,
  GetUsersQueryType,
  UpdateProfileBodyType,
  UpdateUserBodyType
} from './user.model'
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
import { S3Service } from '~/shared/services/S3.service'

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly sharedUserRepository: SharedUserRepository,
    private readonly hashingService: HashingService,
    private readonly sharedRoleRepository: SharedRoleRepository,
    private readonly s3Service: S3Service
  ) {}

  list(navigation: GetUsersQueryType) {
    return this.userRepository.list(navigation)
  }

  /**
   * Helper to extract S3 object key from URL or raw fileKey
   */
  private extractS3Key(avatarUrl?: string | null): string | null {
    if (!avatarUrl) return null
    if (avatarUrl.startsWith('avatar-user/') || avatarUrl.startsWith('uploads/')) {
      return avatarUrl.split('?')[0]
    }
    try {
      const url = new URL(avatarUrl)
      const pathname = url.pathname.replace(/^\/+/, '')
      if (pathname.startsWith('avatar-user/') || pathname.startsWith('uploads/')) {
        return pathname
      }
    } catch {
      // Not a standard URL
    }
    return null
  }

  async findById(id: string) {
    const user = await this.sharedUserRepository.findUnique({
      id
    })
    if (!user) {
      throw NotFoundRecordException
    }

    // If user has an S3 avatar, generate a fresh presigned GET URL
    if (user.avatar) {
      const s3Key = user.avatarPublicId || this.extractS3Key(user.avatar)
      if (s3Key) {
        try {
          const presignedGetUrl = await this.s3Service.createPresignedGetUrl(s3Key, 7 * 24 * 3600)
          return {
            ...user,
            avatar: presignedGetUrl
          }
        } catch (error) {
          console.error('Failed to generate presigned GET URL for avatar:', error)
        }
      }
    }

    return user
  }

  /**
   * Self-profile update endpoint for current logged-in user
   * Automatically deletes old avatar from S3 if a new avatar is provided
   */
  async updateProfile({
    userId,
    data
  }: {
    userId: string
    data: UpdateProfileBodyType
  }) {
    const currentUser = await this.sharedUserRepository.findUnique({
      id: userId
    })
    if (!currentUser) {
      throw NotFoundRecordException
    }

    // Check if avatar is being updated and user already has an existing avatar in S3
    const newAvatarKey = data.avatarPublicId || this.extractS3Key(data.avatar)
    const oldAvatarKey = currentUser.avatarPublicId || this.extractS3Key(currentUser.avatar)

    if (newAvatarKey && oldAvatarKey && newAvatarKey !== oldAvatarKey) {
      try {
        console.log(`[UserService] Replacing old avatar in S3: ${oldAvatarKey}`)
        await this.s3Service.deleteObject(oldAvatarKey)
      } catch (err) {
        console.error('Failed to delete old avatar from S3:', err)
      }
    }

    const updatedUser = await this.sharedUserRepository.update(
      { id: userId },
      {
        ...data,
        avatarPublicId: newAvatarKey || currentUser.avatarPublicId,
        updatedById: userId
      }
    )

    if (!updatedUser) {
      throw NotFoundRecordException
    }

    // Return with signed avatar URL
    if (updatedUser.avatar) {
      const s3Key = updatedUser.avatarPublicId || this.extractS3Key(updatedUser.avatar)
      if (s3Key) {
        try {
          const presignedGetUrl = await this.s3Service.createPresignedGetUrl(s3Key, 7 * 24 * 3600)
          return {
            ...updatedUser,
            avatar: presignedGetUrl
          }
        } catch {
          // fallback
        }
      }
    }

    return updatedUser
  }

  private async verifyRole({ roleNameAgent, roleIdTarget }) {
    if (roleNameAgent === RoleName.Admin) {
      return true
    } else {
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
    createdById: string | null
    data: CreateUserBodyType
    createdByRoleName: string
  }): Promise<UserType | null> {
    try {
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

  private verifyYourself({ userAgentId, userTargetId }: { userAgentId: string | null; userTargetId: string }) {
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
    id: string
    data: UpdateUserBodyType
    updateById: string | null
    updatedByRoleName: string
  }) {
    try {
      this.verifyYourself({ userAgentId: updateById, userTargetId: id })
      const currentUser = await this.sharedUserRepository.findUnique({
        id
      })
      if (!currentUser) {
        throw NotFoundRecordException
      }
      const roleIdTarget = currentUser.roleId

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

  async delete({ id, deletedById, deletedByRoleName }: { id: string; deletedById: string; deletedByRoleName: string }) {
    try {
      this.verifyYourself({ userAgentId: deletedById, userTargetId: id })

      const currentUser = await this.sharedUserRepository.findUnique({
        id
      })
      if (!currentUser) {
        throw NotFoundRecordException
      }
      const roleIdTarget = currentUser.roleId
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
