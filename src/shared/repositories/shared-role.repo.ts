import { Injectable } from '@nestjs/common'
import { RoleName } from '~/shared/constants/role.constants'
import { ProjectMemberRole } from '~/shared/constants/project.constants'
import { PrismaService } from '~/shared/services/prisma.service'
import { RoleType } from '../models/shared-role.model'

@Injectable()
export class SharedRoleRepository {
  private clientRoleId: string | null = null
  private adminRoleId: string | null = null
  private ownerRoleId: string | null = null
  private coOwnerRoleId: string | null = null
  private memberRoleId: string | null = null
  private viewerRoleId: string | null = null

  constructor(private readonly prismaService: PrismaService) {}
  private async getRole(roleName: string) {
    const role: RoleType = await this.prismaService.$queryRaw<RoleType[]>`
    SELECT * FROM "Role" WHERE name = ${roleName} AND "deletedAt" IS NULL LIMIT 1
    `.then((res: RoleType[]) => {
      if (res.length === 0) {
        throw new Error(`Role with name ${roleName} not found`)
      }
      return res[0]
    })
    return role
  }
  async getClientRoleId() {
    if (this.clientRoleId) {
      return this.clientRoleId
    }
    const role = await this.getRole(RoleName.User)
    this.clientRoleId = role.id
    return role.id
  }

  async getAdminRoleId() {
    if (this.adminRoleId) {
      return this.adminRoleId
    }
    const role = await this.getRole(RoleName.Admin)
    this.adminRoleId = role.id
    return role.id
  }

  async getOwnerRoleId() {
    if (this.ownerRoleId) {
      return this.ownerRoleId
    }
    const role = await this.getRole(ProjectMemberRole.OWNER)
    this.ownerRoleId = role.id
    return role.id
  }

  async getCoOwnerRoleId() {
    if (this.coOwnerRoleId) {
      return this.coOwnerRoleId
    }
    const role = await this.getRole(ProjectMemberRole.CO_OWNER)
    this.coOwnerRoleId = role.id
    return role.id
  }

  async getMemberRoleId() {
    if (this.memberRoleId) {
      return this.memberRoleId
    }
    const role = await this.getRole(ProjectMemberRole.MEMBER)
    this.memberRoleId = role.id
    return role.id
  }

  async getViewerRoleId() {
    if (this.viewerRoleId) {
      return this.viewerRoleId
    }
    const role = await this.getRole(ProjectMemberRole.VIEWER)
    this.viewerRoleId = role.id
    return role.id
  }

  async getRoleIdByName(roleName: string) {
    switch (roleName) {
      case RoleName.User:
        return this.getClientRoleId()
      case RoleName.Admin:
        return this.getAdminRoleId()
      case ProjectMemberRole.OWNER:
        return this.getOwnerRoleId()
      case ProjectMemberRole.CO_OWNER:
        return this.getCoOwnerRoleId()
      case ProjectMemberRole.MEMBER:
        return this.getMemberRoleId()
      case ProjectMemberRole.VIEWER:
        return this.getViewerRoleId()
      default:
        throw new Error(`Role with name ${roleName} not found`)
    }
  }
}
