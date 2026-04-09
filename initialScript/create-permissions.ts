import { NestFactory } from '@nestjs/core'
import { AppModule } from '~/app.module'
import { HTTPMethod, RoleName } from '~/shared/constants/role.constants'
import { PrismaService } from '~/shared/services/prisma.service'

const prisma = new PrismaService()

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  await app.listen(3030)
  const server = app.getHttpAdapter().getInstance()
  const router = server.router
  const permissionInDB = await prisma.permission.findMany({
    where: {
      deletedAt: null
    }
  })

  const availableRoutes: { path: string; method: keyof typeof HTTPMethod; name: string; module: string }[] =
    router.stack
      .map((layer) => {
        if (layer.route) {
          const path = layer.route?.path
          const method = layer.route?.stack[0].method.toUpperCase() as keyof typeof HTTPMethod
          const module = String(path.split('/')[1]).toUpperCase()
          return {
            path,
            method,
            module,
            name: `${method} ${path}`
          }
        }
      })
      .filter((item) => item !== undefined)

  // Tạo object perssionInDbMap với key là [method-path]
  const perssionInDbMap: Record<string, (typeof permissionInDB)[0]> = permissionInDB.reduce((map, item) => {
    map[`{${item.method}-${item.path}}`] = item
    return map
  }, {})

  // Tạo object availableRoutesMap với key là [method-path]
  const availableRoutesMap: Record<string, (typeof availableRoutes)[0]> = availableRoutes.reduce((map, item) => {
    map[`{${item.method}-${item.path}}`] = item
    return map
  }, {})

  // Tìm perssions trong datebase mà không còn trong availableRoutes nữa => xóa
  const permissionsToDelete = permissionInDB.filter((item) => {
    const key = `{${item.method}-${item.path}}`
    return !availableRoutesMap[key]
  })

  //Xóa permissions không tồn tại trong availableRoutes
  if (permissionsToDelete.length > 0) {
    const deleteResult = await prisma.permission.deleteMany({
      where: {
        id: {
          in: permissionsToDelete.map((p) => p.id)
        }
      }
    })
    console.log('Permissions deleted:', deleteResult.count)
  } else {
    console.log('No permissions to delete.')
  }

  // Tìm routes mà không tồn tại trong permissionsIdDb
  const routesToAdd = availableRoutes.filter((item) => {
    const key = `{${item.method}-${item.path}}`
    return !perssionInDbMap[key]
  })

  // Thêm các routes này dưới dạng permissions database
  if (routesToAdd.length > 0) {
    const permssionToAdd = await prisma.permission.createMany({
      data: routesToAdd,
      skipDuplicates: true
    })
    console.log('Permissions added:', permssionToAdd.count)
  } else {
    console.log('No new permissions to add.')
  }

  // ==============================================
  // Lấy lại permisions trong database sau khi thêm mới (hoặc xóa)
  const updatedPermissionsInDb = await prisma.permission.findMany({
    where: {
      deletedAt: null
    }
  })

  // Định nghĩa permission mapping cho từng role
  const rolePermissionFilter = {
    [RoleName.Admin]: (permissions: typeof updatedPermissionsInDb) => permissions,
    [RoleName.User]: (permissions: typeof updatedPermissionsInDb) =>
      permissions.filter((p) => p.method === 'GET' || p.path.startsWith('/auth') || p.path.startsWith('/profile')),
    [RoleName.Owner]: (permissions: typeof updatedPermissionsInDb) =>
      permissions.filter((p) => p.path.startsWith('/project'))
  }

  // Sau đó apply cho từng role
  const adminPermissions = rolePermissionFilter[RoleName.Admin](updatedPermissionsInDb)
  const userPermissions = rolePermissionFilter[RoleName.User](updatedPermissionsInDb)

  // Cập nhật lại các permission trong admin role
  const adminRole = await prisma.role.findFirstOrThrow({
    where: {
      name: RoleName.Admin,
      deletedAt: null
    }
  })
  await prisma.role.update({
    where: {
      id: adminRole.id
    },
    data: {
      permissions: {
        set: adminPermissions.map((permission) => ({ id: permission.id }))
      }
    }
  })

  // Cập nhật lại các permission trong user role
  const userRole = await prisma.role.findFirstOrThrow({
    where: {
      name: RoleName.User,
      deletedAt: null
    }
  })
  await prisma.role.update({
    where: {
      id: userRole.id
    },
    data: {
      permissions: {
        set: userPermissions.map((permission) => ({ id: permission.id }))
      }
    }
  })

  console.log('Permission update completed.')

  process.exit(0)
}
bootstrap()
