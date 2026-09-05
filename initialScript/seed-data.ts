import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { createId } from '@paralleldrive/cuid2'
import { AppModule } from '~/app.module'
import { PrismaService } from '~/shared/services/prisma.service'
import { HashingService } from '~/shared/services/hashing.service'
import { HTTPMethod, RoleName } from '~/shared/constants/role.constants'
import { ProjectMemberRole, ProjectMemberStatus } from '~/shared/constants/project.constants'
import { UserStatus, Gender, SprintStatus, TaskPriority, NotificationType, TaskType } from '~/generated/prisma/enums'
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
    { email: 'olivia.intern@sprintos.com', name: 'Olivia Harris', bio: 'Junior Developer', gender: Gender.FEMALE, phone: '0912345684', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150' }
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

  const userByEmail = (email: string) => {
    const found = users.find((u) => u.email === email)
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
  //       Neither account is a member of the other's project (zero crossover).
  const projectsData = [
    {
      name: 'Sprintos Mobile App',
      description: 'Cross-platform iOS & Android mobile application built with React Native and NestJS API.',
      image: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=400',
      owner: userByEmail('nguyenthuan05.work@gmail.com'),
      members: [
        { user: userByEmail('sarah.pm@sprintos.com'), role: RoleName.CoOwner, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('alex.dev@sprintos.com'), role: RoleName.Member, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('lisa.frontend@sprintos.com'), role: RoleName.Member, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('james.backend@sprintos.com'), role: RoleName.Member, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('david.qa@sprintos.com'), role: RoleName.Member, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('olivia.intern@sprintos.com'), role: RoleName.Viewer, status: ProjectMemberStatus.ACTIVE }
      ]
    },
    {
      name: 'E-Commerce Redesign',
      description: 'High-performance storefront rebuild using Next.js 14, TailwindCSS, Microservices & Stripe.',
      image: 'https://images.unsplash.com/photo-1556742049-0a675686001a?w=400',
      owner: userByEmail('sprintos.01062026@gmail.com'),
      members: [
        { user: userByEmail('michael.tech@sprintos.com'), role: RoleName.CoOwner, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('kevin.fullstack@sprintos.com'), role: RoleName.Member, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('emily.ux@sprintos.com'), role: RoleName.Member, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('rachel.designer@sprintos.com'), role: RoleName.Member, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('daniel.sec@sprintos.com'), role: RoleName.Viewer, status: ProjectMemberStatus.PENDING }
      ]
    },
    {
      name: 'Sprintos Design System',
      description: 'Unified React component library, accessibility guidelines, Figma tokens & brand guidelines.',
      image: 'https://images.unsplash.com/photo-1581291518633-83b4ebd1d83e?w=400',
      owner: userByEmail('emily.ux@sprintos.com'),
      members: [
        { user: userByEmail('rachel.designer@sprintos.com'), role: RoleName.CoOwner, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('lisa.frontend@sprintos.com'), role: RoleName.Member, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('sarah.pm@sprintos.com'), role: RoleName.Viewer, status: ProjectMemberStatus.ACTIVE }
      ]
    },
    {
      name: 'Q3 Growth Marketing',
      description: 'Integrated digital marketing, landing pages, SEO optimization & lead generation funnel.',
      image: 'https://images.unsplash.com/photo-1533750349088-cd871a92f312?w=400',
      owner: userByEmail('jessica.mkt@sprintos.com'),
      members: [
        { user: userByEmail('amanda.content@sprintos.com'), role: RoleName.CoOwner, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('rachel.designer@sprintos.com'), role: RoleName.Member, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('sarah.pm@sprintos.com'), role: RoleName.Viewer, status: ProjectMemberStatus.ACTIVE }
      ]
    },
    {
      name: 'Cloud Infrastructure Migration',
      description: 'Migrating legacy monolith to AWS EKS Kubernetes, Terraform IaC, & Automated CI/CD pipelines.',
      image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400',
      owner: userByEmail('robert.devops@sprintos.com'),
      members: [
        { user: userByEmail('michael.tech@sprintos.com'), role: RoleName.CoOwner, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('daniel.sec@sprintos.com'), role: RoleName.Member, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('james.backend@sprintos.com'), role: RoleName.Member, status: ProjectMemberStatus.ACTIVE }
      ]
    },
    {
      name: 'Internal ERP Automation',
      description: 'Automating internal HR workflows, timesheets, payroll integration & resource planning.',
      image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400',
      owner: userByEmail('michael.tech@sprintos.com'),
      members: [
        { user: userByEmail('kevin.fullstack@sprintos.com'), role: RoleName.CoOwner, status: ProjectMemberStatus.ACTIVE },
        { user: userByEmail('david.qa@sprintos.com'), role: RoleName.Member, status: ProjectMemberStatus.ACTIVE }
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
              status: ProjectMemberStatus.ACTIVE,
              invitedById: p.owner.id,
              joinAt: new Date()
            },
            ...p.members.map((m) => ({
              memberId: m.user.id,
              email: m.user.email,
              roleId: roleMap[m.role],
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

  console.log(`✅ Created ${createdProjects.length} Projects with explicit Project Roles.`)

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
    const sprintConfigs = [
      {
        name: `${proj.name} - Sprint 1 (Foundation)`,
        goal: 'Complete core system architecture, setup database schemas, and baseline wireframes.',
        maxStoryPoint: 35,
        startDate: daysAgo(30),
        endDate: daysAgo(16),
        status: SprintStatus.COMPLETED,
        tasks: [
          {
            title: `[${proj.name}] Setup Project Environment & Dependencies`,
            desc: 'Configure repository, ESLint, Prettier, Docker container and environment files.',
            col: 'Done',
            priority: TaskPriority.HIGH,
            sp: 3,
            duration: 3,
            offset: 0,
            labels: ['Setup', 'DevOps']
          },
          {
            title: `[${proj.name}] Implement Database Schema & Migrations`,
            desc: 'Design tables in Prisma schema, verify relations and execute initial migrations.',
            col: 'Done',
            priority: TaskPriority.CRITICAL,
            sp: 5,
            duration: 4,
            offset: 3,
            labels: ['Database', 'Backend']
          },
          {
            title: `[${proj.name}] Design System Baseline & Design Tokens`,
            desc: 'Create base typography, color tokens and core reusable component specifications.',
            col: 'Done',
            priority: TaskPriority.MEDIUM,
            sp: 5,
            duration: 4,
            offset: 3,
            labels: ['UI/UX', 'Figma']
          },
          {
            title: `[${proj.name}] Build Core REST Boilerplate & Health Checks`,
            desc: 'Create base controllers, exception filters, request logging and system health endpoint.',
            col: 'Done',
            priority: TaskPriority.HIGH,
            sp: 5,
            duration: 4,
            offset: 7,
            labels: ['API', 'Backend']
          },
          {
            title: `[${proj.name}] Initial Integration Smoke Tests & Milestone Signoff`,
            desc: 'Verify containerized build, automated smoke tests and conduct Sprint 1 review signoff.',
            col: 'Done',
            priority: TaskPriority.LOW,
            sp: 3,
            duration: 3,
            offset: 11,
            labels: ['QA', 'Testing']
          }
        ],
        dependencies: [
          { predIndex: 0, succIndex: 1, type: DependencyType.FS, lag: 0 },
          { predIndex: 0, succIndex: 2, type: DependencyType.FS, lag: 0 },
          { predIndex: 1, succIndex: 3, type: DependencyType.FS, lag: 0 },
          { predIndex: 2, succIndex: 4, type: DependencyType.FS, lag: 0 },
          { predIndex: 3, succIndex: 4, type: DependencyType.FS, lag: 0 }
        ]
      },
      {
        name: `${proj.name} - Sprint 2 (Core Features)`,
        goal: 'Implement primary user workflows, authentication, API integrations, and main UI screens.',
        maxStoryPoint: 40,
        startDate: daysAgo(5),
        endDate: daysFromNow(9),
        status: SprintStatus.ACTIVE,
        tasks: [
          {
            title: `[${proj.name}] Build User Auth & Authorization RBAC Module`,
            desc: 'Implement JWT authentication, Refresh Token rotation and role-based guards.',
            col: 'Done',
            priority: TaskPriority.CRITICAL,
            sp: 5,
            duration: 3,
            offset: 0,
            labels: ['Auth', 'Security']
          },
          {
            title: `[${proj.name}] Develop Business RESTful API Endpoints`,
            desc: 'Create Controllers, Services, Repositories and Zod DTO request validation.',
            col: 'In Review',
            priority: TaskPriority.HIGH,
            sp: 8,
            duration: 4,
            offset: 3,
            labels: ['API', 'Backend']
          },
          {
            title: `[${proj.name}] Build Interactive Dashboard UI & State Store`,
            desc: 'Develop responsive data views, analytics charts and Zustand global state management.',
            col: 'In Progress',
            priority: TaskPriority.HIGH,
            sp: 8,
            duration: 5,
            offset: 3,
            labels: ['Frontend', 'UI/UX']
          },
          {
            title: `[${proj.name}] Third-Party Integrations & Webhook Notification Engine`,
            desc: 'Integrate external gateways, webhook listeners and asynchronous push alerts.',
            col: 'To Do',
            priority: TaskPriority.MEDIUM,
            sp: 5,
            duration: 3,
            offset: 7,
            labels: ['Integration', 'Notification']
          },
          {
            title: `[${proj.name}] End-to-End API Integration & Acceptance QA Testing`,
            desc: 'Conduct automated test suites, cross-browser compatibility and regression QA runs.',
            col: 'To Do',
            priority: TaskPriority.HIGH,
            sp: 5,
            duration: 4,
            offset: 8,
            labels: ['Testing', 'QA']
          },
          {
            title: `[${proj.name}] Staging Deployment & Sprint Review Preparation`,
            desc: 'Deploy release build to staging cluster, verify environment and prepare demo release.',
            col: 'To Do',
            priority: TaskPriority.LOW,
            sp: 2,
            duration: 2,
            offset: 12,
            labels: ['DevOps', 'Release']
          }
        ],
        dependencies: [
          { predIndex: 0, succIndex: 1, type: DependencyType.FS, lag: 0 },
          { predIndex: 0, succIndex: 2, type: DependencyType.FS, lag: 0 },
          { predIndex: 1, succIndex: 3, type: DependencyType.FS, lag: 0 },
          { predIndex: 1, succIndex: 4, type: DependencyType.FS, lag: 0 },
          { predIndex: 2, succIndex: 4, type: DependencyType.FS, lag: 0 },
          { predIndex: 3, succIndex: 5, type: DependencyType.FS, lag: 0 },
          { predIndex: 4, succIndex: 5, type: DependencyType.FS, lag: 0 }
        ]
      },
      {
        name: `${proj.name} - Sprint 3 (Polish & Release)`,
        goal: 'Performance optimization, security audit, bug fixes, end-to-end testing, and production deploy.',
        maxStoryPoint: 45,
        startDate: daysFromNow(10),
        endDate: daysFromNow(24),
        status: SprintStatus.PLANNED,
        tasks: [
          {
            title: `[${proj.name}] Load Testing & Database Query Optimization`,
            desc: 'Benchmark high traffic scenarios, index query optimization and Redis caching layer.',
            col: 'To Do',
            priority: TaskPriority.HIGH,
            sp: 5,
            duration: 4,
            offset: 0,
            labels: ['Performance', 'Database']
          },
          {
            title: `[${proj.name}] Security Vulnerability Audit & Hardening`,
            desc: 'Run OWASP vulnerability scan, patch security headers and configure strict rate limiting.',
            col: 'To Do',
            priority: TaskPriority.CRITICAL,
            sp: 5,
            duration: 4,
            offset: 0,
            labels: ['Security', 'Audit']
          },
          {
            title: `[${proj.name}] Production Kubernetes & Cloud Scaling Setup`,
            desc: 'Configure HPA autoscaling, ingress controllers, SSL certificates and Datadog monitoring.',
            col: 'To Do',
            priority: TaskPriority.HIGH,
            sp: 5,
            duration: 5,
            offset: 4,
            labels: ['Cloud', 'DevOps']
          },
          {
            title: `[${proj.name}] Production Build & Release Artifacts Verification`,
            desc: 'Verify minified client builds, checksums, CDN asset invalidation and release notes.',
            col: 'To Do',
            priority: TaskPriority.CRITICAL,
            sp: 3,
            duration: 3,
            offset: 9,
            labels: ['Build', 'Release']
          },
          {
            title: `[${proj.name}] Production Go-Live & Post-Launch Monitoring`,
            desc: 'Switch production DNS traffic, monitor error budgets, latencies and database health.',
            col: 'To Do',
            priority: TaskPriority.HIGH,
            sp: 2,
            duration: 2,
            offset: 12,
            labels: ['Production', 'Monitoring']
          }
        ],
        dependencies: [
          { predIndex: 0, succIndex: 2, type: DependencyType.FS, lag: 0 },
          { predIndex: 1, succIndex: 2, type: DependencyType.FS, lag: 0 },
          { predIndex: 2, succIndex: 3, type: DependencyType.FS, lag: 0 },
          { predIndex: 3, succIndex: 4, type: DependencyType.FS, lag: 0 }
        ]
      }
    ]

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
        where: { projectId: proj.id, status: ProjectMemberStatus.ACTIVE }
      })
      const memberUserIds = projMembers.map((m) => m.memberId)

      let sortOrder = 1
      const createdMainTasks: any[] = []

      for (let i = 0; i < sConf.tasks.length; i++) {
        const tTemp = sConf.tasks[i]
        const targetColId = createdCols[tTemp.col]
        const assignedUserId = memberUserIds[totalTasksCount % memberUserIds.length]

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
            labels: { create: tTemp.labels.map((lbl) => ({ label: lbl, createdById: proj.ownerId })) },
            assignees: { create: [{ userId: assignedUserId, createdById: proj.ownerId }] },
            boardColumnTaskOrders: { create: [{ boardColumnId: targetColId, sortOrder: sortOrder++ }] }
          }
        })
        totalTasksCount++
        createdMainTasks.push(task)

        // Subtasks for the first task of each sprint
        if (i === 0) {
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
          const commentator = users.find((u) => u.id === assignedUserId) || users[0]
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

    const chatSender = users.find((u) => u.id === proj.ownerId)!
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

  console.log('\n👥 DEDICATED PROJECT OWNER ACCOUNTS [Requested by User]:')
  console.table([
    {
      Email: 'nguyenthuan05.work@gmail.com',
      Name: userByEmail('nguyenthuan05.work@gmail.com').displayName,
      OwnedProject: 'Sprintos Mobile App',
      Password: defaultPassword,
      CrossoverStatus: 'EXCLUSIVE (No shared projects with sprintos.01062026@gmail.com)'
    },
    {
      Email: 'sprintos.01062026@gmail.com',
      Name: userByEmail('sprintos.01062026@gmail.com').displayName,
      OwnedProject: 'E-Commerce Redesign',
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
