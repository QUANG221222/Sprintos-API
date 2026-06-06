import envConfig from '~/shared/config'
import { UserStatus } from '~/shared/constants/auth.constants'
import { RoleName } from '~/shared/constants/role.constants'
import { HashingService } from '~/shared/services/hashing.service'
import { PrismaService } from '~/shared/services/prisma.service'

const prisma = new PrismaService()
const hashingService = new HashingService()
const main = async () => {
  const roleCount = await prisma.role.count()
  if (roleCount > 0) {
    throw new Error('Roles already exist in the database. Aborting seeding.')
  }
  const roles = await prisma.role.createMany({
    data: [
      {
        name: RoleName.Admin,
        description: 'Admin role'
      },
      {
        name: RoleName.User,
        description: 'User role'
      },
      {
        name: RoleName.Owner,
        description: 'Project member owner role'
      },
      {
        name: RoleName.CoOwner,
        description: 'Project co-owner role'
      },
      {
        name: RoleName.Member,
        description: 'Project member role'
      },
      {
        name: RoleName.Viewer,
        description: 'Viewer role'
      }
    ]
  })

  const adminRole = await prisma.role.findFirstOrThrow({
    where: { name: RoleName.Admin }
  })

  const hashedPassword = await hashingService.hash(envConfig.ADMIN_PASSWORD)
  const adminUser = await prisma.user.create({
    data: {
      email: envConfig.ADMIN_EMAIL,
      password: hashedPassword,
      displayName: envConfig.ADMIN_NAME,
      phoneNumber: envConfig.ADMIN_NUMBERPHONE,
      status: UserStatus.ACTIVE,
      roleId: adminRole.id
    }
  })

  return {
    createdRoleCount: roles.count,
    adminUser
  }
}

main()
  .then(({ adminUser, createdRoleCount }) => {
    console.log(`Created ${createdRoleCount} roles`)
    console.log(`Created admin user: ${adminUser.email}`)
  })
  .catch(console.error)
