/* eslint-disable quotes */
/* eslint-disable no-console */
import { CONNECT_DB, GET_DB } from '~/configs/mongodb'
import bcrypt from 'bcryptjs'
import { ObjectId, Db } from 'mongodb'

// ==================== CONSTANTS ====================
const COLLECTIONS = {
  USERS: 'users',
  PROJECTS: 'projects',
  SPRINTS: 'sprints',
  BOARD_COLUMNS: 'boardColumns',
  TASKS: 'tasks',
  NOTIFICATIONS: 'notifications',
  PROJECT_CHATS: 'project_chats'
} as const

const TIME = {
  NOW: Date.now(),
  ONE_DAY: 24 * 60 * 60 * 1000,
  ONE_WEEK: 7 * 24 * 60 * 60 * 1000,
  TWO_WEEKS: 14 * 24 * 60 * 60 * 1000
} as const

const USER_IDS = {
  JOHN: new ObjectId('507f1f77bcf86cd799439011'),
  JANE: new ObjectId('507f1f77bcf86cd799439012'),
  MIKE: new ObjectId('507f1f77bcf86cd799439013'),
  SARAH: new ObjectId('507f1f77bcf86cd799439014')
} as const

const PROJECT_IDS = {
  ECOMMERCE: new ObjectId('507f1f77bcf86cd799439021'),
  BANKING: new ObjectId('507f1f77bcf86cd799439022')
} as const

const SPRINT_IDS = {
  ECOMMERCE_S1: new ObjectId('507f1f77bcf86cd799439031'),
  ECOMMERCE_S2: new ObjectId('507f1f77bcf86cd799439032'),
  ECOMMERCE_S3: new ObjectId('507f1f77bcf86cd799439033'),
  BANKING_S1: new ObjectId('507f1f77bcf86cd799439034')
} as const

const BOARD_COLUMN_TITLES = [
  'backlog',
  'todo',
  'in_process',
  'review',
  'done'
] as const

// ==================== DATA GENERATORS ====================

/**
 * Generate user data
 */
const generateUsers = () => [
  {
    _id: USER_IDS.JOHN,
    email: 'john.doe@example.com',
    password: bcrypt.hashSync('Password@123', 8),
    displayName: 'John Doe',
    role: 'user',
    isActive: true,
    gender: 'male',
    dob: new Date('1990-01-15').getTime(),
    address: '123 Main St, New York, NY',
    avatar: 'https://i.pravatar.cc/150?img=12',
    avatarPublicId: null,
    createdAt: TIME.NOW,
    updatedAt: null
  },
  {
    _id: USER_IDS.JANE,
    email: 'jane.smith@example.com',
    password: bcrypt.hashSync('Password@123', 8),
    displayName: 'Jane Smith',
    role: 'user',
    isActive: true,
    gender: 'female',
    dob: new Date('1992-05-20').getTime(),
    address: '456 Oak Ave, San Francisco, CA',
    avatar: 'https://i.pravatar.cc/150?img=5',
    avatarPublicId: null,
    createdAt: TIME.NOW,
    updatedAt: null
  },
  {
    _id: USER_IDS.MIKE,
    email: 'mike.wilson@example.com',
    password: bcrypt.hashSync('Password@123', 8),
    displayName: 'Mike Wilson',
    role: 'user',
    isActive: true,
    gender: 'male',
    dob: new Date('1988-11-30').getTime(),
    address: '789 Pine Rd, Austin, TX',
    avatar: 'https://i.pravatar.cc/150?img=33',
    avatarPublicId: null,
    createdAt: TIME.NOW,
    updatedAt: null
  },
  {
    _id: USER_IDS.SARAH,
    email: 'sarah.jones@example.com',
    password: bcrypt.hashSync('Password@123', 8),
    displayName: 'Sarah Jones',
    role: 'user',
    isActive: true,
    gender: 'female',
    dob: new Date('1995-03-12').getTime(),
    address: '321 Elm St, Seattle, WA',
    avatar: 'https://i.pravatar.cc/150?img=9',
    avatarPublicId: null,
    createdAt: TIME.NOW,
    updatedAt: null
  }
]

/**
 * Generate project data
 */
const generateProjects = () => [
  {
    _id: PROJECT_IDS.ECOMMERCE,
    ownerId: USER_IDS.JOHN,
    name: 'E-Commerce Platform',
    description:
      'Building a modern e-commerce platform with React and Node.js',
    imageUrl: 'https://picsum.photos/seed/project1/800/400',
    imagePublicId: '',
    members: [
      {
        memberId: USER_IDS.JOHN,
        email: 'john.doe@example.com',
        role: 'owner',
        status: 'active',
        inviteToken: '',
        joinAt: TIME.NOW,
        invitedAt: TIME.NOW
      },
      {
        memberId: USER_IDS.JANE,
        email: 'jane.smith@example.com',
        role: 'member',
        status: 'active',
        inviteToken: '',
        joinAt: TIME.NOW,
        invitedAt: TIME.NOW
      },
      {
        memberId: USER_IDS.MIKE,
        email: 'mike.wilson@example.com',
        role: 'member',
        status: 'active',
        inviteToken: '',
        joinAt: TIME.NOW,
        invitedAt: TIME.NOW
      }
    ],
    createdAt: TIME.NOW,
    updatedAt: null
  },
  {
    _id: PROJECT_IDS.BANKING,
    ownerId: USER_IDS.JANE,
    name: 'Mobile Banking App',
    description: 'Secure mobile banking application for iOS and Android',
    imageUrl: 'https://picsum.photos/seed/project2/800/400',
    imagePublicId: '',
    members: [
      {
        memberId: USER_IDS.JANE,
        email: 'jane.smith@example.com',
        role: 'owner',
        status: 'active',
        inviteToken: '',
        joinAt: TIME.NOW,
        invitedAt: TIME.NOW
      },
      {
        memberId: USER_IDS.JOHN,
        email: 'john.doe@example.com',
        role: 'member',
        status: 'active',
        inviteToken: '',
        joinAt: TIME.NOW,
        invitedAt: TIME.NOW
      },
      {
        memberId: USER_IDS.SARAH,
        email: 'sarah.jones@example.com',
        role: 'viewer',
        status: 'active',
        inviteToken: '',
        joinAt: TIME.NOW,
        invitedAt: TIME.NOW
      }
    ],
    createdAt: TIME.NOW,
    updatedAt: null
  }
]

/**
 * Generate sprint data
 */
const generateSprints = () => [
  {
    _id: SPRINT_IDS.ECOMMERCE_S1,
    projectId: PROJECT_IDS.ECOMMERCE,
    name: 'Sprint 1 - Foundation',
    goal: 'Set up project foundation and basic infrastructure',
    maxStoryPoint: 50,
    startDate: TIME.NOW - TIME.TWO_WEEKS,
    endDate: TIME.NOW,
    status: 'completed',
    createdAt: TIME.NOW - TIME.TWO_WEEKS,
    updatedAt: TIME.NOW
  },
  {
    _id: SPRINT_IDS.ECOMMERCE_S2,
    projectId: PROJECT_IDS.ECOMMERCE,
    name: 'Sprint 2 - Core Features',
    goal: 'Implement core e-commerce features',
    maxStoryPoint: 65,
    startDate: TIME.NOW,
    endDate: TIME.NOW + TIME.TWO_WEEKS,
    status: 'active',
    createdAt: TIME.NOW,
    updatedAt: null
  },
  {
    _id: SPRINT_IDS.ECOMMERCE_S3,
    projectId: PROJECT_IDS.ECOMMERCE,
    name: 'Sprint 3 - Payment Integration',
    goal: 'Integrate payment gateways and checkout process',
    maxStoryPoint: 55,
    startDate: TIME.NOW + TIME.TWO_WEEKS,
    endDate: TIME.NOW + TIME.TWO_WEEKS * 2,
    status: 'planned',
    createdAt: TIME.NOW,
    updatedAt: null
  },
  {
    _id: SPRINT_IDS.BANKING_S1,
    projectId: PROJECT_IDS.BANKING,
    name: 'Sprint 1 - Authentication',
    goal: 'Implement secure authentication system',
    maxStoryPoint: 40,
    startDate: TIME.NOW,
    endDate: TIME.NOW + TIME.TWO_WEEKS,
    status: 'active',
    createdAt: TIME.NOW,
    updatedAt: null
  }
]

/**
 * Generate board columns for all sprints
 */
const generateBoardColumns = (sprints: any[]) => {
  const boardColumns = []
  let columnIdCounter = 1

  for (const sprint of sprints) {
    for (const title of BOARD_COLUMN_TITLES) {
      boardColumns.push({
        _id: new ObjectId(`507f1f77bcf86cd7994390${40 + columnIdCounter}`),
        sprintId: sprint._id,
        title: title,
        taskOrderIds: [],
        createdAt: TIME.NOW,
        updatedAt: null
      })
      columnIdCounter++
    }
  }

  return boardColumns
}

/**
 * Generate tasks for Sprint 2
 */
const generateTasks = (boardColumns: any[]) => {
  // Get board column IDs for Sprint 2 (active sprint)
  const sprint2Columns = boardColumns.filter(
    (col) => col.sprintId.toString() === SPRINT_IDS.ECOMMERCE_S2.toString()
  )

  const backlogCol = sprint2Columns.find((c) => c.title === 'backlog')
  const todoCol = sprint2Columns.find((c) => c.title === 'todo')
  const inProcessCol = sprint2Columns.find((c) => c.title === 'in_process')
  const reviewCol = sprint2Columns.find((c) => c.title === 'review')
  const doneCol = sprint2Columns.find((c) => c.title === 'done')

  return {
    tasks: [
      // ========== BACKLOG TASKS ==========
      {
        _id: new ObjectId('507f1f77bcf86cd799439101'),
        sprintId: SPRINT_IDS.ECOMMERCE_S2,
        boardColumnId: backlogCol!._id,
        title: 'Design product catalog UI',
        description:
          'Create wireframes and mockups for the product catalog page with filters and search functionality',
        labels: 'feature',
        priority: 'medium',
        storyPoint: 8,
        dueDate: TIME.NOW + TIME.ONE_WEEK,
        assigneeIds: [USER_IDS.JANE],
        comments: [],
        attachments: [],
        createdAt: TIME.NOW - 5 * TIME.ONE_DAY,
        updatedAt: null
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439102'),
        sprintId: SPRINT_IDS.ECOMMERCE_S2,
        boardColumnId: backlogCol!._id,
        title: 'Implement product recommendations',
        description:
          'Add AI-powered product recommendation system based on user behavior',
        labels: 'feature',
        priority: 'low',
        storyPoint: 13,
        dueDate: TIME.NOW + 10 * TIME.ONE_DAY,
        assigneeIds: [],
        comments: [],
        attachments: [],
        createdAt: TIME.NOW - 4 * TIME.ONE_DAY,
        updatedAt: null
      },

      // ========== TODO TASKS ==========
      {
        _id: new ObjectId('507f1f77bcf86cd799439103'),
        sprintId: SPRINT_IDS.ECOMMERCE_S2,
        boardColumnId: todoCol!._id,
        title: 'Set up product database schema',
        description:
          'Design and implement MongoDB schema for products, categories, and inventory',
        labels: 'task',
        priority: 'high',
        storyPoint: 5,
        dueDate: TIME.NOW + 2 * TIME.ONE_DAY,
        assigneeIds: [USER_IDS.JOHN],
        comments: [
          {
            memberId: USER_IDS.JANE,
            memberDisplayName: 'Jane Smith',
            memberAvatar: 'https://i.pravatar.cc/150?img=5',
            content: 'Make sure to include indexes for search optimization',
            createdAt: TIME.NOW - 2 * 60 * 60 * 1000
          }
        ],
        attachments: [],
        createdAt: TIME.NOW - 3 * TIME.ONE_DAY,
        updatedAt: TIME.NOW - 2 * 60 * 60 * 1000
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439104'),
        sprintId: SPRINT_IDS.ECOMMERCE_S2,
        boardColumnId: todoCol!._id,
        title: 'Create shopping cart API endpoints',
        description: 'Implement RESTful API for add/remove/update cart items',
        labels: 'feature',
        priority: 'high',
        storyPoint: 8,
        dueDate: TIME.NOW + 3 * TIME.ONE_DAY,
        assigneeIds: [USER_IDS.MIKE],
        comments: [],
        attachments: [],
        createdAt: TIME.NOW - 3 * TIME.ONE_DAY,
        updatedAt: null
      },

      // ========== IN PROCESS TASKS ==========
      {
        _id: new ObjectId('507f1f77bcf86cd799439105'),
        sprintId: SPRINT_IDS.ECOMMERCE_S2,
        boardColumnId: inProcessCol!._id,
        title: 'Implement user authentication system',
        description:
          'Set up JWT-based authentication with refresh tokens and secure password hashing',
        labels: 'feature',
        priority: 'critical',
        storyPoint: 13,
        dueDate: TIME.NOW + TIME.ONE_DAY,
        assigneeIds: [USER_IDS.JOHN],
        comments: [
          {
            memberId: USER_IDS.JOHN,
            memberDisplayName: 'John Doe',
            memberAvatar: 'https://i.pravatar.cc/150?img=12',
            content:
              'Working on the JWT implementation, almost done with access tokens',
            createdAt: TIME.NOW - 4 * 60 * 60 * 1000
          },
          {
            memberId: USER_IDS.JANE,
            memberDisplayName: 'Jane Smith',
            memberAvatar: 'https://i.pravatar.cc/150?img=5',
            content:
              "Great! Don't forget to implement rate limiting for login attempts",
            createdAt: TIME.NOW - 3 * 60 * 60 * 1000
          }
        ],
        attachments: [
          {
            fileName: 'auth-flow-diagram.png',
            fileType: 'image/png',
            fileUrl: 'https://picsum.photos/seed/auth/600/400',
            createdAt: TIME.NOW - 5 * 60 * 60 * 1000
          }
        ],
        createdAt: TIME.NOW - 2 * TIME.ONE_DAY,
        updatedAt: TIME.NOW - 3 * 60 * 60 * 1000
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439106'),
        sprintId: SPRINT_IDS.ECOMMERCE_S2,
        boardColumnId: inProcessCol!._id,
        title: 'Build product search functionality',
        description:
          'Implement full-text search with filters for price, category, and ratings',
        labels: 'feature',
        priority: 'high',
        storyPoint: 8,
        dueDate: TIME.NOW + 2 * TIME.ONE_DAY,
        assigneeIds: [USER_IDS.MIKE],
        comments: [
          {
            memberId: USER_IDS.MIKE,
            memberDisplayName: 'Mike Wilson',
            memberAvatar: 'https://i.pravatar.cc/150?img=33',
            content: 'Implemented basic search, now working on filters',
            createdAt: TIME.NOW - 6 * 60 * 60 * 1000
          }
        ],
        attachments: [],
        createdAt: TIME.NOW - 2 * TIME.ONE_DAY,
        updatedAt: TIME.NOW - 6 * 60 * 60 * 1000
      },

      // ========== REVIEW TASKS ==========
      {
        _id: new ObjectId('507f1f77bcf86cd799439107'),
        sprintId: SPRINT_IDS.ECOMMERCE_S2,
        boardColumnId: reviewCol!._id,
        title: 'Fix product image upload bug',
        description:
          'Images larger than 5MB are not being uploaded correctly to Cloudinary',
        labels: 'bug',
        priority: 'high',
        storyPoint: 3,
        dueDate: TIME.NOW + TIME.ONE_DAY,
        assigneeIds: [USER_IDS.JANE],
        comments: [
          {
            memberId: USER_IDS.JANE,
            memberDisplayName: 'Jane Smith',
            memberAvatar: 'https://i.pravatar.cc/150?img=5',
            content:
              'Fixed the issue, now compressing images before upload. Ready for review.',
            createdAt: TIME.NOW - 2 * 60 * 60 * 1000
          },
          {
            memberId: USER_IDS.JOHN,
            memberDisplayName: 'John Doe',
            memberAvatar: 'https://i.pravatar.cc/150?img=12',
            content: 'Looks good! Testing it now.',
            createdAt: TIME.NOW - 1 * 60 * 60 * 1000
          }
        ],
        attachments: [
          {
            fileName: 'test-results.pdf',
            fileType: 'application/pdf',
            fileUrl: 'https://example.com/test-results.pdf',
            createdAt: TIME.NOW - 2 * 60 * 60 * 1000
          }
        ],
        createdAt: TIME.NOW - TIME.ONE_DAY,
        updatedAt: TIME.NOW - 1 * 60 * 60 * 1000
      },

      // ========== DONE TASKS ==========
      {
        _id: new ObjectId('507f1f77bcf86cd799439108'),
        sprintId: SPRINT_IDS.ECOMMERCE_S2,
        boardColumnId: doneCol!._id,
        title: 'Set up project repository and CI/CD',
        description:
          'Initialize Git repository, set up GitHub Actions for automated testing and deployment',
        labels: 'task',
        priority: 'high',
        storyPoint: 5,
        dueDate: TIME.NOW - TIME.ONE_DAY,
        assigneeIds: [USER_IDS.JOHN],
        comments: [
          {
            memberId: USER_IDS.JOHN,
            memberDisplayName: 'John Doe',
            memberAvatar: 'https://i.pravatar.cc/150?img=12',
            content: 'CI/CD pipeline is up and running!',
            createdAt: TIME.NOW - 12 * 60 * 60 * 1000
          }
        ],
        attachments: [
          {
            fileName: 'ci-cd-config.yml',
            fileType: 'text/yaml',
            fileUrl: 'https://example.com/ci-cd-config.yml',
            createdAt: TIME.NOW - 12 * 60 * 60 * 1000
          }
        ],
        createdAt: TIME.NOW - 5 * TIME.ONE_DAY,
        updatedAt: TIME.NOW - 12 * 60 * 60 * 1000
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439109'),
        sprintId: SPRINT_IDS.ECOMMERCE_S2,
        boardColumnId: doneCol!._id,
        title: 'Create database models and schemas',
        description:
          'Define Mongoose models for User, Product, Order, and other entities',
        labels: 'task',
        priority: 'high',
        storyPoint: 8,
        dueDate: TIME.NOW - 2 * TIME.ONE_DAY,
        assigneeIds: [USER_IDS.MIKE],
        comments: [],
        attachments: [],
        createdAt: TIME.NOW - 5 * TIME.ONE_DAY,
        updatedAt: TIME.NOW - 2 * TIME.ONE_DAY
      }
    ],
    columnMapping: {
      backlogCol,
      todoCol,
      inProcessCol,
      reviewCol,
      doneCol
    }
  }
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Clear all collections
 */
const clearCollections = async (db: Db) => {
  console.log('🧹 Clearing existing data...')
  await Promise.all([
    db.collection(COLLECTIONS.USERS).deleteMany({}),
    db.collection(COLLECTIONS.PROJECTS).deleteMany({}),
    db.collection(COLLECTIONS.SPRINTS).deleteMany({}),
    db.collection(COLLECTIONS.BOARD_COLUMNS).deleteMany({}),
    db.collection(COLLECTIONS.TASKS).deleteMany({})
  ])
}

/**
 * Update board columns with task order IDs
 */
const updateBoardColumnsWithTasks = async (
  db: Db,
  columnMapping: any
) => {
  console.log('🔄 Updating board columns with task orders...')

  const updates = [
    {
      column: columnMapping.backlogCol,
      taskIds: ['507f1f77bcf86cd799439101', '507f1f77bcf86cd799439102']
    },
    {
      column: columnMapping.todoCol,
      taskIds: ['507f1f77bcf86cd799439103', '507f1f77bcf86cd799439104']
    },
    {
      column: columnMapping.inProcessCol,
      taskIds: ['507f1f77bcf86cd799439105', '507f1f77bcf86cd799439106']
    },
    {
      column: columnMapping.reviewCol,
      taskIds: ['507f1f77bcf86cd799439107']
    },
    {
      column: columnMapping.doneCol,
      taskIds: ['507f1f77bcf86cd799439108', '507f1f77bcf86cd799439109']
    }
  ]

  await Promise.all(
    updates.map(({ column, taskIds }) =>
      db
        .collection(COLLECTIONS.BOARD_COLUMNS)
        .updateOne({ _id: column._id }, { $set: { taskOrderIds: taskIds } })
    )
  )
}

/**
 * Print summary
 */
const printSummary = (
  users: any[],
  projects: any[],
  sprints: any[],
  boardColumns: any[],
  tasks: any[]
) => {
  console.log('\n🎉 Seed data completed successfully!')
  console.log('\n📊 Summary:')
  console.log(`   - Users: ${users.length}`)
  console.log(`   - Projects: ${projects.length}`)
  console.log(`   - Sprints: ${sprints.length}`)
  console.log(`   - Board Columns: ${boardColumns.length}`)
  console.log(`   - Tasks: ${tasks.length}`)
  console.log('\n🔑 Test Credentials:')
  console.log('   Email: john.doe@example.com')
  console.log('   Password: Password@123')
  console.log('\n   Email: jane.smith@example.com')
  console.log('   Password: Password@123')
  console.log('\n   Email: mike.wilson@example.com')
  console.log('   Password: Password@123')
  console.log('\n   Email: sarah.jones@example.com')
  console.log('   Password: Password@123')
}

// ==================== MAIN SEED FUNCTION ====================

const seedData = async () => {
  try {
    console.log('🌱 Starting seed data...\n')

    // Connect to database
    await CONNECT_DB()
    const db = GET_DB()

    // Clear existing data
    await clearCollections(db)

    // 1. Create Users
    console.log('👤 Creating users...')
    const users = generateUsers()
    await db.collection(COLLECTIONS.USERS).insertMany(users)
    console.log(`✅ Created ${users.length} users\n`)

    // 2. Create Projects
    console.log('📁 Creating projects...')
    const projects = generateProjects()
    await db.collection(COLLECTIONS.PROJECTS).insertMany(projects)
    console.log(`✅ Created ${projects.length} projects\n`)

    // 3. Create Sprints
    console.log('🏃 Creating sprints...')
    const sprints = generateSprints()
    await db.collection(COLLECTIONS.SPRINTS).insertMany(sprints)
    console.log(`✅ Created ${sprints.length} sprints\n`)

    // 4. Create Board Columns
    console.log('📋 Creating board columns...')
    const boardColumns = generateBoardColumns(sprints)
    await db.collection(COLLECTIONS.BOARD_COLUMNS).insertMany(boardColumns)
    console.log(`✅ Created ${boardColumns.length} board columns\n`)

    // 5. Create Tasks
    console.log('📝 Creating tasks...')
    const { tasks, columnMapping } = generateTasks(boardColumns)
    await db.collection(COLLECTIONS.TASKS).insertMany(tasks)
    console.log(`✅ Created ${tasks.length} tasks\n`)

    // 6. Update Board Columns with Task Order
    await updateBoardColumnsWithTasks(db, columnMapping)
    console.log('✅ Updated board columns\n')

    // Print summary
    printSummary(users, projects, sprints, boardColumns, tasks)

    process.exit(0)
  } catch (error) {
    console.error('❌ Error seeding data:', error)
    process.exit(1)
  }
}

// Run seed data
seedData()
