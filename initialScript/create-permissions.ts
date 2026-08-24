import { NestFactory } from '@nestjs/core'
import { createId } from '@paralleldrive/cuid2'
import { AppModule } from '~/app.module'
import { HTTPMethod, RoleName } from '~/shared/constants/role.constants'
import { ProjectMemberRole } from '~/shared/constants/project.constants'
import { PrismaService } from '~/shared/services/prisma.service'

const prisma = new PrismaService()

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.setGlobalPrefix('api')
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
      data: routesToAdd.map((route) => ({
        id: createId(),
        ...route
      })),
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
      permissions.filter(
        (p) => {
          const cleanPath = p.path.replace(/^\/api/, '')
          return (
            cleanPath.startsWith('/auth') ||
            cleanPath.startsWith('/profile') ||
            cleanPath.startsWith('/media') ||
            cleanPath === '/users/me' ||
            (cleanPath.startsWith('/users') && p.method === 'GET') ||
            (cleanPath === '/projects' && (p.method === 'GET' || p.method === 'POST')) ||
            cleanPath === '/projects/owned' ||
            cleanPath === '/projects/joined' ||
            cleanPath.startsWith('/reports') ||
            cleanPath.startsWith('/notifications') ||
            cleanPath.startsWith('/project-chats')
          )
        }
      ),
    [ProjectMemberRole.CO_OWNER]: (permissions: typeof updatedPermissionsInDb) =>
      permissions.filter(
        (p) => {
          const cleanPath = p.path.replace(/^\/api/, '')
          return (
            (cleanPath.startsWith('/projects') && p.method === 'GET') ||
            (cleanPath.startsWith('/project-members') &&
              (p.method === 'GET' || p.method === 'POST' || p.method === 'PATCH')) ||
            cleanPath.startsWith('/sprints') ||
            cleanPath.startsWith('/tasks') ||
            cleanPath.startsWith('/board-columns') ||
            cleanPath.startsWith('/reports') ||
            cleanPath.startsWith('/notifications') ||
            cleanPath.startsWith('/project-chats')
          )
        }
      ),
    [ProjectMemberRole.OWNER]: (permissions: typeof updatedPermissionsInDb) =>
      permissions.filter(
        (p) => {
          const cleanPath = p.path.replace(/^\/api/, '')
          return (
            cleanPath.startsWith('/projects') ||
            cleanPath.startsWith('/project-members') ||
            cleanPath.startsWith('/sprints') ||
            cleanPath.startsWith('/tasks') ||
            cleanPath.startsWith('/board-columns') ||
            cleanPath.startsWith('/reports') ||
            cleanPath.startsWith('/notifications') ||
            cleanPath.startsWith('/project-chats')
          )
        }
      ),
    [ProjectMemberRole.MEMBER]: (permissions: typeof updatedPermissionsInDb) =>
      permissions.filter(
        (p) => {
          const cleanPath = p.path.replace(/^\/api/, '')
          return (
            ((cleanPath.startsWith('/projects') || cleanPath.startsWith('/project-members')) && p.method === 'GET') ||
            cleanPath.startsWith('/sprints') ||
            cleanPath.startsWith('/tasks') ||
            cleanPath.startsWith('/board-columns') ||
            cleanPath.startsWith('/reports') ||
            cleanPath.startsWith('/notifications') ||
            cleanPath.startsWith('/project-chats')
          )
        }
      ),
    [ProjectMemberRole.VIEWER]: (permissions: typeof updatedPermissionsInDb) =>
      permissions.filter(
        (p) => {
          const cleanPath = p.path.replace(/^\/api/, '')
          return (
            p.method === 'GET' &&
            (cleanPath.startsWith('/projects') ||
              cleanPath.startsWith('/project-members') ||
              cleanPath.startsWith('/sprints') ||
              cleanPath.startsWith('/tasks') ||
              cleanPath.startsWith('/board-columns') ||
              cleanPath.startsWith('/reports') ||
              cleanPath.startsWith('/notifications') ||
              cleanPath.startsWith('/project-chats'))
          )
        }
      )
  }

  // Sau đó apply và cập nhật cho từng role trong database
  for (const roleKey of Object.values(RoleName)) {
    const filterFn = rolePermissionFilter[roleKey]
    if (!filterFn) continue

    const rolePermissions = filterFn(updatedPermissionsInDb)
    const roleRecord = await prisma.role.findFirst({
      where: {
        name: roleKey,
        deletedAt: null
      }
    })

    if (roleRecord) {
      await prisma.role.update({
        where: { id: roleRecord.id },
        data: {
          permissions: {
            set: rolePermissions.map((permission) => ({ id: permission.id }))
          }
        }
      })
      console.log(`Updated permissions for role: ${roleKey} (${rolePermissions.length} permissions)`)
    } else {
      console.warn(`Role ${roleKey} not found in database.`)
    }
  }

  console.log('Permission update completed.')

  process.exit(0)
}
bootstrap()
