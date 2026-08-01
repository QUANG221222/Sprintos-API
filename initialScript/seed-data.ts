import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { createId } from '@paralleldrive/cuid2'
import { AppModule } from '~/app.module'
import { PrismaService } from '~/shared/services/prisma.service'
import { HashingService } from '~/shared/services/hashing.service'
import { HTTPMethod, RoleName } from '~/shared/constants/role.constants'
import { ProjectMemberRole, ProjectMemberStatus } from '~/shared/constants/project.constants'
import { UserStatus, Gender, SprintStatus, TaskPriority, NotificationType } from '~/generated/prisma/enums'

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
  }, {} as Record<string, typeof availableRoutes[0]>)

  const permissionsToDelete = permissionInDB.filter((item) => !availableRoutesMap[`{${item.method}-${item.path}}`])
  if (permissionsToDelete.length > 0) {
    await prisma.permission.deleteMany({ where: { id: { in: permissionsToDelete.map((p) => p.id) } } })
  }

  const perssionInDbMap = permissionInDB.reduce((map, item) => {
    map[`{${item.method}-${item.path}}`] = item
    return map
  }, {} as Record<string, typeof permissionInDB[0]>)

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
      perms.filter(
        (p) => {
          const cleanPath = p.path.replace(/^\/api/, '')
          return (
            cleanPath.startsWith('/auth') ||
            cleanPath.startsWith('/profile') ||
            cleanPath.startsWith('/media') ||
            (cleanPath.startsWith('/users') && p.method === 'GET') ||
            (cleanPath === '/projects' && (p.method === 'GET' || p.method === 'POST')) ||
            cleanPath === '/projects/owned' ||
            cleanPath === '/projects/joined'
          )
        }
      ),
    [ProjectMemberRole.CO_OWNER]: (perms: typeof updatedPermissionsInDb) =>
      perms.filter(
        (p) => {
          const cleanPath = p.path.replace(/^\/api/, '')
          return (
            (cleanPath.startsWith('/projects') && p.method === 'GET') ||
            (cleanPath.startsWith('/project-members') && (p.method === 'GET' || p.method === 'POST' || p.method === 'PATCH')) ||
            cleanPath.startsWith('/sprints') ||
            cleanPath.startsWith('/tasks') ||
            cleanPath.startsWith('/board-columns')
          )
        }
      ),
    [ProjectMemberRole.OWNER]: (perms: typeof updatedPermissionsInDb) =>
      perms.filter(
        (p) => {
          const cleanPath = p.path.replace(/^\/api/, '')
          return (
            cleanPath.startsWith('/projects') ||
            cleanPath.startsWith('/project-members') ||
            cleanPath.startsWith('/sprints') ||
            cleanPath.startsWith('/tasks') ||
            cleanPath.startsWith('/board-columns')
          )
        }
      ),
    [ProjectMemberRole.MEMBER]: (perms: typeof updatedPermissionsInDb) =>
      perms.filter(
        (p) => {
          const cleanPath = p.path.replace(/^\/api/, '')
          return (
            ((cleanPath.startsWith('/projects') || cleanPath.startsWith('/project-members')) && p.method === 'GET') ||
            cleanPath.startsWith('/sprints') ||
            cleanPath.startsWith('/tasks') ||
            cleanPath.startsWith('/board-columns')
          )
        }
      ),
    [ProjectMemberRole.VIEWER]: (perms: typeof updatedPermissionsInDb) =>
      perms.filter(
        (p) => {
          const cleanPath = p.path.replace(/^\/api/, '')
          return (
            p.method === 'GET' &&
            (cleanPath.startsWith('/projects') ||
              cleanPath.startsWith('/project-members') ||
              cleanPath.startsWith('/sprints') ||
              cleanPath.startsWith('/tasks') ||
              cleanPath.startsWith('/board-columns'))
          )
        }
      )
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
  const roleMap = allRoles.reduce((acc, r) => {
    acc[r.name] = r.id
    return acc
  }, {} as Record<string, string>)

  console.log(`✅ Configured ${updatedPermissionsInDb.length} Permissions across 6 Roles.`)

  // ==========================================
  // 4. CREATE USERS & ASSIGN SYSTEM ROLES
  // ==========================================
  console.log('\n👤 Step 4: Seeding Test Users & assigning System Roles...')
  const defaultPassword = 'c'
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

  // 14 Standard Users (System Role: USER)
  const userSeedData = [
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

  const userByEmail = (email: string) => users.find((u) => u.email === email)!

  console.log(`✅ Created 1 Admin User [System Role: ADMIN] & ${users.length} Standard Users [System Role: USER].`)

  // ==========================================
  // 5. CREATE PROJECTS & ASSIGN PROJECT ROLES
  // ==========================================
  console.log('\n📁 Step 5: Creating Workspaces & assigning Project Roles (OWNER, CO-OWNER, MEMBER, VIEWER)...')

  const projectsData = [
    {
      name: 'Sprintos Mobile App',
      description: 'Cross-platform iOS & Android mobile application built with React Native and NestJS API.',
      image: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=400',
    owner: userByEmail('sarah.pm@sprintos.com'),
      members: [
        { user: userByEmail('alex.dev@sprintos.com'), role: RoleName.CoOwner, status: ProjectMemberStatus.ACTIVE },
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
      owner: userByEmail('alex.dev@sprintos.com'),
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
  // 6. SPRINTS, KANBAN BOARD & TASKS
  // ==========================================
  console.log('\n🏃 Step 6: Generating Sprints, Board Columns, Tasks, Comments & Chats...')
  const now = new Date()
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000)
  const daysFromNow = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000)

  let totalTasksCount = 0
  let totalSprintsCount = 0

  for (const proj of createdProjects) {
    const sprintConfigs = [
      {
        name: `${proj.name} - Sprint 1 (Foundation)`,
        goal: 'Complete core system architecture, setup database schemas, and baseline wireframes.',
        maxStoryPoint: 35,
        startDate: daysAgo(30),
        endDate: daysAgo(14),
        status: SprintStatus.COMPLETED
      },
      {
        name: `${proj.name} - Sprint 2 (Core Features)`,
        goal: 'Implement primary user workflows, authentication, API integrations, and main UI screens.',
        maxStoryPoint: 40,
        startDate: daysAgo(13),
        endDate: daysFromNow(7),
        status: SprintStatus.ACTIVE
      },
      {
        name: `${proj.name} - Sprint 3 (Polish & Release)`,
        goal: 'Performance optimization, security audit, bug fixes, end-to-end testing, and production deploy.',
        maxStoryPoint: 45,
        startDate: daysFromNow(8),
        endDate: daysFromNow(22),
        status: SprintStatus.PLANNED
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

      const colNames = ['To Do', 'In Progress', 'In Review', 'Done']
      const createdCols: Record<string, string> = {}
      const colIds: string[] = []

      for (const colTitle of colNames) {
        const col = await prisma.boardColumn.create({
          data: {
            sprintId: sprint.id,
            title: colTitle,
            createdById: proj.ownerId
          }
        })
        createdCols[colTitle] = col.id
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

      const taskTemplates = [
        { title: `[${proj.name}] Setup Project Environment & Dependencies`, desc: 'Configure repo, ESLint, Prettier, Docker & Env.', col: 'Done', priority: TaskPriority.HIGH, sp: 3, labels: ['Setup', 'DevOps'] },
        { title: `[${proj.name}] Implement Database Schema & Migrations`, desc: 'Design tables in Prisma schema & run migrations.', col: 'Done', priority: TaskPriority.CRITICAL, sp: 5, labels: ['Database', 'Backend'] },
        { title: `[${proj.name}] Build User Auth & Authorization Guards`, desc: 'Implement JWT login, Refresh Token & RBAC.', col: sConf.status === SprintStatus.COMPLETED ? 'Done' : 'In Progress', priority: TaskPriority.HIGH, sp: 8, labels: ['Auth', 'Security'] },
        { title: `[${proj.name}] Design Main Dashboard Wireframes`, desc: 'Create responsive Figma prototypes & design tokens.', col: sConf.status === SprintStatus.COMPLETED ? 'Done' : 'In Review', priority: TaskPriority.MEDIUM, sp: 5, labels: ['UI/UX', 'Figma'] },
        { title: `[${proj.name}] Develop RESTful API Endpoints`, desc: 'Create Controllers, Services, Repos & Zod DTO schemas.', col: sConf.status === SprintStatus.PLANNED ? 'To Do' : 'In Progress', priority: TaskPriority.HIGH, sp: 8, labels: ['API', 'Backend'] },
        { title: `[${proj.name}] Cross-Browser Testing & Bug Fixes`, desc: 'Resolve layout shifts on Safari and mobile screens.', col: 'To Do', priority: TaskPriority.LOW, sp: 2, labels: ['Bug', 'Frontend'] }
      ]

      let sortOrder = 1
      const createdTasksList: any[] = []
      for (const tTemp of taskTemplates) {
        const targetColId = createdCols[tTemp.col]
        const assignedUserId = memberUserIds[totalTasksCount % memberUserIds.length]

        const task = await prisma.task.create({
          data: {
            sprintId: sprint.id,
            boardColumnId: targetColId,
            title: tTemp.title,
            description: tTemp.desc,
            priority: tTemp.priority,
            storyPoint: tTemp.sp,
            dueDate: daysFromNow(5),
            createdById: proj.ownerId,
            labels: { create: tTemp.labels.map((lbl) => ({ label: lbl, createdById: proj.ownerId })) },
            assignees: { create: [{ userId: assignedUserId, createdById: proj.ownerId }] },
            boardColumnTaskOrders: { create: [{ boardColumnId: targetColId, sortOrder: sortOrder++ }] }
          }
        })
        totalTasksCount++
        createdTasksList.push(task)

        // Subtasks for Environment Setup Task
        if (tTemp === taskTemplates[0]) {
          const subTask1 = await prisma.task.create({
            data: {
              sprintId: sprint.id,
              boardColumnId: targetColId,
              title: `[Subtask] Initialize Git Repository and setup GitFlow`,
              description: 'Create main, develop branches and setup branch protection rules.',
              priority: TaskPriority.MEDIUM,
              storyPoint: 1,
              dueDate: daysFromNow(2),
              createdById: proj.ownerId,
              parentId: task.id,
              assignees: { create: [{ userId: assignedUserId, createdById: proj.ownerId }] },
              boardColumnTaskOrders: { create: [{ boardColumnId: targetColId, sortOrder: sortOrder++ }] }
            }
          })
          totalTasksCount++
          createdTasksList.push(subTask1)

          const subTask2 = await prisma.task.create({
            data: {
              sprintId: sprint.id,
              boardColumnId: targetColId,
              title: `[Subtask] Install Linters and Formatting Rules`,
              description: 'Install and configure ESLint, Prettier, and husky git hooks.',
              priority: TaskPriority.LOW,
              storyPoint: 1,
              dueDate: daysFromNow(3),
              createdById: proj.ownerId,
              parentId: task.id,
              assignees: { create: [{ userId: assignedUserId, createdById: proj.ownerId }] },
              boardColumnTaskOrders: { create: [{ boardColumnId: targetColId, sortOrder: sortOrder++ }] }
            }
          })
          totalTasksCount++
          createdTasksList.push(subTask2)
        }

        if (tTemp.col === 'In Progress' || tTemp.col === 'In Review') {
          const commentator = users.find((u) => u.id === assignedUserId) || users[0]
          await prisma.taskComment.create({
            data: {
              taskId: task.id,
              memberId: commentator.id,
              memberDisplayName: commentator.displayName,
              memberAvatar: commentator.avatar,
              content: `Currently working on this task. PR is ready for code review.`,
              createdById: commentator.id
            }
          })
          await prisma.taskAttachment.create({
            data: {
              taskId: task.id,
              fileName: 'architecture_diagram.png',
              fileType: 'image/png',
              fileUrl: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600',
              createdById: commentator.id
            }
          })
        }
      }

      // Link Task Dependencies: Task 2 depends on Task 1, Task 3 depends on Task 2
      if (createdTasksList.length >= 3) {
        await prisma.taskDependency.create({
          data: {
            predecessorId: createdTasksList[0].id,
            successorId: createdTasksList[1].id,
            type: 'FS',
            lag: 0
          }
        })
        await prisma.taskDependency.create({
          data: {
            predecessorId: createdTasksList[1].id,
            successorId: createdTasksList[2].id,
            type: 'FS',
            lag: 1
          }
        })
      }
    }

    const pChat = await prisma.projectChat.create({
      data: {
        projectId: proj.id,
        lastMessage: 'Let us sync on today sprint goals and blockers.',
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
        message: `Welcome team to ${proj.name}! Check out the active sprint board.`,
        createdById: chatSender.id
      }
    })
  }

  // Generate Notifications
  for (const user of users.slice(0, 5)) {
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: NotificationType.project_invitation,
        title: 'Project Invitation',
        message: 'You have been added as an active member to Sprintos Mobile App project.',
        isRead: false
      }
    })
  }

  console.log(`✅ Generated ${totalSprintsCount} Sprints, ${totalTasksCount} Tasks, Comments & Notifications.`)

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

  console.log('\n👥 TEST USER ACCOUNTS [System Role: USER]:')
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
      ProjectRolesAssigned: `OWNER: 1, CO-OWNER: 1, MEMBER: ${p.members.filter((m) => m.role === RoleName.Member).length}, VIEWER: ${p.members.filter((m) => m.role === RoleName.Viewer).length}`
    }))
  )

  console.log('\n====================================================================================\n')
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Error during unified data seeding:', err)
  process.exit(1)
})
