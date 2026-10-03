import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { createId } from '@paralleldrive/cuid2'
import { AppModule } from '~/app.module'
import { PrismaService } from '~/shared/services/prisma.service'
import { HashingService } from '~/shared/services/hashing.service'
import { HTTPMethod, RoleName } from '~/shared/constants/role.constants'
import { ProjectMemberRole, ProjectMemberStatus } from '~/shared/constants/project.constants'
import { UserStatus, Gender, SprintStatus, TaskPriority, NotificationType, TaskType, TechnicalRole } from '~/generated/prisma/enums'
import { DependencyType } from '~/generated/prisma/client'

const prisma = new PrismaService()
const hashingService = new HashingService()

async function main() {
  console.log('====================================================================================')
  console.log('🚀 SPRINTOS SEED DATA & PERMISSIONS GENERATOR')
  console.log('====================================================================================\n')

  // ==========================================
  // 1. BOOTSTRAP NESTAPP & DISCOVER ROUTES
  // ==========================================
  console.log('📡 Step 1: Initializing NestJS application and discovering API Routes...')
  const app = await NestFactory.create(AppModule, { logger: false })
  app.setGlobalPrefix('api')
  await app.init()

  const server = app.getHttpAdapter().getInstance()
  const router = server.router

  const availableRoutes: { path: string; method: keyof typeof HTTPMethod; name: string; module: string }[] =
    router.stack
      .map((layer: any) => {
        if (layer.route) {
          const path = layer.route?.path
          const method = layer.route?.stack[0].method.toUpperCase() as keyof typeof HTTPMethod
          const moduleName = String(path.split('/')[2] || 'GENERAL').toUpperCase()
          return {
            path,
            method,
            module: moduleName,
            name: `${method} ${path}`
          }
        }
      })
      .filter((item: any) => item !== undefined)

  console.log(`✅ Discovered ${availableRoutes.length} system API endpoints.`)

  // ==========================================
  // 2. CLEAN SLATE - DELETE EXISTING DATA
  // ==========================================
  console.log('\n🧹 Step 2: Cleaning existing business data & user records...')
  try {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE task_document_embeddings CASCADE;')
  } catch (e) {
    // Ignore if table does not exist
  }
  await prisma.notification.deleteMany()
  await prisma.projectChatMessage.deleteMany()
  await prisma.projectChat.deleteMany()
  await prisma.taskAttachment.deleteMany()
  await prisma.taskComment.deleteMany()
  await prisma.taskLabel.deleteMany()
  await prisma.taskAssignee.deleteMany()
  await prisma.boardColumnTaskOrder.deleteMany()
  await prisma.taskDependency.deleteMany()
  await prisma.task.deleteMany()
  await prisma.boardColumn.deleteMany()
  await prisma.sprintDailySnapshot.deleteMany().catch(() => {})
  await prisma.sprint.deleteMany()
  await prisma.projectMember.deleteMany()
  await prisma.project.deleteMany()
  await prisma.refreshToken.deleteMany()
  await prisma.device.deleteMany()
  await prisma.verificationCode.deleteMany()
  await prisma.user.deleteMany()
  await prisma.role.deleteMany()
  await prisma.permission.deleteMany()
  console.log('✅ Business data clean reset complete.')

  // ==========================================
  // 3. ROLES & PERMISSIONS SETUP
  // ==========================================
  console.log('\n🛡️ Step 3: Syncing Permissions and assigning System/Project Role matrices...')

  // Synchronize Permissions in DB
  const permissionInDB = await prisma.permission.findMany({ where: { deletedAt: null } })
  const availableRoutesMap = availableRoutes.reduce((map, item) => {
    map[`{${item.method}-${item.path}}`] = item
    return map
  }, {} as Record<string, (typeof availableRoutes)[0]>)

  const permissionsToDelete = permissionInDB.filter((item) => !availableRoutesMap[`{${item.method}-${item.path}}`])
  if (permissionsToDelete.length > 0) {
    await prisma.permission.deleteMany({ where: { id: { in: permissionsToDelete.map((p) => p.id) } } })
  }

  const perssionInDbMap = permissionInDB.reduce((map, item) => {
    map[`{${item.method}-${item.path}}`] = item
    return map
  }, {} as Record<string, (typeof permissionInDB)[0]>)

  const routesToAdd = availableRoutes.filter((item) => !perssionInDbMap[`{${item.method}-${item.path}}`])
  if (routesToAdd.length > 0) {
    const dataWithId = routesToAdd.map((r) => ({ id: createId(), ...r }))
    await prisma.permission.createMany({ data: dataWithId, skipDuplicates: true })
  }

  const updatedPermissionsInDb = await prisma.permission.findMany({ where: { deletedAt: null } })

  // Ensure 6 System/Project Roles exist in DB
  const requiredRoles = [
    { name: RoleName.Admin, description: 'System Administrator (Full Permissions)' },
    { name: RoleName.User, description: 'Standard System User' },
    { name: RoleName.Owner, description: 'Project Owner' },
    { name: RoleName.CoOwner, description: 'Project Co-Owner' },
    { name: RoleName.Member, description: 'Project Member' },
    { name: RoleName.Viewer, description: 'Project Read-Only Viewer' }
  ]

  for (const roleDef of requiredRoles) {
    const existing = await prisma.role.findFirst({ where: { name: roleDef.name, deletedAt: null } })
    if (!existing) {
      await prisma.role.create({ data: { id: createId(), name: roleDef.name, description: roleDef.description } })
    } else {
      await prisma.role.update({ where: { id: existing.id }, data: { description: roleDef.description } })
    }
  }

  // Permission Mapping Filters
  const rolePermissionFilter = {
    [RoleName.Admin]: (perms: typeof updatedPermissionsInDb) => perms,
    [RoleName.User]: (perms: typeof updatedPermissionsInDb) =>
      perms.filter((p) => {
        const cleanPath = p.path.replace(/^\/api/, '')
        return (
          cleanPath.startsWith('/auth') ||
          cleanPath.startsWith('/media') ||
          cleanPath === '/users/me' ||
          (cleanPath.startsWith('/users') && p.method === 'GET') ||
          (cleanPath === '/projects' && (p.method === 'GET' || p.method === 'POST')) ||
          cleanPath === '/projects/owned' ||
          cleanPath === '/projects/joined' ||
          cleanPath.startsWith('/notifications') ||
          cleanPath.startsWith('/reports')
        )
      }),
    [ProjectMemberRole.CO_OWNER]: (perms: typeof updatedPermissionsInDb) =>
      perms.filter((p) => {
        const cleanPath = p.path.replace(/^\/api/, '')
        return (
          (cleanPath.startsWith('/projects') && p.method === 'GET') ||
          (cleanPath.startsWith('/project-members') && (p.method === 'GET' || p.method === 'POST' || p.method === 'PATCH')) ||
          cleanPath.startsWith('/sprints') ||
          cleanPath.startsWith('/tasks') ||
          cleanPath.startsWith('/board-columns') ||
          cleanPath.startsWith('/reports') ||
          cleanPath.startsWith('/notifications') ||
          cleanPath.startsWith('/project-chats')
        )
      }),
    [ProjectMemberRole.OWNER]: (perms: typeof updatedPermissionsInDb) =>
      perms.filter((p) => {
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
      }),
    [ProjectMemberRole.MEMBER]: (perms: typeof updatedPermissionsInDb) =>
      perms.filter((p) => {
        const cleanPath = p.path.replace(/^\/api/, '')
        return (
          ((cleanPath.startsWith('/projects') || cleanPath.startsWith('/project-members')) && p.method === 'GET') ||
          (cleanPath.startsWith('/sprints') && p.method === 'GET') ||
          (cleanPath.startsWith('/board-columns') && p.method === 'GET') ||
          (cleanPath.startsWith('/tasks') && p.method !== 'DELETE') ||
          cleanPath.startsWith('/reports') ||
          cleanPath.startsWith('/notifications') ||
          cleanPath.startsWith('/project-chats')
        )
      }),
    [ProjectMemberRole.VIEWER]: (perms: typeof updatedPermissionsInDb) =>
      perms.filter((p) => {
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
      })
  }

  for (const roleKey of Object.values(RoleName)) {
    const filterFn = rolePermissionFilter[roleKey]
    if (!filterFn) continue
    const roleRecord = await prisma.role.findFirst({ where: { name: roleKey, deletedAt: null } })
    if (roleRecord) {
      const allowed = filterFn(updatedPermissionsInDb)
      await prisma.role.update({
        where: { id: roleRecord.id },
        data: { permissions: { set: allowed.map((p) => ({ id: p.id })) } }
      })
    }
  }

  const allRoles = await prisma.role.findMany()
  const roleMap = allRoles.reduce(
    (acc, r) => {
      acc[r.name] = r.id
      return acc
    },
    {} as Record<string, string>
  )

  console.log(`✅ Configured ${updatedPermissionsInDb.length} Permissions across 6 Roles.`)

  // ==========================================
  // 4. CREATE USERS & ASSIGN SYSTEM ROLES
  // ==========================================
  console.log('\n👤 Step 4: Seeding Test Users & assigning System Roles...')
  const defaultPassword = 'sprintos@!'
  const hashedPassword = await hashingService.hash(defaultPassword)

  // System Admin User (System Role: ADMIN)
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@sprintos.com',
      password: hashedPassword,
      displayName: 'System Admin',
      status: UserStatus.ACTIVE,
      phoneNumber: '0901234567',
      address: 'Ho Chi Minh City, Vietnam',
      bio: 'Sprintos Platform Super Administrator',
      gender: Gender.MALE,
      roleId: roleMap[RoleName.Admin],
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
    }
  })

  // Test Users (System Role: USER)
  // Specifically including the 2 dedicated project owners: nguyenthuan05.work@gmail.com and sprintos.01062026@gmail.com
  const userSeedData = [
    {
      email: 'nguyenthuan05.work@gmail.com',
      name: 'Nguyen Thuan',
      bio: 'Product Owner & Fullstack Solution Architect',
      gender: Gender.MALE,
      phone: '0901234567',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
    },
    {
      email: 'sprintos.01062026@gmail.com',
      name: 'Sprintos Lead',
      bio: 'Agile Product Owner & Scrum Specialist',
      gender: Gender.MALE,
      phone: '0907654321',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150'
    },
    { email: 'alex.dev@sprintos.com', name: 'Alex Rivera', bio: 'Senior Fullstack Lead & Tech Evangelist', gender: Gender.MALE, phone: '0912345671', avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150' },
    { email: 'sarah.pm@sprintos.com', name: 'Sarah Chen', bio: 'Agile Product Manager & Scrum Master', gender: Gender.FEMALE, phone: '0912345672', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150' },
    { email: 'michael.tech@sprintos.com', name: 'Michael Vance', bio: 'Backend Architect & System Engineer', gender: Gender.MALE, phone: '0912345673', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150' },
    { email: 'emily.ux@sprintos.com', name: 'Emily Watson', bio: 'Lead Product Designer & UX Strategist', gender: Gender.FEMALE, phone: '0912345674', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150' },
    { email: 'david.qa@sprintos.com', name: 'David Miller', bio: 'QA Lead & Automation Specialist', gender: Gender.MALE, phone: '0912345675', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150' },
    { email: 'jessica.mkt@sprintos.com', name: 'Jessica Taylor', bio: 'Growth Marketing Manager', gender: Gender.FEMALE, phone: '0912345676', avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150' },
    { email: 'robert.devops@sprintos.com', name: 'Robert Johnson', bio: 'DevOps Lead & Cloud Security Engineer', gender: Gender.MALE, phone: '0912345677', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150' },
    { email: 'lisa.frontend@sprintos.com', name: 'Lisa Anderson', bio: 'React / Next.js Specialist', gender: Gender.FEMALE, phone: '0912345678', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150' },
    { email: 'james.backend@sprintos.com', name: 'James Wilson', bio: 'NestJS & PostgreSQL Developer', gender: Gender.MALE, phone: '0912345679', avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150' },
    { email: 'amanda.content@sprintos.com', name: 'Amanda Martinez', bio: 'Content Strategy & Technical Writer', gender: Gender.FEMALE, phone: '0912345680', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150' },
    { email: 'kevin.fullstack@sprintos.com', name: 'Kevin Thomas', bio: 'Software Engineer', gender: Gender.MALE, phone: '0912345681', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150' },
    { email: 'rachel.designer@sprintos.com', name: 'Rachel White', bio: 'UI & Graphic Designer', gender: Gender.FEMALE, phone: '0912345682', avatar: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=150' },
    { email: 'daniel.sec@sprintos.com', name: 'Daniel Lee', bio: 'Cybersecurity Analyst', gender: Gender.MALE, phone: '0912345683', avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150' },
    { email: 'olivia.intern@sprintos.com', name: 'Olivia Harris', bio: 'Junior Developer', gender: Gender.FEMALE, phone: '0912345684', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150' },
    { email: 'tom.qa@sprintos.com', name: 'Tom Jenkins', bio: 'QA Automation Engineer & Cypress / Playwright Specialist', gender: Gender.MALE, phone: '0912345685', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150' }
  ]

  const users: Array<Awaited<ReturnType<typeof prisma.user.create>>> = []
  for (const u of userSeedData) {
    const createdUser = await prisma.user.create({
      data: {
        email: u.email,
        password: hashedPassword,
        displayName: u.name,
        status: UserStatus.ACTIVE,
        phoneNumber: u.phone,
        address: 'District 1, Ho Chi Minh City',
        bio: u.bio,
        gender: u.gender,
        roleId: roleMap[RoleName.User],
        avatar: u.avatar,
        createdById: adminUser.id
      }
    })
    users.push(createdUser)
  }

  const allUsers = [adminUser, ...users]
  const userByEmail = (email: string) => {
    const found = allUsers.find((u) => u.email === email)
    if (!found) throw new Error(`User with email ${email} not found in seeded users.`)
    return found
  }

  console.log(`✅ Created 1 Admin User [System Role: ADMIN] & ${users.length} Standard Users [System Role: USER].`)

  // ==========================================
  // 5. CREATE PROJECTS & ASSIGN PROJECT ROLES
  // ==========================================
  console.log('\n📁 Step 5: Creating Workspaces & assigning Project Roles (OWNER, CO-OWNER, MEMBER, VIEWER)...')

  // NOTE: nguyenthuan05.work@gmail.com is OWNER of "Sprintos Mobile App"
  //       sprintos.01062026@gmail.com is OWNER of "E-Commerce Redesign"
  // NOTE: nguyenthuan05.work@gmail.com is OWNER of 3 Projects:
  //         1. "Sprintos Mobile App"
  //         2. "Sprintos AI Intelligence Core"
  //         3. "Sprintos Cloud Infrastructure"
  //       sprintos.01062026@gmail.com is OWNER of 3 Projects:
  //         1. "E-Commerce Redesign"
  //         2. "Fintech Payment Gateway & Wallet"
  //         3. "Realtime Logistics & Order Dispatch"
  //       Neither account is a member of the other's project (zero crossover).
  const projectsData = [
    // ----------------------------------------------------
    // OWNER 1: Nguyen Thuan (nguyenthuan05.work@gmail.com) - 3 Projects
    // ----------------------------------------------------
    {
      name: 'Sprintos Mobile App',
      description: 'Cross-platform iOS & Android mobile application built with React Native and NestJS API.',
      image: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=400',
      owner: userByEmail('nguyenthuan05.work@gmail.com'),
      ownerTechnicalRole: TechnicalRole.PRODUCT_OWNER,
      members: [
        { user: userByEmail('sarah.pm@sprintos.com'), role: RoleName.CoOwner, technicalRole: TechnicalRole.PRODUCT_OWNER, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('alex.dev@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.FULLSTACK, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('lisa.frontend@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.FRONTEND, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('james.backend@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.BACKEND, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('david.qa@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.QA_TEST, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('robert.devops@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.DEVOPS, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('olivia.intern@sprintos.com'), role: RoleName.Viewer, technicalRole: TechnicalRole.FRONTEND, status: ProjectMemberStatus.ACTIVE }
      ]
    },
    {
      name: 'Sprintos AI Intelligence Core',
      description: 'Autonomous Agent Harness, RAG pgvector embeddings, hybrid LLM orchestration & schedule advisor microservices.',
      image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400',
      owner: userByEmail('nguyenthuan05.work@gmail.com'),
      ownerTechnicalRole: TechnicalRole.BACKEND,
      members: [
        { user: userByEmail('sarah.pm@sprintos.com'), role: RoleName.CoOwner, technicalRole: TechnicalRole.PRODUCT_OWNER, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('james.backend@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.BACKEND, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('lisa.frontend@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.FRONTEND, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('alex.dev@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.FULLSTACK, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('david.qa@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.QA_TEST, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('robert.devops@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.DEVOPS, status: ProjectMemberStatus.ACTIVE }
      ]
    },
    {
      name: 'Sprintos Cloud Infrastructure',
      description: 'AWS EKS Kubernetes cluster orchestration, Terraform IaC, Redis sentinel, automated CI/CD & cloud security.',
      image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400',
      owner: userByEmail('nguyenthuan05.work@gmail.com'),
      ownerTechnicalRole: TechnicalRole.DEVOPS,
      members: [
        { user: userByEmail('robert.devops@sprintos.com'), role: RoleName.CoOwner, technicalRole: TechnicalRole.DEVOPS, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('james.backend@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.BACKEND, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('lisa.frontend@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.FRONTEND, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('david.qa@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.QA_TEST, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('alex.dev@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.FULLSTACK, status: ProjectMemberStatus.ACTIVE }
      ]
    },

    // ----------------------------------------------------
    // OWNER 2: Sprintos Lead (sprintos.01062026@gmail.com) - 3 Projects
    // ----------------------------------------------------
    {
      name: 'E-Commerce Redesign',
      description: 'High-performance storefront rebuild using Next.js 15, TailwindCSS, Microservices & Stripe checkout.',
      image: 'https://images.unsplash.com/photo-1556742049-0a675686001a?w=400',
      owner: userByEmail('sprintos.01062026@gmail.com'),
      ownerTechnicalRole: TechnicalRole.PRODUCT_OWNER,
      members: [
        { user: userByEmail('michael.tech@sprintos.com'), role: RoleName.CoOwner, technicalRole: TechnicalRole.BACKEND, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('kevin.fullstack@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.FULLSTACK, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('rachel.designer@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.FRONTEND, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('emily.ux@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.DESIGN, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('tom.qa@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.QA_TEST, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('daniel.sec@sprintos.com'), role: RoleName.Viewer, technicalRole: TechnicalRole.DEVOPS, status: ProjectMemberStatus.PENDING }
      ]
    },
    {
      name: 'Fintech Payment Gateway & Wallet',
      description: 'High-security banking API integration, e-wallet, payment idempotency, QR checkout & PCI-DSS compliance.',
      image: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=400',
      owner: userByEmail('sprintos.01062026@gmail.com'),
      ownerTechnicalRole: TechnicalRole.FULLSTACK,
      members: [
        { user: userByEmail('michael.tech@sprintos.com'), role: RoleName.CoOwner, technicalRole: TechnicalRole.BACKEND, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('daniel.sec@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.DEVOPS, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('kevin.fullstack@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.FULLSTACK, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('rachel.designer@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.FRONTEND, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('tom.qa@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.QA_TEST, status: ProjectMemberStatus.ACTIVE }
      ]
    },
    {
      name: 'Realtime Logistics & Order Dispatch',
      description: 'Live courier GPS tracking, Socket.io fleet communication, automated order dispatching & routing engine.',
      image: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=400',
      owner: userByEmail('sprintos.01062026@gmail.com'),
      ownerTechnicalRole: TechnicalRole.PRODUCT_OWNER,
      members: [
        { user: userByEmail('kevin.fullstack@sprintos.com'), role: RoleName.CoOwner, technicalRole: TechnicalRole.FULLSTACK, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('michael.tech@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.BACKEND, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('rachel.designer@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.FRONTEND, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('tom.qa@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.QA_TEST, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('emily.ux@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.DESIGN, status: ProjectMemberStatus.ACTIVE }
      ]
    },

    // ----------------------------------------------------
    // OTHER PROJECTS
    // ----------------------------------------------------
    {
      name: 'Sprintos Design System',
      description: 'Unified React component library, accessibility guidelines, Figma tokens & brand guidelines.',
      image: 'https://images.unsplash.com/photo-1581291518633-83b4ebd1d83e?w=400',
      owner: userByEmail('emily.ux@sprintos.com'),
      ownerTechnicalRole: TechnicalRole.DESIGN,
      members: [
        { user: userByEmail('rachel.designer@sprintos.com'), role: RoleName.CoOwner, technicalRole: TechnicalRole.FRONTEND, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('lisa.frontend@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.FRONTEND, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('sarah.pm@sprintos.com'), role: RoleName.Viewer, technicalRole: TechnicalRole.PRODUCT_OWNER, status: ProjectMemberStatus.ACTIVE }
      ]
    },
    {
      name: 'Q3 Growth Marketing',
      description: 'Integrated digital marketing, landing pages, SEO optimization & lead generation funnel.',
      image: 'https://images.unsplash.com/photo-1533750349088-cd871a92f312?w=400',
      owner: userByEmail('jessica.mkt@sprintos.com'),
      ownerTechnicalRole: TechnicalRole.OTHER,
      members: [
        { user: userByEmail('amanda.content@sprintos.com'), role: RoleName.CoOwner, technicalRole: TechnicalRole.OTHER, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('rachel.designer@sprintos.com'), role: RoleName.Member, technicalRole: TechnicalRole.FRONTEND, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('sarah.pm@sprintos.com'), role: RoleName.Viewer, technicalRole: TechnicalRole.PRODUCT_OWNER, status: ProjectMemberStatus.ACTIVE }
      ]
    }
  ]

  const createdProjects: Array<Awaited<ReturnType<typeof prisma.project.create>>> = []

  for (const p of projectsData) {
    const proj = await prisma.project.create({
      data: {
        name: p.name,
        description: p.description,
        image: p.image,
        ownerId: p.owner.id,
        createdById: p.owner.id,
        members: {
          create: [
            {
              memberId: p.owner.id,
              email: p.owner.email,
              roleId: roleMap[RoleName.Owner],
              technicalRole: p.ownerTechnicalRole || TechnicalRole.PRODUCT_OWNER,
              status: ProjectMemberStatus.ACTIVE,
              invitedById: p.owner.id,
              joinAt: new Date()
            },
            ...p.members.map((m) => ({
              memberId: m.user.id,
              email: m.user.email,
              roleId: roleMap[m.role],
              technicalRole: m.technicalRole,
              status: m.status,
              invitedById: p.owner.id,
              joinAt: m.status === ProjectMemberStatus.ACTIVE ? new Date() : null
            }))
          ]
        }
      }
    })
    createdProjects.push(proj)
  }

  console.log(`✅ Created ${createdProjects.length} Projects with explicit Technical Roles and Project RBAC Roles.`)

  // ==========================================
  // 6. SPRINTS, KANBAN BOARD & REALISTIC CPM/GANTT TASKS
  // ==========================================
  console.log('\n🏃 Step 6: Generating Sprints, Board Columns, Tasks, Dependencies, Comments & Chats...')
  const now = new Date()
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000)
  const daysFromNow = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000)
  const addDays = (base: Date, d: number) => new Date(base.getTime() + d * 24 * 60 * 60 * 1000)

  let totalTasksCount = 0
  let totalSprintsCount = 0

  for (const proj of createdProjects) {
    const commonSprint1Deps = [
      { predIndex: 0, succIndex: 1, type: DependencyType.FS, lag: 0 },
      { predIndex: 0, succIndex: 2, type: DependencyType.FS, lag: 0 },
      { predIndex: 1, succIndex: 3, type: DependencyType.FS, lag: 0 },
      { predIndex: 2, succIndex: 4, type: DependencyType.FS, lag: 0 },
      { predIndex: 3, succIndex: 4, type: DependencyType.FS, lag: 0 }
    ]

    const commonSprint2Deps = [
      { predIndex: 0, succIndex: 1, type: DependencyType.FS, lag: 0 },
      { predIndex: 0, succIndex: 2, type: DependencyType.FS, lag: 0 },
      { predIndex: 1, succIndex: 3, type: DependencyType.FS, lag: 0 },
      { predIndex: 1, succIndex: 5, type: DependencyType.FS, lag: 0 },
      { predIndex: 2, succIndex: 4, type: DependencyType.FS, lag: 0 },
      { predIndex: 4, succIndex: 5, type: DependencyType.FS, lag: 0 },
      { predIndex: 5, succIndex: 6, type: DependencyType.FS, lag: 0 }
    ]

    const commonSprint3Deps = [
      { predIndex: 0, succIndex: 1, type: DependencyType.FS, lag: 0 },
      { predIndex: 1, succIndex: 2, type: DependencyType.FS, lag: 0 },
      { predIndex: 2, succIndex: 3, type: DependencyType.FS, lag: 0 },
      { predIndex: 4, succIndex: 5, type: DependencyType.FS, lag: 0 },
      { predIndex: 5, succIndex: 6, type: DependencyType.FS, lag: 0 },
      { predIndex: 7, succIndex: 8, type: DependencyType.FS, lag: 0 },
      { predIndex: 8, succIndex: 9, type: DependencyType.FS, lag: 0 }
    ]

    const getSprintConfigsForProject = (name: string): any[] => {
      if (name === 'Sprintos Mobile App') {
        return [
          {
            name: `${name} - Sprint 1 (Foundation)`,
            goal: 'Setup mobile environment, build core database schemas, design tokens, and baseline API controller.',
            maxStoryPoint: 35,
            startDate: daysAgo(30),
            endDate: daysAgo(16),
            status: SprintStatus.COMPLETED,
            tasks: [
              { title: `[${name}] Setup React Native & NestJS Monorepo Environment`, desc: 'Configure ESLint, Prettier, Fastlane, Docker, and environment files.', col: 'Done', priority: TaskPriority.HIGH, sp: 3, duration: 3, offset: 0, labels: ['Setup', 'DevOps'] },
              { title: `[${name}] Database Schema & Prisma ORM Migrations`, desc: 'Model User, Workspace, Sprint and Task entities with PostgreSQL relations.', col: 'Done', priority: TaskPriority.CRITICAL, sp: 5, duration: 4, offset: 3, labels: ['Database', 'Backend'] },
              { title: `[${name}] Mobile UI Design Tokens & Theme System`, desc: 'Define typography, color palette, dark mode tokens and atom components in Figma.', col: 'Done', priority: TaskPriority.MEDIUM, sp: 5, duration: 4, offset: 3, labels: ['UI/UX', 'Figma'] },
              { title: `[${name}] Core Authentication & Session REST Controller`, desc: 'Build JWT auth controllers, refresh token rotation, and guard middlewares.', col: 'Done', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 7, labels: ['API', 'Backend'] },
              { title: `[${name}] Initial Mobile Smoke Test & Sprint 1 Milestone Review`, desc: 'Execute containerized build tests, Appium smoke verification, and sprint review.', col: 'Done', priority: TaskPriority.LOW, sp: 3, duration: 3, offset: 11, labels: ['QA', 'Testing'] }
            ],
            dependencies: commonSprint1Deps
          },
          {
            name: `${name} - Sprint 2 (Core Mobile Features)`,
            goal: 'Implement mobile biometric login, navigation shell, and prepare unassigned tasks for technical role auto-assignment.',
            maxStoryPoint: 40,
            startDate: daysAgo(5),
            endDate: daysFromNow(9),
            status: SprintStatus.ACTIVE,
            tasks: [
              { title: `[${name}] Biometric FaceID & Secure Keychain Storage`, desc: 'Implement biometric prompt, encrypted keychain credentials and fallback PIN.', col: 'Done', priority: TaskPriority.CRITICAL, sp: 5, duration: 3, offset: 0, labels: ['Auth', 'Security'] },
              { title: `[${name}] RESTful API Endpoints & Push Gateway Service`, desc: 'Build task CRUD endpoints, member lookup, and FCM push notification gateway.', col: 'In Review', priority: TaskPriority.HIGH, sp: 8, duration: 4, offset: 3, labels: ['API', 'Backend'] },
              { title: `[${name}] Navigation Tab Bar & Mobile Dashboard Screen`, desc: 'Build animated bottom tabs, project cards, and Zustand state synchronization.', col: 'In Progress', priority: TaskPriority.HIGH, sp: 8, duration: 5, offset: 3, labels: ['Frontend', 'UI/UX'] },
              { title: `[${name}] [BE] Offline Cache Synchronization & Conflict Resolution Engine`, desc: 'Implement SQLite local sync engine, change log replay and versioned merge resolution.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 3, offset: 7, labels: ['Backend', 'API', 'Sync'], unassigned: true },
              { title: `[${name}] [FE] Task Detail Modal & Interactive Swipe Gestures`, desc: 'Build modal sheet with draggable gestures, rich markdown task descriptions, and subtasks.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 8, labels: ['Frontend', 'UI/UX', 'Mobile'], unassigned: true },
              { title: `[${name}] [QA] Automated Mobile Smoke Test Suite with Appium & Jest`, desc: 'Write end-to-end integration tests for login, task status changes, and offline sync.', col: 'To Do', priority: TaskPriority.HIGH, sp: 3, duration: 3, offset: 8, labels: ['QA', 'Testing'], unassigned: true },
              { title: `[${name}] [DevOps] Fastlane iOS TestFlight & Android App Bundle CI/CD`, desc: 'Automate build artifact generation, code signing, and nightly staging distribution.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 12, labels: ['DevOps', 'CI/CD'], unassigned: true }
            ],
            dependencies: commonSprint2Deps
          },
          {
            name: `${name} - Product Backlog`,
            goal: 'Comprehensive Product Backlog pool ready for AI Backlog grooming, DAG scheduling and role assignment.',
            maxStoryPoint: 50,
            startDate: daysFromNow(10),
            endDate: daysFromNow(24),
            status: SprintStatus.PLANNED,
            tasks: [
              { title: `[${name}] [BE] Database Schema & Migration for In-App Purchase`, desc: 'Create Subscription, InAppReceipt, and Transaction tables in Prisma.', col: 'To Do', priority: TaskPriority.HIGH, sp: 3, duration: 2, offset: 0, labels: ['Database', 'Backend'], unassigned: true },
              { title: `[${name}] [BE] Stripe & Apple StoreKit Webhook Validation API`, desc: 'Build webhook listener, idempotency checks, and subscription renewal hooks.', col: 'To Do', priority: TaskPriority.CRITICAL, sp: 5, duration: 4, offset: 2, labels: ['API', 'Backend'], unassigned: true },
              { title: `[${name}] [FE] Subscription Upgrade Screen & Plan Comparison UI`, desc: 'Design pricing cards, features comparison list, and native checkout sheet trigger.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 6, labels: ['Frontend', 'UI/UX'], unassigned: true },
              { title: `[${name}] [QA] End-to-End Payment Flow QA & Receipt Simulation Tests`, desc: 'Validate sandbox purchases, receipt verification, and network retry edge cases.', col: 'To Do', priority: TaskPriority.HIGH, sp: 3, duration: 3, offset: 10, labels: ['QA', 'Testing'], unassigned: true },
              { title: `[${name}] [BE] Redis Distributed Caching for Frequent Mobile API Feeds`, desc: 'Setup Redis cluster caching with TTL invalidation on task mutations.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 3, offset: 0, labels: ['Backend', 'Performance'], unassigned: true },
              { title: `[${name}] [BE] Realtime Socket.io Gateway for Live Collaboration`, desc: 'Implement WebSocket rooms per project board and deliver instantaneous updates.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 1, labels: ['Backend', 'Socket'], unassigned: true },
              { title: `[${name}] [FE] Realtime Board Presence Indicators & Member Avatars`, desc: 'Render online co-workers viewing the same task card in real time.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 3, offset: 5, labels: ['Frontend', 'UI/UX'], unassigned: true },
              { title: `[${name}] [QA] Multi-Client WebSocket Stress Testing & Reconnect QA`, desc: 'Simulate flaky cellular connections and verify message delivery guarantees.', col: 'To Do', priority: TaskPriority.LOW, sp: 2, duration: 2, offset: 8, labels: ['QA', 'Testing'], unassigned: true },
              { title: `[${name}] [DevOps] Kubernetes Cluster Deployment Helm Charts`, desc: 'Package microservices into Helm charts with autoscaling and ingress configs.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 0, labels: ['DevOps', 'Cloud'], unassigned: true },
              { title: `[${name}] [DevOps] Automated GitHub Actions Security Vulnerability Audit`, desc: 'Run Trivy and npm audit in CI to catch CVE vulnerabilities in dependencies.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 3, offset: 4, labels: ['DevOps', 'Security'], unassigned: true },
              { title: `[${name}] [FE] Dark Mode Theme Support & Contrast Verification`, desc: 'Fine-tune dark theme palette for OLED screens and WCAG 2.1 contrast.', col: 'To Do', priority: TaskPriority.LOW, sp: 2, duration: 2, offset: 5, labels: ['Frontend', 'Design'], unassigned: true },
              { title: `[${name}] [FE] Multi-Language i18n Localization (Vietnamese & English)`, desc: 'Implement dynamic translation provider and language selection in settings.', col: 'To Do', priority: TaskPriority.LOW, sp: 3, duration: 2, offset: 8, labels: ['Frontend', 'Localization'], unassigned: true },
              { title: `[${name}] [BE] Server-Side PDF & Excel Sprint Report Generation`, desc: 'Build background worker generating formatted reports using PDFKit and ExcelJS.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 5, duration: 3, offset: 9, labels: ['Backend', 'Report'], unassigned: true },
              { title: `[${name}] [QA] Mobile App Startup Time Profiling & Memory Leak Audit`, desc: 'Profile JS bundle size, Hermes engine boot latency, and component unmount leaks.', col: 'To Do', priority: TaskPriority.LOW, sp: 2, duration: 2, offset: 11, labels: ['QA', 'Performance'], unassigned: true }
            ],
            dependencies: commonSprint3Deps
          }
        ]
      }

      if (name === 'Sprintos AI Intelligence Core') {
        return [
          {
            name: `${name} - Sprint 1 (Architecture & Vector Store)`,
            goal: 'Setup PostgreSQL pgvector extension, embedding pipeline, base ReAct loop, and AI design tokens.',
            maxStoryPoint: 35,
            startDate: daysAgo(30),
            endDate: daysAgo(16),
            status: SprintStatus.COMPLETED,
            tasks: [
              { title: `[${name}] pgvector Extension & Prisma Vector Field Migration`, desc: 'Configure pgvector extension in PostgreSQL and setup 1536-dim vector schema.', col: 'Done', priority: TaskPriority.HIGH, sp: 3, duration: 3, offset: 0, labels: ['Setup', 'Database'] },
              { title: `[${name}] Text Embedding Ingestion Pipeline & Model Bridges`, desc: 'Implement embedding service supporting OpenAI text-embedding-3-small and Ollama.', col: 'Done', priority: TaskPriority.CRITICAL, sp: 5, duration: 4, offset: 3, labels: ['Database', 'Backend', 'AI'] },
              { title: `[${name}] AI Assistant Design Language & Chat Wireframes`, desc: 'Design streaming cursor, thinking disclosure drawer, and tool call pill UI.', col: 'Done', priority: TaskPriority.MEDIUM, sp: 5, duration: 4, offset: 3, labels: ['UI/UX', 'Figma'] },
              { title: `[${name}] Document Chunking & Hybrid Semantic Search Engine`, desc: 'Create chunking strategy with cosine distance indexing for task RAG context.', col: 'Done', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 7, labels: ['API', 'Backend', 'RAG'] },
              { title: `[${name}] Vector Similarity Accuracy & Search Benchmark Suite`, desc: 'Verify retrieval recall and latency under 10,000 vector records in Postgres.', col: 'Done', priority: TaskPriority.LOW, sp: 3, duration: 3, offset: 11, labels: ['QA', 'Testing'] }
            ],
            dependencies: commonSprint1Deps
          },
          {
            name: `${name} - Sprint 2 (Agent Harness & Tool Registry)`,
            goal: 'Deliver autonomous ReAct agent loop, tool execution sandbox, and unassigned AI tasks for role testing.',
            maxStoryPoint: 40,
            startDate: daysAgo(5),
            endDate: daysFromNow(9),
            status: SprintStatus.ACTIVE,
            tasks: [
              { title: `[${name}] Autonomous ReAct Loop Architecture & Context Memory`, desc: 'Implement multi-turn reasoning loop, system prompts, and sliding window memory.', col: 'Done', priority: TaskPriority.CRITICAL, sp: 5, duration: 3, offset: 0, labels: ['Backend', 'AI'] },
              { title: `[${name}] pgvector Task Embeddings & Semantic Search Endpoint`, desc: 'Provide hybrid vector + full-text search API for project knowledge retrieval.', col: 'In Review', priority: TaskPriority.HIGH, sp: 8, duration: 4, offset: 3, labels: ['Backend', 'Database'] },
              { title: `[${name}] AI Streaming Chat Drawer & Thought Disclosure UI`, desc: 'Build responsive SSE streaming drawer with collapsible chain-of-thought accordion.', col: 'In Progress', priority: TaskPriority.HIGH, sp: 8, duration: 5, offset: 3, labels: ['Frontend', 'UI/UX'] },
              { title: `[${name}] [BE] Hybrid LLM Fallback Controller & Token Usage Tracker`, desc: 'Implement automatic failover from Local Ollama to OpenRouter cloud resilience.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 3, offset: 7, labels: ['Backend', 'AI', 'Architecture'], unassigned: true },
              { title: `[${name}] [FE] Markdown Renderer with Mermaid Diagrams & Syntax Highlighting`, desc: 'Render complex AI responses with dynamic Mermaid Gantt/AON diagrams and code blocks.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 8, labels: ['Frontend', 'UI/UX'], unassigned: true },
              { title: `[${name}] [QA] Benchmark AI Response Latency & Accuracy Evaluator`, desc: 'Automate test cases checking tool calling precision and hallucination prevention.', col: 'To Do', priority: TaskPriority.HIGH, sp: 3, duration: 3, offset: 8, labels: ['QA', 'Testing', 'Benchmark'], unassigned: true },
              { title: `[${name}] [DevOps] Ollama Local GPU Cluster & Cloudflare Tunnel Proxy`, desc: 'Setup high-throughput Ollama inference node with secure TLS Cloudflare tunnel.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 12, labels: ['DevOps', 'Infrastructure'], unassigned: true }
            ],
            dependencies: commonSprint2Deps
          },
          {
            name: `${name} - Product Backlog`,
            goal: 'Advanced AI intelligence features ready for DAG backlog scheduling and technical role delegation.',
            maxStoryPoint: 50,
            startDate: daysFromNow(10),
            endDate: daysFromNow(24),
            status: SprintStatus.PLANNED,
            tasks: [
              { title: `[${name}] [BE] Tool Registry Dynamic Schema Generator & Validator`, desc: 'Extract Zod schemas into JSON Schema for OpenAI function calling compatibility.', col: 'To Do', priority: TaskPriority.HIGH, sp: 3, duration: 2, offset: 0, labels: ['Backend', 'Architecture'], unassigned: true },
              { title: `[${name}] [BE] Smart Excel Project Importer with Auto-Mapping Heuristics`, desc: 'Parse diverse Excel formats, extract WBS, duration, and dependencies automatically.', col: 'To Do', priority: TaskPriority.CRITICAL, sp: 5, duration: 4, offset: 2, labels: ['Backend', 'Excel', 'AI'], unassigned: true },
              { title: `[${name}] [FE] Excel Import Wizard & Column Mapping Preview UI`, desc: 'Build multi-step modal with drag-drop Excel upload and interactive field mapper.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 6, labels: ['Frontend', 'UI/UX'], unassigned: true },
              { title: `[${name}] [QA] Excel File Upload Edge Cases & Format Fuzzing Tests`, desc: 'Test damaged sheets, merged cells, missing headers and formula cells.', col: 'To Do', priority: TaskPriority.HIGH, sp: 3, duration: 3, offset: 10, labels: ['QA', 'Testing'], unassigned: true },
              { title: `[${name}] [BE] Schedule Advisor & Critical Path Prediction Engine`, desc: 'Algorithmic early-warning engine identifying schedule risks and float compression.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 3, offset: 0, labels: ['Backend', 'Algorithm', 'CPM'], unassigned: true },
              { title: `[${name}] [FE] Critical Path Gantt Risk Overlay & Bottleneck Alerts`, desc: 'Highlight delayed path activities with pulsing red outlines on Gantt chart.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 3, labels: ['Frontend', 'Gantt', 'UI/UX'], unassigned: true },
              { title: `[${name}] [QA] Critical Path Algorithm Correctness & Cycle Detection QA`, desc: 'Verify topological sorting and Tarjan SCC cycle detection on complex DAGs.', col: 'To Do', priority: TaskPriority.HIGH, sp: 3, duration: 3, offset: 7, labels: ['QA', 'Algorithm'], unassigned: true },
              { title: `[${name}] [DevOps] Distributed Redis Pub/Sub for SSE Multi-Node Fanout`, desc: 'Configure Redis streams to broadcast streaming AI tokens across backend clusters.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 0, labels: ['DevOps', 'Redis'], unassigned: true },
              { title: `[${name}] [DevOps] OpenTelemetry Distributed Tracing & AI Latency Metrics`, desc: 'Export trace spans for LLM inference duration, database queries and tool runtimes.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 3, offset: 4, labels: ['DevOps', 'Monitoring'], unassigned: true },
              { title: `[${name}] [BE] Multi-Modal Vision Analysis Tool for Screenshot Diagnostics`, desc: 'Accept UI screenshot images and invoke vision models for automated UI bug diagnosis.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 3, offset: 5, labels: ['Backend', 'AI', 'Vision'], unassigned: true },
              { title: `[${name}] [FE] Drag-and-Drop Image Uploader for AI Screenshot Analysis`, desc: 'Allow pasting screenshots directly into AI chat prompt with instant thumbnail preview.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 8, labels: ['Frontend', 'UI/UX'], unassigned: true },
              { title: `[${name}] [QA] Vision Multimodal Tool Robustness & Resolution Tests`, desc: 'Validate oversized PNG/JPEG images up to 25MB without server memory exhaustion.', col: 'To Do', priority: TaskPriority.LOW, sp: 2, duration: 2, offset: 10, labels: ['QA', 'Testing'], unassigned: true },
              { title: `[${name}] [BE] Context Window Truncation & Token Pruning Heuristics`, desc: 'Intelligently prune old message history to respect 32k context token limits.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 8, labels: ['Backend', 'Performance'], unassigned: true },
              { title: `[${name}] [FE] Global Command Palette (Cmd+K) & Quick AI Prompts`, desc: 'Quick launcher for AI sprint planning and task assignment shortcuts.', col: 'To Do', priority: TaskPriority.LOW, sp: 2, duration: 2, offset: 10, labels: ['Frontend', 'Accessibility'], unassigned: true }
            ],
            dependencies: commonSprint3Deps
          }
        ]
      }

      if (name === 'Sprintos Cloud Infrastructure') {
        return [
          {
            name: `${name} - Sprint 1 (Cloud Foundation & VPC)`,
            goal: 'Setup Terraform AWS multi-AZ VPC, subnets, bastion host, and security groups.',
            maxStoryPoint: 35,
            startDate: daysAgo(30),
            endDate: daysAgo(16),
            status: SprintStatus.COMPLETED,
            tasks: [
              { title: `[${name}] Terraform AWS Multi-AZ VPC & Subnet Architecture`, desc: 'Write IaC modules for public/private subnets, internet gateways and route tables.', col: 'Done', priority: TaskPriority.HIGH, sp: 3, duration: 3, offset: 0, labels: ['Setup', 'DevOps'] },
              { title: `[${name}] Bastion Host & Security Groups Configuration`, desc: 'Deploy SSH bastion with keypair authentication and strict ingress security rules.', col: 'Done', priority: TaskPriority.CRITICAL, sp: 5, duration: 4, offset: 3, labels: ['Security', 'DevOps'] },
              { title: `[${name}] Cloud Architecture Diagram & Infrastructure Specification`, desc: 'Document VPC CIDR blocks, peering links, and high-availability design.', col: 'Done', priority: TaskPriority.MEDIUM, sp: 5, duration: 4, offset: 3, labels: ['Documentation', 'Architecture'] },
              { title: `[${name}] NAT Gateway & Route 53 Private Hosted Zone Setup`, desc: 'Configure outbound internet access for private subnets and internal service DNS.', col: 'Done', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 7, labels: ['Cloud', 'DevOps'] },
              { title: `[${name}] Network Connectivity & Latency Verification Tests`, desc: 'Verify inter-subnet reachability and benchmark NAT gateway throughput.', col: 'Done', priority: TaskPriority.LOW, sp: 3, duration: 3, offset: 11, labels: ['QA', 'Testing'] }
            ],
            dependencies: commonSprint1Deps
          },
          {
            name: `${name} - Sprint 2 (EKS Kubernetes & GitOps Orchestration)`,
            goal: 'Provision production Kubernetes cluster with ArgoCD GitOps, monitoring dashboards and unassigned tasks.',
            maxStoryPoint: 40,
            startDate: daysAgo(5),
            endDate: daysFromNow(9),
            status: SprintStatus.ACTIVE,
            tasks: [
              { title: `[${name}] Multi-AZ AWS VPC & Private Bastion Host Verification`, desc: 'Verify VPC peering, IAM roles, and SSH bastion host access control.', col: 'Done', priority: TaskPriority.HIGH, sp: 5, duration: 3, offset: 0, labels: ['DevOps', 'Cloud'] },
              { title: `[${name}] EKS Cluster Provisioning with ArgoCD GitOps Sync`, desc: 'Setup managed node groups, Cluster Autoscaler, and ArgoCD application sync.', col: 'In Review', priority: TaskPriority.HIGH, sp: 8, duration: 4, offset: 3, labels: ['DevOps', 'Kubernetes'] },
              { title: `[${name}] Cloud Monitoring Dashboard & Grafana Embeds`, desc: 'Build frontend monitoring portal displaying CPU, Memory, and Pod restart rates.', col: 'In Progress', priority: TaskPriority.HIGH, sp: 8, duration: 5, offset: 3, labels: ['Frontend', 'UI/UX'] },
              { title: `[${name}] [BE] Telemetry Ingestion Microservice & Prometheus Exporter`, desc: 'Collect application health metrics and expose OpenMetrics endpoints for scraping.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 3, offset: 7, labels: ['Backend', 'Metrics', 'API'], unassigned: true },
              { title: `[${name}] [FE] Cluster Health Visualizer & Pod Log Streamer`, desc: 'Develop live streaming terminal component for container stdout logs using WebSockets.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 8, labels: ['Frontend', 'UI/UX'], unassigned: true },
              { title: `[${name}] [QA] Chaos Engineering & Node Failure Recovery Test`, desc: 'Execute Chaos Mesh experiments simulating worker node termination and verify zero-downtime.', col: 'To Do', priority: TaskPriority.HIGH, sp: 3, duration: 3, offset: 8, labels: ['QA', 'Testing', 'Resilience'], unassigned: true },
              { title: `[${name}] [DevOps] HashiCorp Vault Secrets Management & Cert-Manager SSL`, desc: 'Setup Vault agent injector for secrets injection and automated Let Encrypt TLS renewal.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 12, labels: ['DevOps', 'Security'], unassigned: true }
            ],
            dependencies: commonSprint2Deps
          },
          {
            name: `${name} - Product Backlog`,
            goal: 'Cloud scaling and automation backlog ready for AI load balancing and schedule optimization.',
            maxStoryPoint: 50,
            startDate: daysFromNow(10),
            endDate: daysFromNow(24),
            status: SprintStatus.PLANNED,
            tasks: [
              { title: `[${name}] [BE] Kubernetes Custom Resource Definition (CRD) Controller`, desc: 'Build Go/NestJS operator to automate dynamic staging environment lifecycles.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 3, offset: 0, labels: ['Backend', 'Kubernetes'], unassigned: true },
              { title: `[${name}] [BE] Dynamic Resource Quotas & Multi-Tenant Namespace API`, desc: 'API endpoints to assign CPU/RAM limits per developer team workspace.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 2, labels: ['Backend', 'Cloud'], unassigned: true },
              { title: `[${name}] [FE] Multi-Tenant Resource Consumption & Quota Viewer`, desc: 'Interactive bar charts showing namespace usage vs allocated ceiling.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 6, labels: ['Frontend', 'UI/UX'], unassigned: true },
              { title: `[${name}] [QA] Multi-Tenant Resource Isolation & Quota Boundary QA`, desc: 'Run stress tests attempting memory leaks across namespace boundaries.', col: 'To Do', priority: TaskPriority.HIGH, sp: 3, duration: 3, offset: 10, labels: ['QA', 'Testing'], unassigned: true },
              { title: `[${name}] [DevOps] Automated Ingress Controller & AWS ALB Integration`, desc: 'Configure AWS Load Balancer Controller with automated SSL target group registration.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 0, labels: ['DevOps', 'Security'], unassigned: true },
              { title: `[${name}] [DevOps] Redis Sentinel High Availability & Failover Automation`, desc: 'Deploy 3-node Redis sentinel cluster with automatic master failover.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 2, labels: ['DevOps', 'Database'], unassigned: true },
              { title: `[${name}] [BE] Automated Database Backup & S3 Cold Storage Archive Cron`, desc: 'Scheduled cron taking pg_dump snapshots, gzip compression, and S3 Glacier upload.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 5, labels: ['Backend', 'Database'], unassigned: true },
              { title: `[${name}] [QA] Disaster Recovery & Database Restoration Drill QA`, desc: 'Execute live drill restoring database from S3 snapshot within 15-minute RTO target.', col: 'To Do', priority: TaskPriority.HIGH, sp: 3, duration: 3, offset: 7, labels: ['QA', 'Resilience'], unassigned: true },
              { title: `[${name}] [DevOps] CloudWatch Metric Alarms & PagerDuty Integration`, desc: 'Configure high-severity alerts for 5xx error spikes, node disk pressure, and CPU throttling.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 4, labels: ['DevOps', 'Monitoring'], unassigned: true },
              { title: `[${name}] [DevOps] Terraform Drift Detection & Scheduled Audit Plan`, desc: 'Run scheduled CI checks comparing state files against live cloud infrastructure.', col: 'To Do', priority: TaskPriority.LOW, sp: 3, duration: 2, offset: 6, labels: ['DevOps', 'Terraform'], unassigned: true },
              { title: `[${name}] [FE] Web-based Terminal Emulator for Pod Exec Access`, desc: 'Secure web terminal with xterm.js connecting to authorized Kubernetes pods.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 3, offset: 8, labels: ['Frontend', 'UI/UX'], unassigned: true },
              { title: `[${name}] [QA] Web Terminal Security & Command Sanitization QA`, desc: 'Audit terminal session timeouts, RBAC enforcement, and command injection safeguards.', col: 'To Do', priority: TaskPriority.LOW, sp: 2, duration: 2, offset: 11, labels: ['QA', 'Security'], unassigned: true },
              { title: `[${name}] [BE] Cloud Cost Allocation & FinOps Tagging Analyzer`, desc: 'Aggregate AWS Cost Explorer API metrics by project tags to identify wastage.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 8, labels: ['Backend', 'FinOps'], unassigned: true },
              { title: `[${name}] [FE] Cloud Spend Breakdown Chart & Cost Anomaly Alerts`, desc: 'Visual breakdown of monthly compute, database, and egress network bandwidth expenses.', col: 'To Do', priority: TaskPriority.LOW, sp: 2, duration: 2, offset: 10, labels: ['Frontend', 'Analytics'], unassigned: true }
            ],
            dependencies: commonSprint3Deps
          }
        ]
      }

      if (name === 'E-Commerce Redesign') {
        return [
          {
            name: `${name} - Sprint 1 (Storefront Foundation)`,
            goal: 'Setup Next.js 15 storefront, Prisma catalog schema, Tailwind components, and search API.',
            maxStoryPoint: 35,
            startDate: daysAgo(28),
            endDate: daysAgo(14),
            status: SprintStatus.COMPLETED,
            tasks: [
              { title: `[${name}] Storefront Infrastructure & Monorepo Setup`, desc: 'Setup Next.js 15 Turbopack, TailwindCSS v4, ESLint, and Docker Compose stack.', col: 'Done', priority: TaskPriority.HIGH, sp: 3, duration: 3, offset: 0, labels: ['Setup', 'DevOps'] },
              { title: `[${name}] Product Catalog & Category Prisma Schema`, desc: 'Model Products, Categories, Variants, Inventory and Images in PostgreSQL.', col: 'Done', priority: TaskPriority.CRITICAL, sp: 5, duration: 4, offset: 3, labels: ['Database', 'Backend'] },
              { title: `[${name}] Storefront Design System & Product Card Components`, desc: 'Design and build reusable ProductCard, PriceTag, Badge, and ImageGallery UI.', col: 'Done', priority: TaskPriority.MEDIUM, sp: 5, duration: 4, offset: 3, labels: ['UI/UX', 'Frontend'] },
              { title: `[${name}] Product Catalog Search & Filtering REST API`, desc: 'Implement pagination, faceted search, category filtering and sorting endpoints.', col: 'Done', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 7, labels: ['API', 'Backend'] },
              { title: `[${name}] Catalog Smoke Testing & Milestone Verification`, desc: 'Verify product catalog rendering, response times, and initial integration tests.', col: 'Done', priority: TaskPriority.LOW, sp: 3, duration: 3, offset: 11, labels: ['QA', 'Testing'] }
            ],
            dependencies: commonSprint1Deps
          },
          {
            name: `${name} - Sprint 2 (Shopping Cart & Auth)`,
            goal: 'Implement customer authentication, persistent shopping cart, and unassigned checkout tasks.',
            maxStoryPoint: 40,
            startDate: daysAgo(6),
            endDate: daysFromNow(8),
            status: SprintStatus.ACTIVE,
            tasks: [
              { title: `[${name}] Customer Auth Module & Social OAuth Login`, desc: 'Implement Google and GitHub OAuth, session management and customer profile API.', col: 'Done', priority: TaskPriority.CRITICAL, sp: 5, duration: 3, offset: 0, labels: ['Auth', 'Security'] },
              { title: `[${name}] Persistent Shopping Cart Backend & Sync Engine`, desc: 'Build Redis-backed cart sync for guest-to-authenticated customer cart migration.', col: 'In Review', priority: TaskPriority.HIGH, sp: 8, duration: 4, offset: 3, labels: ['Backend', 'API'] },
              { title: `[${name}] Shopping Cart Drawer & Checkout Summary UI`, desc: 'Develop animated slide-over cart drawer with quantity steppers and promo code input.', col: 'In Progress', priority: TaskPriority.HIGH, sp: 8, duration: 5, offset: 3, labels: ['Frontend', 'UI/UX'] },
              { title: `[${name}] [BE] Inventory Reservation & Concurrency Lock System`, desc: 'Implement distributed locking with Redis Redlock to prevent over-selling limited items.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 3, offset: 7, labels: ['Backend', 'Database', 'Redis'], unassigned: true },
              { title: `[${name}] [FE] Animated Promo Code Bar & Discount Calculator Widget`, desc: 'Build responsive coupon application UI with animated savings badge and error toasts.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 8, labels: ['Frontend', 'UI/UX'], unassigned: true },
              { title: `[${name}] [QA] Cart Checkout Flow Automated QA & Regression Suite`, desc: 'Run Playwright E2E cart tests, coupon validation checks and payment calculations.', col: 'To Do', priority: TaskPriority.HIGH, sp: 3, duration: 3, offset: 8, labels: ['QA', 'Testing', 'Playwright'], unassigned: true },
              { title: `[${name}] [DevOps] Staging Release Verification & Load Readiness`, desc: 'Deploy cart service to staging Kubernetes, verify ingress latency and monitoring.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 12, labels: ['DevOps', 'Release'], unassigned: true }
            ],
            dependencies: commonSprint2Deps
          },
          {
            name: `${name} - Product Backlog`,
            goal: 'Storefront Backlog pool ready for AI Backlog grooming, DAG planning and workload balancing.',
            maxStoryPoint: 50,
            startDate: daysFromNow(9),
            endDate: daysFromNow(23),
            status: SprintStatus.PLANNED,
            tasks: [
              { title: `[${name}] [BE] Stripe Checkout & Webhook Handling Architecture`, desc: 'Build secure Stripe checkout session, webhook handler for payment success, and receipts.', col: 'To Do', priority: TaskPriority.CRITICAL, sp: 5, duration: 4, offset: 0, labels: ['API', 'Backend'], unassigned: true },
              { title: `[${name}] [FE] One-Page Checkout Step-by-Step UI Flow`, desc: 'Build seamless multi-step checkout form with shipping address, billing, and order review.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 4, labels: ['Frontend', 'UI/UX'], unassigned: true },
              { title: `[${name}] [BE] Order Management System (OMS) & Invoice PDF Generation`, desc: 'Build Order state machine (Pending, Paid, Shipped, Delivered) and PDF receipt generator.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 4, labels: ['Backend', 'API'], unassigned: true },
              { title: `[${name}] [QA] Automated Checkout & Webhook Simulation QA Tests`, desc: 'Implement full simulated purchase journey with mock Stripe webhooks and invoice checks.', col: 'To Do', priority: TaskPriority.HIGH, sp: 3, duration: 3, offset: 8, labels: ['QA', 'Testing'], unassigned: true },
              { title: `[${name}] [BE] Customer Product Reviews & Rating System API`, desc: 'Implement verified buyer reviews, photo attachments, and average rating aggregation.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 3, offset: 0, labels: ['Backend', 'API'], unassigned: true },
              { title: `[${name}] [FE] Customer Product Reviews & Star Rating UI Widget`, desc: 'Design rating breakdown widget, review submission modal with star rating picker.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 3, offset: 3, labels: ['Frontend', 'UI/UX'], unassigned: true },
              { title: `[${name}] [FE] Wishlist Feature & Price Drop Alert Notifications`, desc: 'Create customer wishlist toggle and automated email alerts when item price drops.', col: 'To Do', priority: TaskPriority.LOW, sp: 3, duration: 2, offset: 2, labels: ['Frontend', 'Notification'], unassigned: true },
              { title: `[${name}] [BE] Promo Code Engine & Tiered Discount Rules`, desc: 'Build coupon validation engine supporting percentage, fixed discount, and free shipping.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 3, offset: 5, labels: ['Backend', 'Promotion'], unassigned: true },
              { title: `[${name}] [QA] Automated Black Friday Load & Stress Testing`, desc: 'Simulate 10,000 concurrent checkout sessions with k6 and optimize Redis throughput.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 3, offset: 7, labels: ['QA', 'Performance'], unassigned: true },
              { title: `[${name}] [DevOps] AWS CloudFront CDN Edge Caching & Asset Invalidation`, desc: 'Configure CloudFront distribution for image assets, WebP compression, and edge caching.', col: 'To Do', priority: TaskPriority.HIGH, sp: 3, duration: 3, offset: 6, labels: ['DevOps', 'Cloud'], unassigned: true },
              { title: `[${name}] [FE] SEO OpenGraph & Schema.org Rich Product Snippets`, desc: 'Implement JSON-LD structured data for Google Shopping rich search results.', col: 'To Do', priority: TaskPriority.LOW, sp: 2, duration: 2, offset: 8, labels: ['Frontend', 'SEO'], unassigned: true },
              { title: `[${name}] [FE] Realtime Live Chat Support Widget for Shoppers`, desc: 'Embed customer support chat drawer with automated FAQ replies and live agent bridge.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 9, labels: ['Frontend', 'Chat'], unassigned: true },
              { title: `[${name}] [BE] Abandoned Cart Recovery Email Automation Worker`, desc: 'Background cron identifying carts inactive for 2 hours and queuing reminder emails.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 9, labels: ['Backend', 'Worker'], unassigned: true },
              { title: `[${name}] [DevOps] Multi-Region Read Replica Database Setup`, desc: 'Configure PostgreSQL read replica for storefront catalog queries and failover.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 3, offset: 11, labels: ['DevOps', 'Database'], unassigned: true }
            ],
            dependencies: commonSprint3Deps
          }
        ]
      }

      if (name === 'Fintech Payment Gateway & Wallet') {
        return [
          {
            name: `${name} - Sprint 1 (Compliance & Security Foundation)`,
            goal: 'Establish PCI-DSS encryption baseline, double-entry ledger database schema, and HMAC signing.',
            maxStoryPoint: 35,
            startDate: daysAgo(30),
            endDate: daysAgo(16),
            status: SprintStatus.COMPLETED,
            tasks: [
              { title: `[${name}] PCI-DSS Security Baseline & Tokenization Schema`, desc: 'Design card tokenization tables and AES-256 field encryption keys in Postgres.', col: 'Done', priority: TaskPriority.HIGH, sp: 3, duration: 3, offset: 0, labels: ['Setup', 'Security'] },
              { title: `[${name}] Bank Account & Double-Entry Ledger Database Architecture`, desc: 'Model Accounts, LedgerEntries, Transfers, and Balance snapshots with strict constraints.', col: 'Done', priority: TaskPriority.CRITICAL, sp: 5, duration: 4, offset: 3, labels: ['Database', 'Backend'] },
              { title: `[${name}] Financial Dashboard Wireframes & Transaction Flow UI`, desc: 'Create wallet layout, transfer flows, and security verification modals in Figma.', col: 'Done', priority: TaskPriority.MEDIUM, sp: 5, duration: 4, offset: 3, labels: ['UI/UX', 'Figma'] },
              { title: `[${name}] HMAC-SHA256 Request Signing & Key Rotation API`, desc: 'Implement API signature verification middleware and secret key rotation scheduler.', col: 'Done', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 7, labels: ['API', 'Security'] },
              { title: `[${name}] Compliance Smoke Test & Encryption Verification`, desc: 'Verify encryption at rest, secure transit, and OWASP API security top 10 compliance.', col: 'Done', priority: TaskPriority.LOW, sp: 3, duration: 3, offset: 11, labels: ['QA', 'Security'] }
            ],
            dependencies: commonSprint1Deps
          },
          {
            name: `${name} - Sprint 2 (Wallet & Payment Orchestrator)`,
            goal: 'Deploy banking webhook listeners, wallet balance UI, and unassigned QR payment tasks for role testing.',
            maxStoryPoint: 40,
            startDate: daysAgo(5),
            endDate: daysFromNow(9),
            status: SprintStatus.ACTIVE,
            tasks: [
              { title: `[${name}] PCI-DSS Data Encryption & Audit Logging Ledger`, desc: 'Implement immutable audit log entries for all financial operations and admin actions.', col: 'Done', priority: TaskPriority.CRITICAL, sp: 5, duration: 3, offset: 0, labels: ['Backend', 'Security'] },
              { title: `[${name}] Banking Webhook Listener & Idempotency Key Filter`, desc: 'Build idempotent webhook processor using Redis keys to prevent duplicate transaction credits.', col: 'In Review', priority: TaskPriority.HIGH, sp: 8, duration: 4, offset: 3, labels: ['Backend', 'API'] },
              { title: `[${name}] Digital Wallet Balance & Transaction History View`, desc: 'Develop responsive wallet card, balance visibility toggles, and infinite scroll ledger.', col: 'In Progress', priority: TaskPriority.HIGH, sp: 8, duration: 5, offset: 3, labels: ['Frontend', 'UI/UX'] },
              { title: `[${name}] [BE] Dynamic VietQR Generator & Realtime IPN Handler`, desc: 'Generate standardized EMVCo QR codes with dynamic transaction amounts and bank routing.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 3, offset: 7, labels: ['Backend', 'Fintech', 'API'], unassigned: true },
              { title: `[${name}] [FE] Biometric Confirmation Dialog & PIN Code Keypad`, desc: 'Build numeric keypad component with scrambled digits for secure transaction authorization.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 8, labels: ['Frontend', 'UI/UX', 'Security'], unassigned: true },
              { title: `[${name}] [QA] Automated Payment Idempotency & Concurrency Double-Spend QA`, desc: 'Execute race condition test suites attempting 10 concurrent withdrawals on 1 account.', col: 'To Do', priority: TaskPriority.HIGH, sp: 3, duration: 3, offset: 8, labels: ['QA', 'Testing', 'Security'], unassigned: true },
              { title: `[${name}] [DevOps] Kubernetes Network Policy & WAF DDoS Mitigation Rules`, desc: 'Isolate banking pods with strict egress rules and configure Cloudflare WAF rate limits.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 12, labels: ['DevOps', 'Security'], unassigned: true }
            ],
            dependencies: commonSprint2Deps
          },
          {
            name: `${name} - Product Backlog`,
            goal: 'Fintech payment scaling backlog ready for algorithmic scheduling and role assignment.',
            maxStoryPoint: 50,
            startDate: daysFromNow(10),
            endDate: daysFromNow(24),
            status: SprintStatus.PLANNED,
            tasks: [
              { title: `[${name}] [BE] Microservices Inter-Service Mutual TLS (mTLS)`, desc: 'Configure mTLS between wallet service and transaction ledger using Istio service mesh.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 3, offset: 0, labels: ['Backend', 'Security'], unassigned: true },
              { title: `[${name}] [BE] Automated Settlement & Reconciliation Batch Worker`, desc: 'Nightly BullMQ batch worker reconciling bank statements against internal transactions.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 2, labels: ['Backend', 'Worker'], unassigned: true },
              { title: `[${name}] [FE] Settlement Discrepancy Dashboard & Audit Log Explorer`, desc: 'Financial operator UI highlighting un-reconciled items with one-click adjustments.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 6, labels: ['Frontend', 'UI/UX'], unassigned: true },
              { title: `[${name}] [QA] Reconciliation Ledger Mathematical Proof & Rounding QA`, desc: 'Validate sub-cent rounding calculations and multi-currency foreign exchange rates.', col: 'To Do', priority: TaskPriority.HIGH, sp: 3, duration: 3, offset: 10, labels: ['QA', 'Testing'], unassigned: true },
              { title: `[${name}] [BE] Risk Engine & Fraud Velocity Check Microservice`, desc: 'Evaluate velocity heuristics: flag accounts exceeding 5 transactions in 60 seconds.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 0, labels: ['Backend', 'Fintech'], unassigned: true },
              { title: `[${name}] [FE] Fraud Alert Flagging & Suspicious Transaction Modal`, desc: 'Realtime compliance alert banner with quick freeze card and lock account triggers.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 4, labels: ['Frontend', 'UI/UX'], unassigned: true },
              { title: `[${name}] [QA] Simulated Fraudulent Attack Vectors & Rate Limit Tests`, desc: 'Run automated pen-testing attacks simulating card credential stuffing and replay attacks.', col: 'To Do', priority: TaskPriority.HIGH, sp: 3, duration: 3, offset: 6, labels: ['QA', 'Security'], unassigned: true },
              { title: `[${name}] [DevOps] Automated Secret Zero Rotation via AWS Secrets Manager`, desc: 'Integrate automatic 30-day rotation for database master passwords and JWT signing keys.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 3, labels: ['DevOps', 'Security'], unassigned: true },
              { title: `[${name}] [DevOps] High-Availability Redis Cluster for Transaction Locks`, desc: 'Deploy 6-node Redis cluster with Redlock support across 3 AWS Availability Zones.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 3, offset: 5, labels: ['DevOps', 'Redis'], unassigned: true },
              { title: `[${name}] [FE] CSV & Excel Transaction Statement Export Interface`, desc: 'Custom date range picker with instant download of verified financial transaction statements.', col: 'To Do', priority: TaskPriority.LOW, sp: 2, duration: 2, offset: 7, labels: ['Frontend', 'Export'], unassigned: true },
              { title: `[${name}] [BE] Statement Generation Service with Digital Watermarking`, desc: 'Generate encrypted PDF bank statements with SHA-256 validation seal.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 8, labels: ['Backend', 'Report'], unassigned: true },
              { title: `[${name}] [QA] Statement Number Precision & Tax Calculation QA`, desc: 'Audit VAT calculation accuracy and PDF layout integrity across Adobe and browser viewers.', col: 'To Do', priority: TaskPriority.LOW, sp: 2, duration: 2, offset: 10, labels: ['QA', 'Finance'], unassigned: true },
              { title: `[${name}] [BE] Multi-Currency Exchange Rate Sync & Spread Calculator`, desc: 'Fetch ECB realtime foreign currency feeds and apply dynamic spread margins.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 8, labels: ['Backend', 'Finance'], unassigned: true },
              { title: `[${name}] [FE] Currency Converter Widget with Realtime Market Ticker`, desc: 'Interactive live currency converter with animated exchange rate fluctuation charts.', col: 'To Do', priority: TaskPriority.LOW, sp: 2, duration: 2, offset: 10, labels: ['Frontend', 'UI/UX'], unassigned: true }
            ],
            dependencies: commonSprint3Deps
          }
        ]
      }

      if (name === 'Realtime Logistics & Order Dispatch') {
        return [
          {
            name: `${name} - Sprint 1 (Map & Routing Baseline)`,
            goal: 'Setup geolocation database models, Redis geospatial indexes, courier fleet schema, and map tokens.',
            maxStoryPoint: 35,
            startDate: daysAgo(30),
            endDate: daysAgo(16),
            status: SprintStatus.COMPLETED,
            tasks: [
              { title: `[${name}] Geolocation Schema & Redis Geospatial Setup`, desc: 'Configure Redis GEOADD/GEORADIUS commands for courier tracking and PostgreSQL coordinates.', col: 'Done', priority: TaskPriority.HIGH, sp: 3, duration: 3, offset: 0, labels: ['Setup', 'DevOps'] },
              { title: `[${name}] Courier Fleet Database Models & Shift Management`, desc: 'Model Courier, Vehicle, Shift, Order, and DeliveryRoute relations with Prisma.', col: 'Done', priority: TaskPriority.CRITICAL, sp: 5, duration: 4, offset: 3, labels: ['Database', 'Backend'] },
              { title: `[${name}] Dispatch Dashboard Wireframes & Map Pin Design Tokens`, desc: 'Design interactive courier pins, delivery radius polygons, and route line colors in Figma.', col: 'Done', priority: TaskPriority.MEDIUM, sp: 5, duration: 4, offset: 3, labels: ['UI/UX', 'Figma'] },
              { title: `[${name}] Courier WebSocket Connection & Heartbeat Gateway`, desc: 'Implement WebSocket gateway receiving 5-second GPS updates with disconnect recovery.', col: 'Done', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 7, labels: ['API', 'Socket'] },
              { title: `[${name}] Map Coordinates Accuracy & GPS Drift Smoke Test`, desc: 'Verify Haversine formula distance calculations and eliminate GPS jitter.', col: 'Done', priority: TaskPriority.LOW, sp: 3, duration: 3, offset: 11, labels: ['QA', 'Testing'] }
            ],
            dependencies: commonSprint1Deps
          },
          {
            name: `${name} - Sprint 2 (Live Dispatching Engine)`,
            goal: 'Implement automated dispatching, moving courier map view, and unassigned routing tasks for role assignment.',
            maxStoryPoint: 40,
            startDate: daysAgo(5),
            endDate: daysFromNow(9),
            status: SprintStatus.ACTIVE,
            tasks: [
              { title: `[${name}] Courier Location Ingestion via Redis Geospatial`, desc: 'Ingest 500+ courier locations/sec and update spatial indexes with low memory footprint.', col: 'Done', priority: TaskPriority.CRITICAL, sp: 5, duration: 3, offset: 0, labels: ['Backend', 'Redis'] },
              { title: `[${name}] Automated Order Dispatching Algorithm & Batching`, desc: 'Algorithm matching pending orders to closest active couriers within 3km radius.', col: 'In Review', priority: TaskPriority.HIGH, sp: 8, duration: 4, offset: 3, labels: ['Backend', 'Algorithm'] },
              { title: `[${name}] Live Map View with Moving Courier Markers`, desc: 'Build Mapbox GL canvas with smooth interpolation of courier vehicle movement.', col: 'In Progress', priority: TaskPriority.HIGH, sp: 8, duration: 5, offset: 3, labels: ['Frontend', 'UI/UX', 'Map'] },
              { title: `[${name}] [BE] ETA Prediction & Realtime Traffic Matrix Service`, desc: 'Integrate traffic API to compute dynamic delivery arrival estimates with weather factors.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 3, offset: 7, labels: ['Backend', 'Algorithm', 'API'], unassigned: true },
              { title: `[${name}] [FE] Driver Order Acceptance Modal & Sound Alert System`, desc: 'Build mobile web driver modal with 30-second countdown timer and audio chime notification.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 8, labels: ['Frontend', 'UI/UX'], unassigned: true },
              { title: `[${name}] [QA] GPS Route Simulation QA & Disconnect Reconnect Tests`, desc: 'Simulate simulated vehicle moving through tunnel with temporary 60-second connection loss.', col: 'To Do', priority: TaskPriority.HIGH, sp: 3, duration: 3, offset: 8, labels: ['QA', 'Testing', 'Socket'], unassigned: true },
              { title: `[${name}] [DevOps] Socket.io Redis Adapter Cluster & Horizontal Scaling`, desc: 'Setup Redis adapter allowing WebSockets to scale across 4 load-balanced backend containers.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 12, labels: ['DevOps', 'Scaling'], unassigned: true }
            ],
            dependencies: commonSprint2Deps
          },
          {
            name: `${name} - Product Backlog`,
            goal: 'Advanced routing algorithms and fleet operations pool ready for AI auto-planning.',
            maxStoryPoint: 50,
            startDate: daysFromNow(10),
            endDate: daysFromNow(24),
            status: SprintStatus.PLANNED,
            tasks: [
              { title: `[${name}] [BE] Multi-Stop Route Optimization using Dijkstra / TSP`, desc: 'Calculate optimal delivery drop-off sequence minimizing total fuel and travel distance.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 0, labels: ['Backend', 'Algorithm'], unassigned: true },
              { title: `[${name}] [FE] Interactive Multi-Stop Waypoint Reordering UI`, desc: 'Drag-and-drop waypoint list allowing dispatchers to manually reorder route stops.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 4, labels: ['Frontend', 'UI/UX'], unassigned: true },
              { title: `[${name}] [QA] Routing Optimization Edge Cases & One-Way Road QA`, desc: 'Validate route sequence against city one-way traffic restrictions and bridge closures.', col: 'To Do', priority: TaskPriority.HIGH, sp: 3, duration: 3, offset: 8, labels: ['QA', 'Algorithm'], unassigned: true },
              { title: `[${name}] [BE] Proof of Delivery (POD) Image Upload & S3 Bucket Policy`, desc: 'Direct upload endpoint for customer signature and delivery parcel photo verification.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 0, labels: ['Backend', 'S3'], unassigned: true },
              { title: `[${name}] [FE] Driver Camera Photo Capture & Customer Signature Canvas`, desc: 'Canvas signature component supporting touch stylus and native camera capture.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 2, labels: ['Frontend', 'Mobile'], unassigned: true },
              { title: `[${name}] [QA] Signature Touch Latency & Offline Image Queue QA`, desc: 'Test signature capture responsiveness and offline SQLite queueing when signal is lost.', col: 'To Do', priority: TaskPriority.LOW, sp: 2, duration: 2, offset: 4, labels: ['QA', 'Mobile'], unassigned: true },
              { title: `[${name}] [BE] Automated Courier Fuel Surcharge & Payout Engine`, desc: 'Compute daily driver earnings based on completed deliveries, distance, and tips.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 3, offset: 3, labels: ['Backend', 'Fintech'], unassigned: true },
              { title: `[${name}] [FE] Courier Earnings & Commission Breakdown Screen`, desc: 'Weekly payout summary screen with detailed line-item breakdown and bank withdrawal button.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 6, labels: ['Frontend', 'UI/UX'], unassigned: true },
              { title: `[${name}] [DevOps] Geolocation Tile Server Caching via NGINX & CDN`, desc: 'Cache map vector tiles on CloudFront CDN edge to reduce Mapbox API usage costs.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 5, labels: ['DevOps', 'Cloud'], unassigned: true },
              { title: `[${name}] [DevOps] Realtime Fleet Metrics & OpenTelemetry Socket Dashboard`, desc: 'Monitor active WebSocket connections, message round-trip time, and packet drop rate.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 7, labels: ['DevOps', 'Monitoring'], unassigned: true },
              { title: `[${name}] [FE] Customer Live Tracking Webview & SMS Notification Link`, desc: 'Lightweight mobile web page allowing recipients to watch delivery courier approaching.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 7, labels: ['Frontend', 'UI/UX'], unassigned: true },
              { title: `[${name}] [BE] Twilio SMS Dispatch & Dynamic Shortlink Redirector`, desc: 'Send automated SMS notifications with branded shortlinks when delivery is 10 mins away.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 9, labels: ['Backend', 'Integration'], unassigned: true },
              { title: `[${name}] [QA] High Load Simulated Driver Connections & Reconnects`, desc: 'Simulate 1,000 couriers broadcasting location concurrently with Locust.', col: 'To Do', priority: TaskPriority.LOW, sp: 3, duration: 2, offset: 11, labels: ['QA', 'Performance'], unassigned: true },
              { title: `[${name}] [FE] Fleet Manager Heatmap Layer & Order Density Overlay`, desc: 'Visual density heatmap overlay showing historical order demand hotspots across districts.', col: 'To Do', priority: TaskPriority.LOW, sp: 2, duration: 2, offset: 11, labels: ['Frontend', 'Map'], unassigned: true }
            ],
            dependencies: commonSprint3Deps
          }
        ]
      }

      // Default for Design System & Marketing
      return [
        {
          name: `${name} - Sprint 1 (Foundation)`,
          goal: 'Core architecture, design specifications, component guidelines, and baseline infrastructure.',
          maxStoryPoint: 35,
          startDate: daysAgo(30),
          endDate: daysAgo(16),
          status: SprintStatus.COMPLETED,
          tasks: [
            { title: `[${name}] Repository Setup, ESLint & Storybook Config`, desc: 'Setup workspace tooling, documentation framework, and build scripts.', col: 'Done', priority: TaskPriority.HIGH, sp: 3, duration: 3, offset: 0, labels: ['Setup', 'DevOps'] },
            { title: `[${name}] Typography, Spacing & Color Token Definitions`, desc: 'Create semantic token aliases and export them to CSS variables and Tailwind theme.', col: 'Done', priority: TaskPriority.CRITICAL, sp: 5, duration: 4, offset: 3, labels: ['Design', 'UI/UX'] },
            { title: `[${name}] Atomic Component Wireframes & Accessibility Standards`, desc: 'Design atomic elements adhering to WCAG 2.1 AA accessibility guidelines.', col: 'Done', priority: TaskPriority.MEDIUM, sp: 5, duration: 4, offset: 3, labels: ['Figma', 'UI/UX'] },
            { title: `[${name}] Component Build Engine & npm Package Bundler`, desc: 'Configure Vite library mode bundling with TypeScript declaration exports.', col: 'Done', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 7, labels: ['Build', 'DevOps'] },
            { title: `[${name}] Initial Cross-Browser Smoke Testing & Milestone Signoff`, desc: 'Verify rendering across Safari, Chrome, and Firefox browsers.', col: 'Done', priority: TaskPriority.LOW, sp: 3, duration: 3, offset: 11, labels: ['QA', 'Testing'] }
          ],
          dependencies: commonSprint1Deps
        },
        {
          name: `${name} - Sprint 2 (Core Library Implementation)`,
          goal: 'Build interactive UI components, form controls, and unassigned tasks for technical role assignment.',
          maxStoryPoint: 40,
          startDate: daysAgo(5),
          endDate: daysFromNow(9),
          status: SprintStatus.ACTIVE,
          tasks: [
            { title: `[${name}] Core Button, Input & Badge UI Components`, desc: 'Implement primitives with variant props, focus states, and keyboard accessibility.', col: 'Done', priority: TaskPriority.CRITICAL, sp: 5, duration: 3, offset: 0, labels: ['Frontend', 'UI/UX'] },
            { title: `[${name}] Modal Dialog & Slideover Drawer Primitives`, desc: 'Build accessible dialogs using Radix UI primitives with focus trapping.', col: 'In Review', priority: TaskPriority.HIGH, sp: 8, duration: 4, offset: 3, labels: ['Frontend', 'UI/UX'] },
            { title: `[${name}] Component Showcase Documentation & Storybook Portal`, desc: 'Interactive component playground with live code copy and prop controls.', col: 'In Progress', priority: TaskPriority.HIGH, sp: 8, duration: 5, offset: 3, labels: ['Frontend', 'Documentation'] },
            { title: `[${name}] [FE] Data Table Component with Sorting & Virtualization`, desc: 'High-performance table component supporting 10,000 rows with TanStack Virtual.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 7, labels: ['Frontend', 'Component'], unassigned: true },
            { title: `[${name}] [FE] DatePicker & Time Range Selector Component`, desc: 'Dual-calendar view with preset date ranges (Today, This Sprint, This Month).', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 4, offset: 8, labels: ['Frontend', 'UI/UX'], unassigned: true },
            { title: `[${name}] [QA] Accessibility WCAG 2.1 AA Compliance Automated Audit`, desc: 'Run axe-core automated audits on all components and fix any contrast violations.', col: 'To Do', priority: TaskPriority.HIGH, sp: 3, duration: 3, offset: 8, labels: ['QA', 'Accessibility'], unassigned: true },
            { title: `[${name}] [DevOps] Chromatic Visual Regression CI/CD Pipeline`, desc: 'Automate visual regression screenshot comparisons on every pull request.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 12, labels: ['DevOps', 'CI/CD'], unassigned: true }
          ],
          dependencies: commonSprint2Deps
        },
        {
          name: `${name} - Product Backlog`,
          goal: 'Design system enhancement backlog ready for AI scheduling.',
          maxStoryPoint: 50,
          startDate: daysFromNow(10),
          endDate: daysFromNow(24),
          status: SprintStatus.PLANNED,
          tasks: [
            { title: `[${name}] [FE] Command Menu (Cmd+K) Palette Component`, desc: 'Accessible search palette with fuzzy filtering and keyboard navigation.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 3, offset: 0, labels: ['Frontend', 'Component'], unassigned: true },
            { title: `[${name}] [FE] Toast & Notification Banner System`, desc: 'Stacked notification alerts with swipe-to-dismiss and auto-dismiss timer.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 2, labels: ['Frontend', 'UI/UX'], unassigned: true },
            { title: `[${name}] [FE] File Dropzone with Image Preview & Upload Progress`, desc: 'Drag-and-drop file upload component with image thumbnail cropping.', col: 'To Do', priority: TaskPriority.HIGH, sp: 5, duration: 3, offset: 4, labels: ['Frontend', 'Component'], unassigned: true },
            { title: `[${name}] [QA] Component Touch Target & Mobile Viewport Audit`, desc: 'Verify minimum 48px touch target on mobile screens across all controls.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 7, labels: ['QA', 'Testing'], unassigned: true },
            { title: `[${name}] [DevOps] Automated Changelog & SemVer Release Tagging`, desc: 'Setup changesets action to automate npm package publishing on merge.', col: 'To Do', priority: TaskPriority.MEDIUM, sp: 3, duration: 2, offset: 9, labels: ['DevOps', 'Release'], unassigned: true }
          ],
          dependencies: commonSprint3Deps
        }
      ]
    }

    const sprintConfigs = getSprintConfigsForProject(proj.name)

    for (const sConf of sprintConfigs) {
      const sprint = await prisma.sprint.create({
        data: {
          projectId: proj.id,
          name: sConf.name,
          goal: sConf.goal,
          maxStoryPoint: sConf.maxStoryPoint,
          startDate: sConf.startDate,
          endDate: sConf.endDate,
          status: sConf.status,
          createdById: proj.ownerId
        }
      })
      totalSprintsCount++

      const colDefinitions = [
        { title: 'To Do', isDone: false, isWip: false, isBlocked: false, isCancelled: false, color: '#94a3b8' },
        { title: 'In Progress', isDone: false, isWip: true, isBlocked: false, isCancelled: false, color: '#3b82f6' },
        { title: 'In Review', isDone: false, isWip: true, isBlocked: false, isCancelled: false, color: '#8b5cf6' },
        { title: 'Done', isDone: true, isWip: false, isBlocked: false, isCancelled: false, color: '#10b981' }
      ]
      const createdCols: Record<string, string> = {}
      const colIds: string[] = []

      for (const colDef of colDefinitions) {
        const col = await prisma.boardColumn.create({
          data: {
            sprintId: sprint.id,
            title: colDef.title,
            isDone: colDef.isDone,
            isWip: colDef.isWip,
            isBlocked: colDef.isBlocked,
            isCancelled: colDef.isCancelled,
            color: colDef.color,
            createdById: proj.ownerId
          }
        })
        createdCols[colDef.title] = col.id
        colIds.push(col.id)
      }

      await prisma.sprint.update({
        where: { id: sprint.id },
        data: { boardColumnIds: colIds }
      })

      const projMembers = await prisma.projectMember.findMany({
        where: { projectId: proj.id, status: ProjectMemberStatus.ACTIVE },
        include: { member: true }
      })
      const memberUserIds = projMembers.map((m) => m.memberId)

      const findMemberBySkill = (labels: string[], title: string): string => {
        const lowerTitle = title.toLowerCase()
        const lowerLabels = labels.map((l) => l.toLowerCase())

        let targetRole: TechnicalRole = TechnicalRole.FULLSTACK
        if (
          lowerLabels.some((l) => l.includes('front') || l.includes('ui') || l.includes('figma') || l.includes('design')) ||
          /\b(ui|frontend|screen|css|component|ux|figma|tailwind|layout)\b/i.test(lowerTitle)
        ) {
          targetRole = TechnicalRole.FRONTEND
        } else if (
          lowerLabels.some((l) => l.includes('back') || l.includes('api') || l.includes('database') || l.includes('auth')) ||
          /\b(backend|database|api|auth|endpoint|service|server|prisma|sql|redis|bullmq)\b/i.test(lowerTitle)
        ) {
          targetRole = TechnicalRole.BACKEND
        } else if (
          lowerLabels.some((l) => l.includes('qa') || l.includes('test')) ||
          /\b(qa|test|testing|cypress|jest|smoke|audit|benchmark)\b/i.test(lowerTitle)
        ) {
          targetRole = TechnicalRole.QA_TEST
        } else if (
          lowerLabels.some((l) => l.includes('devops') || l.includes('cloud') || l.includes('docker') || l.includes('setup')) ||
          /\b(devops|cloud|docker|kubernetes|helm|pipeline|ci\/cd|aws|terraform|vault)\b/i.test(lowerTitle)
        ) {
          targetRole = TechnicalRole.DEVOPS
        }

        // 1. Primary lookup: Match member with exact configured technicalRole in ProjectMember
        const matched = projMembers.find((pm) => pm.technicalRole === targetRole)
        if (matched) return matched.memberId

        // 2. If target is FRONTEND, allow DESIGN
        if (targetRole === TechnicalRole.FRONTEND) {
          const designMatch = projMembers.find((pm) => pm.technicalRole === TechnicalRole.DESIGN)
          if (designMatch) return designMatch.memberId
        }

        // 3. Fallback to FULLSTACK
        const fullstackMatch = projMembers.find((pm) => pm.technicalRole === TechnicalRole.FULLSTACK)
        if (fullstackMatch) return fullstackMatch.memberId

        // 4. Any member except owner/viewer if possible
        const memberMatch = projMembers.find((pm) => pm.technicalRole !== TechnicalRole.PRODUCT_OWNER)
        if (memberMatch) return memberMatch.memberId

        return memberUserIds[totalTasksCount % memberUserIds.length]
      }

      let sortOrder = 1
      const createdMainTasks: any[] = []

      for (let i = 0; i < sConf.tasks.length; i++) {
        const tTemp = sConf.tasks[i]
        const targetColId = createdCols[tTemp.col]
        const isUnassigned = !!tTemp.unassigned
        const assignedUserId = isUnassigned ? null : findMemberBySkill(tTemp.labels, tTemp.title)

        const taskStart = addDays(sConf.startDate, tTemp.offset)
        const taskDue = addDays(taskStart, tTemp.duration)

        let taskType: TaskType = TaskType.TASK
        const titleLower = tTemp.title.toLowerCase()
        if (tTemp.labels.some((l: string) => l.includes('bug')) || titleLower.includes('fix') || titleLower.includes('bug')) {
          taskType = TaskType.BUG
        } else if (tTemp.labels.some((l: string) => l.includes('refactor') || l.includes('tech')) || titleLower.includes('setup')) {
          taskType = TaskType.TECH_DEBT
        } else if (tTemp.labels.some((l: string) => l.includes('feature')) || titleLower.includes('create') || titleLower.includes('build')) {
          taskType = TaskType.STORY
        }

        const task = await prisma.task.create({
          data: {
            sprintId: sprint.id,
            boardColumnId: targetColId,
            title: tTemp.title,
            description: tTemp.desc,
            type: taskType,
            priority: tTemp.priority,
            storyPoint: tTemp.sp,
            duration: tTemp.duration,
            startDate: taskStart,
            dueDate: taskDue,
            createdById: proj.ownerId,
            labels: { create: tTemp.labels.map((lbl: string) => ({ label: lbl, createdById: proj.ownerId })) },
            assignees: assignedUserId ? { create: [{ userId: assignedUserId, createdById: proj.ownerId }] } : undefined,
            boardColumnTaskOrders: { create: [{ boardColumnId: targetColId, sortOrder: sortOrder++ }] }
          }
        })
        totalTasksCount++
        createdMainTasks.push(task)

        // Subtasks for the first task of completed/active sprint
        if (i === 0 && assignedUserId) {
          const subTask1 = await prisma.task.create({
            data: {
              sprintId: sprint.id,
              boardColumnId: targetColId,
              title: `[Subtask] Initial Configuration & Setup Details`,
              description: 'Configure initial requirements, branch setup, and repository guidelines.',
              priority: TaskPriority.MEDIUM,
              storyPoint: 1,
              duration: 1,
              startDate: taskStart,
              dueDate: addDays(taskStart, 1),
              createdById: proj.ownerId,
              parentId: task.id,
              assignees: { create: [{ userId: assignedUserId, createdById: proj.ownerId }] },
              boardColumnTaskOrders: { create: [{ boardColumnId: targetColId, sortOrder: sortOrder++ }] }
            }
          })
          totalTasksCount++

          const subTask2 = await prisma.task.create({
            data: {
              sprintId: sprint.id,
              boardColumnId: targetColId,
              title: `[Subtask] Verification & Team Peer Review`,
              description: 'Run automated checks, ensure linter passes and submit PR for review.',
              priority: TaskPriority.LOW,
              storyPoint: 1,
              duration: 2,
              startDate: addDays(taskStart, 1),
              dueDate: taskDue,
              createdById: proj.ownerId,
              parentId: task.id,
              assignees: { create: [{ userId: assignedUserId, createdById: proj.ownerId }] },
              boardColumnTaskOrders: { create: [{ boardColumnId: targetColId, sortOrder: sortOrder++ }] }
            }
          })
          totalTasksCount++
        }

        // Add Realistic Comments and Attachments for active tasks
        if (tTemp.col === 'In Progress' || tTemp.col === 'In Review') {
          const commentator = allUsers.find((u) => u.id === assignedUserId) || users[0]
          await prisma.taskComment.create({
            data: {
              taskId: task.id,
              memberId: commentator.id,
              memberDisplayName: commentator.displayName,
              memberAvatar: commentator.avatar,
              content: `Currently actively working on this task. Implementation adheres to sprint goals.`,
              createdById: commentator.id
            }
          })
          await prisma.taskAttachment.create({
            data: {
              taskId: task.id,
              fileName: 'architecture_specification.png',
              fileType: 'image/png',
              fileUrl: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600',
              createdById: commentator.id
            }
          })
        }
      }

      // Link Task Dependencies from sprint configuration
      for (const dep of sConf.dependencies) {
        if (createdMainTasks[dep.predIndex] && createdMainTasks[dep.succIndex]) {
          await prisma.taskDependency.create({
            data: {
              predecessorId: createdMainTasks[dep.predIndex].id,
              successorId: createdMainTasks[dep.succIndex].id,
              type: dep.type,
              lag: dep.lag
            }
          })
        }
      }
    }

    const pChat = await prisma.projectChat.create({
      data: {
        projectId: proj.id,
        lastMessage: 'Let us sync on today sprint goals, deliverables, and blockers.',
        lastMessageTime: daysAgo(1),
        createdById: proj.ownerId
      }
    })

    const chatSender = allUsers.find((u) => u.id === proj.ownerId)!
    await prisma.projectChatMessage.create({
      data: {
        projectChatId: pChat.id,
        senderId: chatSender.id,
        senderName: chatSender.displayName,
        senderRole: 'Project Owner',
        senderAvatarUrl: chatSender.avatar,
        message: `Welcome team to ${proj.name}! Check out the active sprint board and task dependencies.`,
        createdById: chatSender.id
      }
    })
  }

  // Generate Notifications tailored to each project's actual members
  for (const proj of createdProjects) {
    const projMembers = await prisma.projectMember.findMany({
      where: {
        projectId: proj.id,
        roleId: { not: roleMap[RoleName.Owner] },
        status: ProjectMemberStatus.ACTIVE
      }
    })
    for (const m of projMembers.slice(0, 2)) {
      await prisma.notification.create({
        data: {
          userId: m.memberId,
          type: NotificationType.project_invitation,
          title: 'Project Invitation',
          message: `You have been added as an active member to ${proj.name} project.`,
          isRead: false
        }
      })
    }
  }

  console.log(`✅ Generated ${totalSprintsCount} Sprints, ${totalTasksCount} Tasks, Dependencies, Comments & Notifications.`)

  await app.close()

  // ==========================================
  // 7. PRINT SUMMARY TABLE
  // ==========================================
  console.log('\n====================================================================================')
  console.log('🎉 SPRINTOS UNIFIED DATA & PERMISSIONS SEEDING COMPLETED!')
  console.log('====================================================================================\n')
  console.log(`🔑 Common Password for ALL Users: ${defaultPassword}\n`)

  console.log('👤 ADMIN ACCOUNT [System Role: ADMIN]:')
  console.table([
    { SystemRole: 'ADMIN', Name: adminUser.displayName, Email: adminUser.email, Password: defaultPassword }
  ])

  console.log('\n👥 DEDICATED PROJECT OWNER ACCOUNTS [3 Projects Per Owner]:')
  console.table([
    {
      Email: 'nguyenthuan05.work@gmail.com',
      Name: userByEmail('nguyenthuan05.work@gmail.com').displayName,
      OwnedProjects: '1. Sprintos Mobile App\n2. Sprintos AI Intelligence Core\n3. Sprintos Cloud Infrastructure',
      TotalProjects: 3,
      Password: defaultPassword,
      CrossoverStatus: 'EXCLUSIVE (No shared projects with sprintos.01062026@gmail.com)'
    },
    {
      Email: 'sprintos.01062026@gmail.com',
      Name: userByEmail('sprintos.01062026@gmail.com').displayName,
      OwnedProjects: '1. E-Commerce Redesign\n2. Fintech Payment Gateway & Wallet\n3. Realtime Logistics & Order Dispatch',
      TotalProjects: 3,
      Password: defaultPassword,
      CrossoverStatus: 'EXCLUSIVE (No shared projects with nguyenthuan05.work@gmail.com)'
    }
  ])

  console.log('\n👥 ALL TEST USER ACCOUNTS [System Role: USER]:')
  console.table(
    users.map((u) => ({
      ID: u.id,
      Name: u.displayName,
      Email: u.email,
      SystemRole: 'USER',
      Password: defaultPassword
    }))
  )

  console.log('\n📁 CREATED WORKSPACES & PROJECT MEMBER ROLES:')
  console.table(
    projectsData.map((p, index) => ({
      ProjectID: createdProjects[index].id,
      ProjectName: p.name,
      Owner: `${p.owner.displayName} (${p.owner.email})`,
      ProjectRolesAssigned: `OWNER: 1, CO-OWNER: ${p.members.filter((m) => m.role === RoleName.CoOwner).length}, MEMBER: ${p.members.filter((m) => m.role === RoleName.Member).length}, VIEWER: ${p.members.filter((m) => m.role === RoleName.Viewer).length}`
    }))
  )

  console.log('\n====================================================================================\n')
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Error during unified data seeding:', err)
  process.exit(1)
})
