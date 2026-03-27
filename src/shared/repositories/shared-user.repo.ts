import { Injectable } from '@nestjs/common'
import { PrismaService } from '../services/prisma.service'
import { UserType } from '../models/shared-user.model'

export type WhereUniqueUserType = { id: number; [key: string]: any } | { email: string; [key: string]: any }
@Injectable()
export class SharedUserRepository {
  constructor(private readonly prismaService: PrismaService) {}

  findUnique(where: WhereUniqueUserType): Promise<UserType | null> {
    return this.prismaService.user.findUnique({
      where
    })
  }

  update(
    where: WhereUniqueUserType,
    data: Partial<Omit<UserType, 'id' | 'createdAt' | 'email' | 'role'>>
  ): Promise<UserType> {
    return this.prismaService.user.update({
      where,
      data
    })
  }
}
