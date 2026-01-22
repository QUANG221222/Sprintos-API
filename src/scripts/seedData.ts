/* eslint-disable quotes */
/* eslint-disable no-console */
import { CONNECT_DB, GET_DB } from '~/configs/mongodb'
import bcrypt from 'bcryptjs'
import { ObjectId } from 'mongodb'

const seedData = async () => {
  try {
    console.log('🌱 Starting seed data...')

    await CONNECT_DB()
    const db = GET_DB()

    // Clear existing data
    console.log('🧹 Clearing existing data...')
    await db.collection('users').deleteMany({})
    await db.collection('projects').deleteMany({})
    await db.collection('sprints').deleteMany({})
    await db.collection('boardColumns').deleteMany({})
    await db.collection('tasks').deleteMany({})

    // 1. Create Users
    console.log('👤 Creating users...')
    const users = [
      {
        _id: new ObjectId('507f1f77bcf86cd799439011'),
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
        createdAt: Date.now(),
        updatedAt: null
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439012'),
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
        createdAt: Date.now(),
        updatedAt: null
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439013'),
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
        createdAt: Date.now(),
        updatedAt: null
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439014'),
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
        createdAt: Date.now(),
        updatedAt: null
      }
    ]

    await db.collection('users').insertMany(users)
    console.log(`✅ Created ${users.length} users`)

    // 2. Create Projects
    console.log('📁 Creating projects...')
    const projects = [
      {
        _id: new ObjectId('507f1f77bcf86cd799439021'),
        ownerId: new ObjectId('507f1f77bcf86cd799439011'),
        name: 'E-Commerce Platform',
        description:
          'Building a modern e-commerce platform with React and Node.js',
        imageUrl: 'https://picsum.photos/seed/project1/800/400',
        imagePublicId: '',
        members: [
          {
            memberId: new ObjectId('507f1f77bcf86cd799439011'),
            email: 'john.doe@example.com',
            role: 'owner',
            status: 'active',
            inviteToken: '',
            joinAt: Date.now(),
            invitedAt: Date.now()
          },
          {
            memberId: new ObjectId('507f1f77bcf86cd799439012'),
            email: 'jane.smith@example.com',
            role: 'member',
            status: 'active',
            inviteToken: '',
            joinAt: Date.now(),
            invitedAt: Date.now()
          },
          {
            memberId: new ObjectId('507f1f77bcf86cd799439013'),
            email: 'mike.wilson@example.com',
            role: 'member',
            status: 'active',
            inviteToken: '',
            joinAt: Date.now(),
            invitedAt: Date.now()
          }
        ],
        createdAt: Date.now(),
        updatedAt: null
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439022'),
        ownerId: new ObjectId('507f1f77bcf86cd799439012'),
        name: 'Mobile Banking App',
        description: 'Secure mobile banking application for iOS and Android',
        imageUrl: 'https://picsum.photos/seed/project2/800/400',
        imagePublicId: '',
        members: [
          {
            memberId: new ObjectId('507f1f77bcf86cd799439012'),
            email: 'jane.smith@example.com',
            role: 'owner',
            status: 'active',
            inviteToken: '',
            joinAt: Date.now(),
            invitedAt: Date.now()
          },
          {
            memberId: new ObjectId('507f1f77bcf86cd799439011'),
            email: 'john.doe@example.com',
            role: 'member',
            status: 'active',
            inviteToken: '',
            joinAt: Date.now(),
            invitedAt: Date.now()
          },
          {
            memberId: new ObjectId('507f1f77bcf86cd799439014'),
            email: 'sarah.jones@example.com',
            role: 'viewer',
            status: 'active',
            inviteToken: '',
            joinAt: Date.now(),
            invitedAt: Date.now()
          }
        ],
        createdAt: Date.now(),
        updatedAt: null
      }
    ]

    await db.collection('projects').insertMany(projects)
    console.log(`✅ Created ${projects.length} projects`)

    // 3. Create Sprints
    console.log('🏃 Creating sprints...')
    const now = Date.now()
    const oneWeek = 7 * 24 * 60 * 60 * 1000
    const twoWeeks = 14 * 24 * 60 * 60 * 1000

    const sprints = [
      {
        _id: new ObjectId('507f1f77bcf86cd799439031'),
        projectId: new ObjectId('507f1f77bcf86cd799439021'),
        name: 'Sprint 1 - Foundation',
        goal: 'Set up project foundation and basic infrastructure',
        maxStoryPoint: 50,
        startDate: now - twoWeeks,
        endDate: now,
        status: 'completed',
        createdAt: now - twoWeeks,
        updatedAt: now
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439032'),
        projectId: new ObjectId('507f1f77bcf86cd799439021'),
        name: 'Sprint 2 - Core Features',
        goal: 'Implement core e-commerce features',
        maxStoryPoint: 65,
        startDate: now,
        endDate: now + twoWeeks,
        status: 'active',
        createdAt: now,
        updatedAt: null
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439033'),
        projectId: new ObjectId('507f1f77bcf86cd799439021'),
        name: 'Sprint 3 - Payment Integration',
        goal: 'Integrate payment gateways and checkout process',
        maxStoryPoint: 55,
        startDate: now + twoWeeks,
        endDate: now + twoWeeks * 2,
        status: 'planned',
        createdAt: now,
        updatedAt: null
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439034'),
        projectId: new ObjectId('507f1f77bcf86cd799439022'),
        name: 'Sprint 1 - Authentication',
        goal: 'Implement secure authentication system',
        maxStoryPoint: 40,
        startDate: now,
        endDate: now + twoWeeks,
        status: 'active',
        createdAt: now,
        updatedAt: null
      }
    ]

    await db.collection('sprints').insertMany(sprints)
    console.log(`✅ Created ${sprints.length} sprints`)

    // 4. Create Board Columns
    console.log('📋 Creating board columns...')
    const boardColumns = []
    const columnTitles = ['backlog', 'todo', 'in_process', 'review', 'done']
    let columnIdCounter = 1

    for (const sprint of sprints) {
      for (const title of columnTitles) {
        boardColumns.push({
          _id: new ObjectId(`507f1f77bcf86cd7994390${40 + columnIdCounter}`),
          sprintId: sprint._id,
          title: title,
          taskOrderIds: [],
          createdAt: Date.now(),
          updatedAt: null
        })
        columnIdCounter++
      }
    }

    await db.collection('boardColumns').insertMany(boardColumns)
    console.log(`✅ Created ${boardColumns.length} board columns`)

    // 5. Create Tasks
    console.log('📝 Creating tasks...')

    // Get board column IDs for Sprint 2 (active sprint)
    const sprint2Columns = boardColumns.filter(
      (col) => col.sprintId.toString() === '507f1f77bcf86cd799439032'
    )

    const backlogCol = sprint2Columns.find((c) => c.title === 'backlog')
    const todoCol = sprint2Columns.find((c) => c.title === 'todo')
    const inProcessCol = sprint2Columns.find((c) => c.title === 'in_process')
    const reviewCol = sprint2Columns.find((c) => c.title === 'review')
    const doneCol = sprint2Columns.find((c) => c.title === 'done')

    const tasks = [
      // Backlog tasks
      {
        _id: new ObjectId('507f1f77bcf86cd799439101'),
        sprintId: new ObjectId('507f1f77bcf86cd799439032'),
        boardColumnId: backlogCol!._id,
        title: 'Design product catalog UI',
        description:
          'Create wireframes and mockups for the product catalog page with filters and search functionality',
        labels: 'feature',
        priority: 'medium',
        storyPoint: 8,
        dueDate: now + oneWeek,
        assigneeIds: [new ObjectId('507f1f77bcf86cd799439012')],
        comments: [],
        attachments: [],
        createdAt: now - 5 * 24 * 60 * 60 * 1000,
        updatedAt: null
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439102'),
        sprintId: new ObjectId('507f1f77bcf86cd799439032'),
        boardColumnId: backlogCol!._id,
        title: 'Implement product recommendations',
        description:
          'Add AI-powered product recommendation system based on user behavior',
        labels: 'feature',
        priority: 'low',
        storyPoint: 13,
        dueDate: now + 10 * 24 * 60 * 60 * 1000,
        assigneeIds: [],
        comments: [],
        attachments: [],
        createdAt: now - 4 * 24 * 60 * 60 * 1000,
        updatedAt: null
      },

      // Todo tasks
      {
        _id: new ObjectId('507f1f77bcf86cd799439103'),
        sprintId: new ObjectId('507f1f77bcf86cd799439032'),
        boardColumnId: todoCol!._id,
        title: 'Set up product database schema',
        description:
          'Design and implement MongoDB schema for products, categories, and inventory',
        labels: 'task',
        priority: 'high',
        storyPoint: 5,
        dueDate: now + 2 * 24 * 60 * 60 * 1000,
        assigneeIds: [new ObjectId('507f1f77bcf86cd799439011')],
        comments: [
          {
            memberId: new ObjectId('507f1f77bcf86cd799439012'),
            memberDisplayName: 'Jane Smith',
            memberAvatar: 'https://i.pravatar.cc/150?img=5',
            content: 'Make sure to include indexes for search optimization',
            createdAt: now - 2 * 60 * 60 * 1000
          }
        ],
        attachments: [],
        createdAt: now - 3 * 24 * 60 * 60 * 1000,
        updatedAt: now - 2 * 60 * 60 * 1000
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439104'),
        sprintId: new ObjectId('507f1f77bcf86cd799439032'),
        boardColumnId: todoCol!._id,
        title: 'Create shopping cart API endpoints',
        description: 'Implement RESTful API for add/remove/update cart items',
        labels: 'feature',
        priority: 'high',
        storyPoint: 8,
        dueDate: now + 3 * 24 * 60 * 60 * 1000,
        assigneeIds: [new ObjectId('507f1f77bcf86cd799439013')],
        comments: [],
        attachments: [],
        createdAt: now - 3 * 24 * 60 * 60 * 1000,
        updatedAt: null
      },

      // In Process tasks
      {
        _id: new ObjectId('507f1f77bcf86cd799439105'),
        sprintId: new ObjectId('507f1f77bcf86cd799439032'),
        boardColumnId: inProcessCol!._id,
        title: 'Implement user authentication system',
        description:
          'Set up JWT-based authentication with refresh tokens and secure password hashing',
        labels: 'feature',
        priority: 'critical',
        storyPoint: 13,
        dueDate: now + 1 * 24 * 60 * 60 * 1000,
        assigneeIds: [new ObjectId('507f1f77bcf86cd799439011')],
        comments: [
          {
            memberId: new ObjectId('507f1f77bcf86cd799439011'),
            memberDisplayName: 'John Doe',
            memberAvatar: 'https://i.pravatar.cc/150?img=12',
            content:
              'Working on the JWT implementation, almost done with access tokens',
            createdAt: now - 4 * 60 * 60 * 1000
          },
          {
            memberId: new ObjectId('507f1f77bcf86cd799439012'),
            memberDisplayName: 'Jane Smith',
            memberAvatar: 'https://i.pravatar.cc/150?img=5',
            content:
              "Great! Don't forget to implement rate limiting for login attempts",
            createdAt: now - 3 * 60 * 60 * 1000
          }
        ],
        attachments: [
          {
            fileName: 'auth-flow-diagram.png',
            fileType: 'image/png',
            fileUrl: 'https://picsum.photos/seed/auth/600/400',
            createdAt: now - 5 * 60 * 60 * 1000
          }
        ],
        createdAt: now - 2 * 24 * 60 * 60 * 1000,
        updatedAt: now - 3 * 60 * 60 * 1000
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439106'),
        sprintId: new ObjectId('507f1f77bcf86cd799439032'),
        boardColumnId: inProcessCol!._id,
        title: 'Build product search functionality',
        description:
          'Implement full-text search with filters for price, category, and ratings',
        labels: 'feature',
        priority: 'high',
        storyPoint: 8,
        dueDate: now + 2 * 24 * 60 * 60 * 1000,
        assigneeIds: [new ObjectId('507f1f77bcf86cd799439013')],
        comments: [
          {
            memberId: new ObjectId('507f1f77bcf86cd799439013'),
            memberDisplayName: 'Mike Wilson',
            memberAvatar: 'https://i.pravatar.cc/150?img=33',
            content: 'Implemented basic search, now working on filters',
            createdAt: now - 6 * 60 * 60 * 1000
          }
        ],
        attachments: [],
        createdAt: now - 2 * 24 * 60 * 60 * 1000,
        updatedAt: now - 6 * 60 * 60 * 1000
      },

      // Review tasks
      {
        _id: new ObjectId('507f1f77bcf86cd799439107'),
        sprintId: new ObjectId('507f1f77bcf86cd799439032'),
        boardColumnId: reviewCol!._id,
        title: 'Fix product image upload bug',
        description:
          'Images larger than 5MB are not being uploaded correctly to Cloudinary',
        labels: 'bug',
        priority: 'high',
        storyPoint: 3,
        dueDate: now + 1 * 24 * 60 * 60 * 1000,
        assigneeIds: [new ObjectId('507f1f77bcf86cd799439012')],
        comments: [
          {
            memberId: new ObjectId('507f1f77bcf86cd799439012'),
            memberDisplayName: 'Jane Smith',
            memberAvatar: 'https://i.pravatar.cc/150?img=5',
            content:
              'Fixed the issue, now compressing images before upload. Ready for review.',
            createdAt: now - 2 * 60 * 60 * 1000
          },
          {
            memberId: new ObjectId('507f1f77bcf86cd799439011'),
            memberDisplayName: 'John Doe',
            memberAvatar: 'https://i.pravatar.cc/150?img=12',
            content: 'Looks good! Testing it now.',
            createdAt: now - 1 * 60 * 60 * 1000
          }
        ],
        attachments: [
          {
            fileName: 'test-results.pdf',
            fileType: 'application/pdf',
            fileUrl: 'https://example.com/test-results.pdf',
            createdAt: now - 2 * 60 * 60 * 1000
          }
        ],
        createdAt: now - 1 * 24 * 60 * 60 * 1000,
        updatedAt: now - 1 * 60 * 60 * 1000
      },

      // Done tasks
      {
        _id: new ObjectId('507f1f77bcf86cd799439108'),
        sprintId: new ObjectId('507f1f77bcf86cd799439032'),
        boardColumnId: doneCol!._id,
        title: 'Set up project repository and CI/CD',
        description:
          'Initialize Git repository, set up GitHub Actions for automated testing and deployment',
        labels: 'task',
        priority: 'high',
        storyPoint: 5,
        dueDate: now - 1 * 24 * 60 * 60 * 1000,
        assigneeIds: [new ObjectId('507f1f77bcf86cd799439011')],
        comments: [
          {
            memberId: new ObjectId('507f1f77bcf86cd799439011'),
            memberDisplayName: 'John Doe',
            memberAvatar: 'https://i.pravatar.cc/150?img=12',
            content: 'CI/CD pipeline is up and running!',
            createdAt: now - 12 * 60 * 60 * 1000
          }
        ],
        attachments: [
          {
            fileName: 'ci-cd-config.yml',
            fileType: 'text/yaml',
            fileUrl: 'https://example.com/ci-cd-config.yml',
            createdAt: now - 12 * 60 * 60 * 1000
          }
        ],
        createdAt: now - 5 * 24 * 60 * 60 * 1000,
        updatedAt: now - 12 * 60 * 60 * 1000
      },
      {
        _id: new ObjectId('507f1f77bcf86cd799439109'),
        sprintId: new ObjectId('507f1f77bcf86cd799439032'),
        boardColumnId: doneCol!._id,
        title: 'Create database models and schemas',
        description:
          'Define Mongoose models for User, Product, Order, and other entities',
        labels: 'task',
        priority: 'high',
        storyPoint: 8,
        dueDate: now - 2 * 24 * 60 * 60 * 1000,
        assigneeIds: [new ObjectId('507f1f77bcf86cd799439013')],
        comments: [],
        attachments: [],
        createdAt: now - 5 * 24 * 60 * 60 * 1000,
        updatedAt: now - 2 * 24 * 60 * 60 * 1000
      }
    ]

    await db.collection('tasks').insertMany(tasks)
    console.log(`✅ Created ${tasks.length} tasks`)

    // Update board columns with taskOrderIds
    console.log('🔄 Updating board columns with task orders...')

    if (backlogCol) {
      await db.collection('boardColumns').updateOne(
        { _id: backlogCol._id },
        {
          $set: {
            taskOrderIds: [
              '507f1f77bcf86cd799439101',
              '507f1f77bcf86cd799439102'
            ]
          }
        }
      )
    }

    if (todoCol) {
      await db.collection('boardColumns').updateOne(
        { _id: todoCol._id },
        {
          $set: {
            taskOrderIds: [
              '507f1f77bcf86cd799439103',
              '507f1f77bcf86cd799439104'
            ]
          }
        }
      )
    }

    if (inProcessCol) {
      await db.collection('boardColumns').updateOne(
        { _id: inProcessCol._id },
        {
          $set: {
            taskOrderIds: [
              '507f1f77bcf86cd799439105',
              '507f1f77bcf86cd799439106'
            ]
          }
        }
      )
    }

    if (reviewCol) {
      await db
        .collection('boardColumns')
        .updateOne(
          { _id: reviewCol._id },
          { $set: { taskOrderIds: ['507f1f77bcf86cd799439107'] } }
        )
    }

    if (doneCol) {
      await db.collection('boardColumns').updateOne(
        { _id: doneCol._id },
        {
          $set: {
            taskOrderIds: [
              '507f1f77bcf86cd799439108',
              '507f1f77bcf86cd799439109'
            ]
          }
        }
      )
    }

    console.log('✅ Updated board columns')

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
    process.exit(0)
  } catch (error) {
    console.error('❌ Error seeding data:', error)
    process.exit(1)
  }
}

seedData()
