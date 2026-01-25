# Sprintos API

A robust RESTful API backend for project management and team collaboration, built with Node.js, Express, TypeScript, MongoDB, and Socket.IO for real-time features.

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Documentation](#api-documentation)
- [Real-time Features (Socket.IO)](#real-time-features-socketio)
- [Database Schema](#database-schema)
- [Scripts](#scripts)
- [License](#license)

## ✨ Features

### Core Features

- **User Authentication & Authorization**: JWT-based authentication with access and refresh tokens
- **Project Management**: Create, update, and manage projects with role-based access control (Owner, Member, Viewer)
- **Sprint Planning**: Agile sprint management with customizable sprint goals and story points
- **Task Management**: Comprehensive task tracking with labels, priorities, story points, and due dates
- **Board Columns**: Kanban-style board with customizable columns (Backlog, To Do, In Progress, Review, Done)
- **Team Collaboration**: Invite members, assign roles, and manage project permissions
- **File Uploads**: Cloudinary integration for image and video uploads
- **Email Notifications**: Brevo integration for transactional emails

### Real-time Features

- **Project Chat**: Real-time messaging within project rooms with file attachment support
- **Live Notifications**: Instant notifications for project activities, task assignments, and member updates
- **Typing Indicators**: Real-time typing status in project chats
- **Live Updates**: Real-time synchronization of task updates, sprint changes, and project modifications

## 🛠 Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: MongoDB with native MongoDB driver
- **Real-time Communication**: Socket.IO
- **Authentication**: JWT (jsonwebtoken)
- **Validation**: Joi
- **File Storage**: Cloudinary
- **Email Service**: Brevo (formerly Sendinblue)
- **Security**: bcryptjs, CORS, cookie-parser
- **Rate Limiting**: express-rate-limit
- **Development Tools**: ESLint, Prettier, Nodemon

## 🏗 Architecture

### System Architecture

```
[Add architecture diagram here showing:]
- Client Layer (Web/Mobile Apps)
- API Gateway
- Application Layer (Controllers, Services, Middlewares)
- Real-time Layer (Socket.IO)
- Data Layer (MongoDB, Cloudinary)
- External Services (Brevo Email)
```

**Recommended diagram location**: `docs/images/system-architecture.png`

### Project Structure

```
sprintos-api/
├── src/
│   ├── configs/           # Configuration files
│   │   ├── cloudinary.ts
│   │   ├── cors.ts
│   │   ├── environment.ts
│   │   ├── mongodb.ts
│   │   └── rbac.ts
│   ├── controllers/       # Request handlers
│   ├── middlewares/       # Custom middleware
│   ├── models/            # Database models
│   ├── providers/         # External service providers
│   │   ├── BrevoProvider.ts
│   │   ├── CloudinaryProvider.ts
│   │   └── JwtProvider.ts
│   ├── routes/            # API routes
│   ├── services/          # Business logic
│   ├── sockets/           # Socket.IO event handlers
│   │   ├── index.socket.ts
│   │   ├── notification.socket.ts
│   │   └── projectChat.socket.ts
│   ├── types/             # TypeScript type definitions
│   ├── utils/             # Utility functions
│   ├── validations/       # Request validation schemas
│   └── server.ts          # Application entry point
├── scripts/               # Utility scripts
└── server.ts              # Server bootstrap
```

### Data Flow Architecture

```
[Add data flow diagram here showing:]
- HTTP Request Flow
- WebSocket Connection Flow
- Authentication Flow
- File Upload Flow
```

**Recommended diagram location**: `docs/images/data-flow.png`

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- pnpm (v8 or higher)
- MongoDB (v5 or higher)
- Cloudinary account
- Brevo account

### Installation

1. Clone the repository:

```bash
git clone <https://github.com/QUANG221222/Sprintos-API.git>
cd Sprintos-API
```

2. Install dependencies:

```bash
pnpm install
```

3. Create environment file:

```bash
cp .env.example .env
```

4. Configure environment variables (see [Environment Variables](#environment-variables))

5. Start development server:

```bash
pnpm dev
```

### Seed Database (Optional)

Populate the database with sample data:

```bash
pnpm seed
```

This creates:

- 4 test users
- 2 sample projects
- 4 sprints
- Board columns
- Sample tasks with comments and attachments

**Test Credentials:**

- Email: `john.doe@example.com` | Password: `Password@123`
- Email: `jane.smith@example.com` | Password: `Password@123`

## 🔐 Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
BUILD_MODE=dev
LOCAL_APP_PORT=8080
LOCAL_APP_HOST=localhost
AUTHOR_NAME=Your Name

# Database
MONGODB_URI=mongodb://localhost:27017
DATABASE_NAME=sprintos

# Domain Configuration
WEBSITE_DOMAIN_PRODUCTION=https://your-production-domain.com
WEBSITE_DOMAIN_DEVELOPMENT=http://localhost:3000
COOKIE_DOMAIN=localhost

# Email Service (Brevo)
BREVO_API_KEY=your_brevo_api_key
ADMIN_EMAIL_ADDRESS=admin@yourdomain.com
ADMIN_EMAIL_NAME=Sprintos Team

# JWT Configuration
ACCESS_TOKEN_SECRET_SIGNATURE=your_access_token_secret
REFRESH_TOKEN_SECRET_SIGNATURE=your_refresh_token_secret
ACCESS_TOKEN_LIFE=1h
REFRESH_TOKEN_LIFE=14d

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

## 📡 API Documentation

### Base URL

- Development: `http://localhost:8080/v1`
- Production: `https://your-api-domain.com/v1`

### Authentication Endpoints

| Method | Endpoint                | Description          |
| ------ | ----------------------- | -------------------- |
| POST   | `/auth/register`        | Register new user    |
| POST   | `/auth/verify`          | Verify email address |
| POST   | `/auth/login`           | User login           |
| POST   | `/auth/refresh-token`   | Refresh access token |
| POST   | `/auth/logout`          | User logout          |
| PUT    | `/auth/change-password` | Change password      |

### Project Endpoints

| Method | Endpoint                         | Description                    |
| ------ | -------------------------------- | ------------------------------ |
| POST   | `/projects`                      | Create new project             |
| GET    | `/projects/owned`                | Get user's owned projects      |
| GET    | `/projects/joined`               | Get projects user is member of |
| GET    | `/projects/:id`                  | Get project by ID              |
| PUT    | `/projects/:id`                  | Update project                 |
| DELETE | `/projects/:id`                  | Delete project                 |
| POST   | `/projects/invite`               | Invite member to project       |
| PUT    | `/projects/verify/invite`        | Accept project invitation      |
| PUT    | `/projects/:projectId/:memberId` | Update member role             |
| DELETE | `/projects/:projectId/:memberId` | Remove member                  |

### Sprint Endpoints

| Method | Endpoint                      | Description                |
| ------ | ----------------------------- | -------------------------- |
| POST   | `/sprints`                    | Create new sprint          |
| GET    | `/sprints/:id`                | Get sprint by ID           |
| PUT    | `/sprints/:id`                | Update sprint              |
| DELETE | `/sprints/:id`                | Delete sprint              |
| GET    | `/sprints/project/:projectId` | Get all sprints by project |

### Task Endpoints

| Method | Endpoint                             | Description               |
| ------ | ------------------------------------ | ------------------------- |
| POST   | `/tasks`                             | Create new task           |
| GET    | `/tasks/:id`                         | Get task by ID            |
| PUT    | `/tasks/:id`                         | Update task               |
| DELETE | `/tasks/:id`                         | Delete task               |
| GET    | `/tasks/sprint/:sprintId`            | Get tasks by sprint       |
| GET    | `/tasks/board-column/:boardColumnId` | Get tasks by board column |
| POST   | `/tasks/:id/comments`                | Add comment to task       |
| POST   | `/tasks/:id/attachments`             | Add attachment to task    |

### Notification Endpoints

| Method | Endpoint                     | Description                    |
| ------ | ---------------------------- | ------------------------------ |
| GET    | `/notifications`             | Get user notifications         |
| GET    | `/notifications/project/:id` | Get project notifications      |
| GET    | `/notifications/task/:id`    | Get task notifications         |
| PUT    | `/notifications/:id/read`    | Mark notification as read      |
| PUT    | `/notifications/read-all`    | Mark all notifications as read |

### Project Chat Endpoints

| Method | Endpoint                            | Description         |
| ------ | ----------------------------------- | ------------------- |
| GET    | `/project-chats/project/:projectId` | Get chat by project |
| GET    | `/project-chats/:roomId/messages`   | Get chat messages   |
| DELETE | `/project-chats/:roomId`            | Delete chat room    |

## 🔌 Real-time Features (Socket.IO)

### Socket.IO Architecture

```
[Add Socket.IO architecture diagram here showing:]
- Client Connection Flow
- Room-based Communication
- Event Broadcasting
- Namespace Organization
```

**Recommended diagram location**: `docs/images/socketio-architecture.png`

### Connection Setup

```javascript
import io from 'socket.io-client'

const socket = io('http://localhost:8080', {
  withCredentials: true,
  transports: ['websocket', 'polling']
})
```

### Project Chat Events

#### Client → Server Events

**Join Project Chat Room**

```javascript
socket.emit('join_project_chat', roomId)
```

**Send Message**

```javascript
socket.emit('send_message', {
  roomId: string,
  senderId: string,
  senderName: string,
  senderRole: string,
  senderAvatarUrl?: string,
  message?: string,
  file?: {
    base64: string,
    fileName: string,
    fileType: string,
    fileSize: number
  }
});
```

**Delete Message**

```javascript
socket.emit('delete_message', {
  roomId: string,
  messageId: string
})
```

**Typing Indicator**

```javascript
// Start typing
socket.emit('typing', {
  roomId: string,
  userId: string,
  userName: string
})

// Stop typing
socket.emit('stop_typing', {
  roomId: string,
  userId: string
})
```

**Leave Project Chat**

```javascript
socket.emit('leave_project_chat', roomId)
```

#### Server → Client Events

**New Message Received**

```javascript
socket.on('new_message', (message) => {
  // message: {
  //   _id: ObjectId,
  //   senderId: ObjectId,
  //   senderName: string,
  //   senderRole: string,
  //   senderAvatarUrl?: string,
  //   message: string,
  //   attachment?: {
  //     fileName: string,
  //     fileType: string,
  //     fileUrl: string,
  //     fileSize: number,
  //     publicId: string
  //   },
  //   timestamp: number,
  //   isDeleted: boolean
  // }
})
```

**Message Deleted**

```javascript
socket.on('message_deleted', (data) => {
  // data: { roomId: string, messageId: string }
})
```

**User Typing**

```javascript
socket.on('user_typing', (data) => {
  // data: { roomId: string, userId: string, userName: string }
})
```

**User Stopped Typing**

```javascript
socket.on('user_stop_typing', (data) => {
  // data: { roomId: string, userId: string }
})
```

### Notification Events

#### Client → Server Events

**Join User Notifications**

```javascript
socket.emit('join_notifications_for_user', userId)
```

**Join Project Notifications**

```javascript
socket.emit('join_notifications_for_project', projectId)
```

**Join Task Notifications**

```javascript
socket.emit('join_notifications_for_task', taskId)
```

**Mark Notification as Read**

```javascript
socket.emit('mark_read', notificationId)
```

**Mark All Notifications as Read**

```javascript
socket.emit('mark_all_read', userId)
```

#### Server → Client Events

**User Notification**

```javascript
socket.on('user_notification', (notification) => {
  // notification: {
  //   _id: ObjectId,
  //   userId: ObjectId,
  //   type: string,
  //   title: string,
  //   message: string,
  //   isRead: boolean,
  //   createdAt: number
  // }
})
```

**Project Notification**

```javascript
socket.on('project_notification', (notification) => {
  // notification: {
  //   _id: ObjectId,
  //   projectId: ObjectId,
  //   type: string,
  //   title: string,
  //   message: string,
  //   isRead: boolean,
  //   createdAt: number
  // }
})
```

**Task Notification**

```javascript
socket.on('task_notification', (notification) => {
  // notification: {
  //   _id: ObjectId,
  //   taskId: ObjectId,
  //   type: string,
  //   title: string,
  //   message: string,
  //   isRead: boolean,
  //   createdAt: number
  // }
})
```

### Notification Types

```typescript
const NOTIFICATION_TYPES = {
  // Project related
  PROJECT_CREATED: 'project_created',
  PROJECT_UPDATED: 'project_updated',
  PROJECT_DELETED: 'project_deleted',
  PROJECT_INVITATION: 'project_invitation',
  PROJECT_ROLE_CHANGED: 'project_role_changed',
  PROJECT_MEMBER_REMOVED: 'project_member_removed',
  PROJECT_MEMBER_JOINED: 'project_member_joined',

  // Member related
  INVITATION_ACCEPTED: 'invitation_accepted',
  MEMBER_ROLE_CHANGED: 'member_role_changed',
  MEMBER_REMOVED: 'member_removed',

  // Sprint related
  SPRINT_STARTED: 'sprint_started',
  SPRINT_COMPLETED: 'sprint_completed',
  SPRINT_CREATED: 'sprint_created',
  SPRINT_DELETED: 'sprint_deleted',
  SPRINT_UPDATED: 'sprint_updated',

  // Task related
  TASK_CREATED: 'task_created',
  TASK_ASSIGNED: 'task_assigned',
  TASK_UPDATED: 'task_updated',
  TASK_COMPLETED: 'task_completed',
  TASK_COMMENT_ADDED: 'task_comment_added'
}
```

### Socket.IO Room Structure

```
[Add room structure diagram here showing:]
- User-specific rooms: user_{userId}
- Project rooms: project_{projectId}
- Task rooms: task_{taskId}
- Chat rooms: chat_{roomId}
```

**Recommended diagram location**: `docs/images/socket-rooms.png`

### Error Handling

**Client-side error handling:**

```javascript
socket.on('error', (error) => {
  console.error('Socket error:', error.message)
})
```

**Connection events:**

```javascript
socket.on('connect', () => {
  console.log('Connected to server')
})

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason)
})
```

## 💾 Database Schema

```
[Add database schema diagram here showing:]
- Users collection
- Projects collection
- Sprints collection
- Tasks collection
- Board Columns collection
- Notifications collection
- Project Chats collection
- Relationships between collections
```

**Recommended diagram location**: `docs/images/database-schema.png`

### Key Collections

- **users**: User accounts and profiles
- **projects**: Project information and member associations
- **sprints**: Sprint planning and tracking
- **tasks**: Task management with assignees, comments, and attachments
- **boardColumns**: Kanban board column configuration
- **notifications**: User and project notifications
- **project_chats**: Real-time chat messages and attachments

## 📜 Scripts

```bash
# Development
pnpm dev          # Start development server with hot reload

# Production
pnpm build        # Compile TypeScript to JavaScript
pnpm start        # Start production server

# Database
pnpm seed         # Seed database with sample data

# Code Quality
pnpm lint         # Run ESLint
pnpm format       # Format code with Prettier
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🖼 Recommended Documentation Images

To complete this documentation, please add the following diagrams:

1. **System Architecture** (`docs/images/system-architecture.png`)
   - Show client-server architecture
   - Include MongoDB, Cloudinary, Brevo integrations
   - Display Socket.IO real-time layer

2. **Data Flow Diagram** (`docs/images/data-flow.png`)
   - HTTP request/response flow
   - WebSocket event flow
   - Authentication flow with JWT

3. **Socket.IO Architecture** (`docs/images/socketio-architecture.png`)
   - Connection establishment
   - Room-based broadcasting
   - Event handling flow

4. **Socket Rooms Structure** (`docs/images/socket-rooms.png`)
   - User rooms
   - Project rooms
   - Task rooms
   - Chat rooms

5. **Database Schema** (`docs/images/database-schema.png`)
   - All collections with fields
   - Relationships between collections
   - Indexes

---

**Built with ❤️ by Nguyễn Nhật Quang**
