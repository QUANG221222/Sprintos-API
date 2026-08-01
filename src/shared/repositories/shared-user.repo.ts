import { Injectable } from '@nestjs/common'
import { PrismaService } from '../services/prisma.service'
import { UserType } from '../models/shared-user.model'
import { RoleType } from '../models/shared-role.model'

export type WhereUniqueUserType = { id: string } | { email: string }
@Injectable()
export class SharedUserRepository {
  constructor(private readonly prismaService: PrismaService) {}

  findUnique(where: WhereUniqueUserType): Promise<UserType | null> {
    return this.prismaService.user.findFirst({
      where: {
        ...where,
        deletedAt: null
      }
    })
  }

  findByEmail(email: string): Promise<UserType | null> {
    return this.prismaService.user.findFirst({
      where: {
        email,
        deletedAt: null
      }
    })
  }

  findManyByEmails(emails: string[]): Promise<UserType[]> {
    return this.prismaService.user.findMany({
      where: {
        email: { in: emails },
        deletedAt: null
      }
    })
  }

  findUniqueUserIncludeRole(where: WhereUniqueUserType): Promise<(UserType & { role: RoleType }) | null> {
    return this.prismaService.user.findFirst({
      where: {
        ...where,
        deletedAt: null
      },
      include: {
        role: true
      }
    }) as Promise<(UserType & { role: RoleType }) | null>
  }

  update(where: WhereUniqueUserType, data: Partial<UserType>): Promise<UserType | null> {
    return this.prismaService.user.update({
      where: {
        ...where,
        deletedAt: null
      },
      data
    })
  }
}
