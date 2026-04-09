import { Injectable } from '@nestjs/common'
import { RoleName } from '~/shared/constants/role.constants'
import { PrismaService } from '~/shared/services/prisma.service'
import { RoleType } from '../models/shared-role.model'

@Injectable()
export class SharedRoleRepository {
  private clientRoleId: number | null = null
  private adminRoleId: number | null = null
  private ownerRoleId: number | null = null
  private memberRoleId: number | null = null
  private viewerRoleId: number | null = null

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
    const role = await this.getRole(RoleName.Owner)
    this.ownerRoleId = role.id
    return role.id
  }

  async getMemberRoleId() {
    if (this.memberRoleId) {
      return this.memberRoleId
    }
    const role = await this.getRole(RoleName.Member)
    this.memberRoleId = role.id
    return role.id
  }

  async getViewerRoleId() {
    if (this.viewerRoleId) {
      return this.viewerRoleId
    }
    const role = await this.getRole(RoleName.Viewer)
    this.viewerRoleId = role.id
    return role.id
  }
}
