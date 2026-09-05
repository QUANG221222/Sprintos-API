import 'dotenv/config'
import { PrismaService } from '../src/shared/services/prisma.service'
import { TaskType } from '../src/generated/prisma/enums'

const prisma = new PrismaService()

const DONE_KEYWORDS = ['done', 'hoàn thành', 'đã xong', 'closed', 'resolved', 'hoàn tất', 'deploy', 'released', 'finish']
const TODO_KEYWORDS = ['todo', 'to do', 'to-do', 'cần làm', 'chờ làm', 'backlog', 'mới', 'open', 'new', 'chưa làm', 'ready']
const BLOCKED_KEYWORDS = ['block', 'blocked', 'tắc', 'nghẽn', 'chờ api', 'tạm dừng', 'on hold', 'pause']
const CANCELLED_KEYWORDS = ['cancel', 'cancelled', 'hủy', 'discard', 'rejected', 'bỏ']

async function backfillColumnFlagsAndTaskTypes() {
  console.log('====================================================================')
  console.log('🔄 BẮT ĐẦU BACKFILL CỜ METADATA (BOARD COLUMN) & TASK TYPES')
  console.log('====================================================================\n')

  // 1. Quét tất cả Sprint
  const sprints = await prisma.sprint.findMany({
    where: { deletedAt: null },
    include: {
      boardColumns: {
        where: { deletedAt: null }
      }
    }
  })

  console.log(`📌 Tìm thấy ${sprints.length} sprints trong hệ thống.`)

  let updatedColumnsCount = 0

  for (const sprint of sprints) {
    const orderIds = sprint.boardColumnIds || []
    const cols = sprint.boardColumns || []
    if (cols.length === 0) continue

    // Sắp xếp cột theo thứ tự boardColumnIds
    const sortedCols = [...cols].sort((a, b) => {
      const idxA = orderIds.indexOf(a.id)
      const idxB = orderIds.indexOf(b.id)
      if (idxA !== -1 && idxB !== -1) return idxA - idxB
      return 0
    })

    const totalCols = sortedCols.length

    for (let i = 0; i < totalCols; i++) {
      const col = sortedCols[i]
      const titleLower = (col.title || '').toLowerCase().trim()

      let isDone = false
      let isWip = false
      let isBlocked = false
      let isCancelled = false
      let color = '#3b82f6' // Blue default

      if (CANCELLED_KEYWORDS.some((kw) => titleLower.includes(kw))) {
        isCancelled = true
        color = '#ef4444' // Red
      } else if (DONE_KEYWORDS.some((kw) => titleLower.includes(kw))) {
        isDone = true
        color = '#10b981' // Green
      } else if (BLOCKED_KEYWORDS.some((kw) => titleLower.includes(kw))) {
        isBlocked = true
        color = '#f59e0b' // Amber
      } else if (TODO_KEYWORDS.some((kw) => titleLower.includes(kw))) {
        isWip = false
        color = '#94a3b8' // Slate
      } else if (i === 0) {
        // Cột đầu tiên mặc định là To Do
        isWip = false
        color = '#94a3b8'
      } else if (i === totalCols - 1 && totalCols >= 2) {
        // Cột cuối cùng nếu không có keyword đặc biệt thì mặc định là Done
        isDone = true
        color = '#10b981'
      } else {
        // Các cột trung gian
        isWip = true
        color = titleLower.includes('review') || titleLower.includes('test') ? '#8b5cf6' : '#3b82f6'
      }

      await prisma.boardColumn.update({
        where: { id: col.id },
        data: {
          isDone,
          isWip,
          isBlocked,
          isCancelled,
          color
        }
      })
      updatedColumnsCount++
    }
  }

  console.log(`✅ Đã cập nhật thành công ${updatedColumnsCount} Board Columns với đầy đủ Metadata Flags.\n`)

  // 2. Quét và cập nhật Task Types
  const tasks = await prisma.task.findMany({
    where: { deletedAt: null },
    include: { labels: true }
  })

  console.log(`📌 Tìm thấy ${tasks.length} tasks trong hệ thống.`)

  let updatedTasksCount = 0

  for (const task of tasks) {
    const titleLower = (task.title || '').toLowerCase()
    const labelNames = (task.labels || []).map((l: any) => (l.name || '').toLowerCase())

    let resolvedType: TaskType = TaskType.TASK

    if (
      labelNames.some((l: string) => l.includes('bug') || l.includes('fix')) ||
      titleLower.includes('bug') ||
      titleLower.includes('fix') ||
      titleLower.includes('lỗi') ||
      task.priority === 'CRITICAL'
    ) {
      resolvedType = TaskType.BUG
    } else if (
      labelNames.some((l: string) => l.includes('tech') || l.includes('refactor')) ||
      titleLower.includes('refactor') ||
      titleLower.includes('setup') ||
      titleLower.includes('config') ||
      titleLower.includes('migration')
    ) {
      resolvedType = TaskType.TECH_DEBT
    } else if (
      labelNames.some((l: string) => l.includes('feature') || l.includes('story')) ||
      titleLower.includes('tạo') ||
      titleLower.includes('create') ||
      titleLower.includes('xây dựng') ||
      titleLower.includes('build') ||
      titleLower.includes('implement')
    ) {
      resolvedType = TaskType.STORY
    }

    await prisma.task.update({
      where: { id: task.id },
      data: { type: resolvedType }
    })
    updatedTasksCount++
  }

  console.log(`✅ Đã cập nhật thành công ${updatedTasksCount} Tasks với TaskType chuẩn.`)
  console.log('\n====================================================================')
  console.log('🎉 HOÀN TẤT BACKFILL DỮ LIỆU PHASE 1 AN TOÀN VÀ CHÍNH XÁC!')
  console.log('====================================================================')
}

backfillColumnFlagsAndTaskTypes()
  .catch((err) => {
    console.error('❌ Lỗi khi chạy migration flags:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
