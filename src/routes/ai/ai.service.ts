import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common'
import * as XLSX from 'xlsx'
import { createId } from '@paralleldrive/cuid2'
import { PrismaService } from '~/shared/services/prisma.service'
import { OpenRouterService } from '~/shared/services/openrouter.service'
import {
  CommitExcelImportBodyDTO,
  EnrichTaskBodyDTO,
  EnrichTaskResDTO,
  ParseExcelResDTO,
  TaskImportDraftSchema
} from './ai.model'

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly openRouterService: OpenRouterService
  ) {}

  /**
   * 1. Health check kiểm tra API Key và kết nối LLM
   */
  async healthCheck() {
    return await this.openRouterService.healthCheck()
  }

  /**
   * Tạo buffer file Excel template mẫu (.xlsx) 2 Sheet: Tasks_Sample và Huong_Dan
   */
  generateExcelTemplate(): Buffer {
    const workbook = XLSX.utils.book_new()

    // Sheet 1: Tasks_Sample
    const sampleData = [
      {
        'Tiêu đề công việc': 'Tích hợp đăng nhập bằng Google OAuth',
        'Mô tả chi tiết': 'Cho phép người dùng đăng nhập nhanh bằng tài khoản Google, tự động tạo tài khoản nếu chưa có.',
        'Loại công việc': 'STORY',
        'Mức độ ưu tiên': 'HIGH',
        'Story Points': 5,
        'Thời gian làm (Ngày)': 3,
        'Công việc con (Subtasks)': '- Tạo OAuth client ID trên Google Console\n- Thêm nút Sign in with Google trên UI\n- Viết API callback xác thực token\n- Viết Unit test'
      },
      {
        'Tiêu đề công việc': 'Lỗi không gửi mã OTP qua email',
        'Mô tả chi tiết': 'Khi người dùng bấm quên mật khẩu, email OTP không được gửi đến hộp thư.',
        'Loại công việc': 'BUG',
        'Mức độ ưu tiên': 'CRITICAL',
        'Story Points': 2,
        'Thời gian làm (Ngày)': 1,
        'Công việc con (Subtasks)': '- Kiểm tra API key Resend\n- Fix lỗi timeout mail service'
      },
      {
        'Tiêu đề công việc': 'Tối ưu tốc độ tải trang Kanban Board',
        'Mô tả chi tiết': 'Trang Kanban bị giật lag khi có trên 100 tasks, cần áp dụng virtualized list.',
        'Loại công việc': 'TECH_DEBT',
        'Mức độ ưu tiên': 'MEDIUM',
        'Story Points': 3,
        'Thời gian làm (Ngày)': 2,
        'Công việc con (Subtasks)': '- Thử nghiệm thư viện react-window\n- Tối ưu re-render các thẻ task'
      }
    ]

    const ws1 = XLSX.utils.json_to_sheet(sampleData)
    ws1['!cols'] = [
      { wch: 35 },
      { wch: 45 },
      { wch: 15 },
      { wch: 15 },
      { wch: 12 },
      { wch: 20 },
      { wch: 40 }
    ]
    XLSX.utils.book_append_sheet(workbook, ws1, 'Tasks_Sample')

    // Sheet 2: Huong_Dan
    const guideData = [
      { 'Tên cột': 'Tiêu đề công việc', 'Bắt buộc': 'CÓ', 'Giá trị hợp lệ': 'Bất kỳ chuỗi văn bản nào', 'Ghi chú': 'AI tự nhận diện các tên cột tương đương: Task Name, Tên việc, Công việc...' },
      { 'Tên cột': 'Mô tả chi tiết', 'Bắt buộc': 'KHÔNG', 'Giá trị hợp lệ': 'Văn bản mô tả', 'Ghi chú': 'Nên ghi rõ bối cảnh để AI hiểu nghiệp vụ' },
      { 'Tên cột': 'Loại công việc', 'Bắt buộc': 'KHÔNG', 'Giá trị hợp lệ': 'STORY, TASK, BUG, TECH_DEBT, EPIC', 'Ghi chú': 'Mặc định là TASK nếu để trống' },
      { 'Tên cột': 'Mức độ ưu tiên', 'Bắt buộc': 'KHÔNG', 'Giá trị hợp lệ': 'LOW, MEDIUM, HIGH, CRITICAL (hoặc Thấp, Bình thường, Cao, Khẩn cấp)', 'Ghi chú': 'Mặc định là MEDIUM' },
      { 'Tên cột': 'Story Points', 'Bắt buộc': 'KHÔNG', 'Giá trị hợp lệ': 'Số nguyên (1, 2, 3, 5, 8, 13)', 'Ghi chú': 'Nếu để trống, AI sẽ tự động ước lượng' },
      { 'Tên cột': 'Thời gian làm (Ngày)', 'Bắt buộc': 'KHÔNG', 'Giá trị hợp lệ': 'Số nguyên >= 1', 'Ghi chú': 'Dùng cho sơ đồ đường găng CPM và Gantt chart' },
      { 'Tên cột': 'Công việc con (Subtasks)', 'Bắt buộc': 'KHÔNG', 'Giá trị hợp lệ': 'Danh sách ngăn cách bằng dấu xuống dòng hoặc gạch đầu dòng -', 'Ghi chú': 'AI sẽ tự tạo các subtask con liên kết với task cha' }
    ]

    const ws2 = XLSX.utils.json_to_sheet(guideData)
    ws2['!cols'] = [{ wch: 25 }, { wch: 10 }, { wch: 40 }, { wch: 50 }]
    XLSX.utils.book_append_sheet(workbook, ws2, 'Huong_Dan')

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  }

  /**
   * 2. Parse Excel buffer sang danh sách Task Drafts
   */
  async parseExcel(fileBuffer: Buffer): Promise<ParseExcelResDTO> {
    try {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' })
      if (!workbook.SheetNames.length) {
        throw new BadRequestException('File Excel không có sheet nào!')
      }

      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      const rawRows: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 })

      // Lọc bỏ hàng rỗng hoàn toàn
      const validRows = rawRows.filter(
        (row) => row && row.length > 0 && row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '')
      )

      if (validRows.length < 2) {
        throw new BadRequestException('File Excel quá ít dữ liệu hoặc không có nội dung task!')
      }

      // Giới hạn 60 dòng đầu để tránh quá tải token & rate limit
      const sampledRows = validRows.slice(0, 60)
      const rawTableText = JSON.stringify(sampledRows)

      const systemPrompt = `
          Bạn là chuyên gia Agile/Scrum Master trong nền tảng Sprintos.
          Nhiệm vụ của bạn là nhận diện các cột trong bảng dữ liệu Excel thô và trích xuất thành danh sách task chuẩn Agile.
          Các quy tắc:
          1. "title": Tiêu đề công việc ngắn gọn (Bắt buộc phải có).
          2. "description": Mô tả chi tiết nếu có trong bảng.
          3. "type": Bắt buộc là một trong các giá trị: "STORY", "TASK", "BUG", "TECH_DEBT", "EPIC". Mặc định "TASK".
          4. "priority": Bắt buộc là một trong các giá trị: "LOW", "MEDIUM", "HIGH", "CRITICAL". Mặc định "MEDIUM".
          5. "storyPoint": Số nguyên (1, 2, 3, 5, 8). Nếu bảng không có, hãy ước lượng dựa vào độ phức tạp của task.
          6. "duration": Số ngày làm việc vật lý (1, 2, 3...). Mặc định 1.
          7. "subtasks": Danh sách mảng các subtasks con nếu có thông tin (title, priority, storyPoint).

          BẮT BUỘC TRẢ VỀ JSON theo format:
          {
            "tasks": [
              {
                "tempId": "task-1",
                "title": "Tên công việc",
                "description": "Mô tả công việc",
                "type": "TASK",
                "priority": "MEDIUM",
                "storyPoint": 2,
                "duration": 1,
                "subtasks": []
              }
            ]
          }`

      const userPrompt = `Dưới đây là bảng dữ liệu thô từ file Excel:\n${rawTableText}\nHãy bóc tách và trả về JSON danh sách tasks:`

      const aiResponse = await this.openRouterService.generateJson<{ tasks: any[] }>(userPrompt, systemPrompt)

      const rawTasks = aiResponse?.tasks || []
      const formattedTasks = rawTasks.map((t, idx) => {
        const validated = TaskImportDraftSchema.safeParse({
          tempId: t.tempId || `temp-${idx + 1}-${createId().slice(0, 6)}`,
          title: String(t.title || `Task ${idx + 1}`).trim(),
          description: t.description ? String(t.description) : null,
          type: ['STORY', 'TASK', 'BUG', 'TECH_DEBT', 'EPIC'].includes(t.type) ? t.type : 'TASK',
          priority: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(t.priority) ? t.priority : 'MEDIUM',
          storyPoint: typeof t.storyPoint === 'number' && t.storyPoint >= 0 ? Math.round(t.storyPoint) : 1,
          duration: typeof t.duration === 'number' && t.duration >= 1 ? Math.round(t.duration) : 1,
          subtasks: Array.isArray(t.subtasks)
            ? t.subtasks.map((st: any) => ({
                title: String(st.title || 'Subtask').trim(),
                priority: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(st.priority) ? st.priority : 'MEDIUM',
                storyPoint: typeof st.storyPoint === 'number' ? Math.round(st.storyPoint) : 1
              }))
            : []
        })

        return validated.success
          ? validated.data
          : {
              tempId: `temp-${idx + 1}-${createId().slice(0, 6)}`,
              title: String(t.title || `Task ${idx + 1}`).trim(),
              description: null,
              type: 'TASK' as const,
              priority: 'MEDIUM' as const,
              storyPoint: 1,
              duration: 1,
              subtasks: []
            }
      })

      return {
        tasks: formattedTasks,
        totalParsed: formattedTasks.length
      }
    } catch (error: any) {
      this.logger.error('Lỗi khi parse Excel:', error)
      throw new BadRequestException(`Không thể phân tích file Excel: ${error?.message || error}`)
    }
  }

  /**
   * 3. Commit danh sách task đã duyệt từ Preview vào Database qua Transaction
   */
  async commitExcelImport(body: CommitExcelImportBodyDTO, userId: string) {
    const { projectId, sprintId, tasks } = body

    // 1. Kiểm tra Sprint
    const sprint = await this.prisma.sprint.findUnique({
      where: { id: sprintId, deletedAt: null },
      include: { boardColumns: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } }
    })

    if (!sprint || sprint.projectId !== projectId) {
      throw new NotFoundException('Sprint không tồn tại trong dự án này!')
    }

    // 2. Xác định Column đích
    let targetColumnId = body.boardColumnId
    if (!targetColumnId) {
      // Mặc định lấy cột đầu tiên chưa Done (To Do)
      const defaultCol = sprint.boardColumns.find((c) => !c.isDone) || sprint.boardColumns[0]
      if (!defaultCol) {
        throw new BadRequestException('Sprint chưa có cột Kanban nào để chứa task!')
      }
      targetColumnId = defaultCol.id
    }

    // 3. Tiến hành Transaction bulk create
    return await this.prisma.$transaction(async (tx) => {
      // Lấy max sortOrder hiện tại trong column
      const existingOrders = await tx.boardColumnTaskOrder.findMany({
        where: { boardColumnId: targetColumnId },
        select: { sortOrder: true },
        orderBy: { sortOrder: 'desc' },
        take: 1
      })
      let currentOrder = existingOrders.length > 0 ? existingOrders[0].sortOrder : 0

      let totalCreated = 0

      for (const item of tasks) {
        currentOrder += 1
        // Tạo Task cha
        const createdTask = await tx.task.create({
          data: {
            sprintId: sprint.id,
            boardColumnId: targetColumnId!,
            title: item.title,
            description: item.description || null,
            type: item.type,
            priority: item.priority,
            storyPoint: item.storyPoint,
            duration: item.duration || 1,
            createdById: userId
          }
        })

        // Tạo Task Order
        await tx.boardColumnTaskOrder.create({
          data: {
            boardColumnId: targetColumnId!,
            taskId: createdTask.id,
            sortOrder: currentOrder
          }
        })

        totalCreated++

        // Tạo các Subtasks nếu có
        if (item.subtasks && item.subtasks.length > 0) {
          for (const sub of item.subtasks) {
            currentOrder += 1
            const createdSubtask = await tx.task.create({
              data: {
                sprintId: sprint.id,
                boardColumnId: targetColumnId!,
                parentId: createdTask.id,
                title: sub.title,
                priority: sub.priority,
                storyPoint: sub.storyPoint,
                duration: 1,
                createdById: userId
              }
            })

            await tx.boardColumnTaskOrder.create({
              data: {
                boardColumnId: targetColumnId!,
                taskId: createdSubtask.id,
                sortOrder: currentOrder
              }
            })
          }
        }
      }

      return {
        createdCount: totalCreated,
        message: `Đã nhập thành công ${totalCreated} công việc vào Sprint "${sprint.name}"!`
      }
    })
  }

  /**
   * 4. Làm giàu nội dung Task (User Story, Acceptance Criteria, Subtasks)
   */
  async enrichTask(body: EnrichTaskBodyDTO): Promise<EnrichTaskResDTO> {
    const systemPrompt = `
Bạn là chuyên gia Agile Coach & Senior Scrum Master trong nền tảng Sprintos.
Nhiệm vụ của bạn là nhận tiêu đề và mô tả sơ bộ của một công việc, sau đó nâng cấp và làm giàu nội dung công việc đó theo chuẩn quốc tế:
1. "userStory": Viết lại mô tả theo định dạng: "As a [vai trò người dùng], I want to [hành động/tính năng], So that [giá trị/lợi ích nhận được]." (viết bằng tiếng Việt tự nhiên).
2. "acceptanceCriteria": Mảng gồm 3 - 5 tiêu chí nghiệm thu rõ ràng (Given - When - Then hoặc Checklist kiểm tra điều kiện thành công).
3. "suggestedStoryPoint": Điểm phức tạp Story Point theo dãy Fibonacci (1, 2, 3, 5, 8).
4. "suggestedDuration": Số ngày làm việc vật lý ước lượng (1, 2, 3...).
5. "suggestedSubtasks": Mảng gồm 3 - 5 subtask kỹ thuật thực tế để hoàn thành task này (ví dụ: Tạo database schema, Viết REST API, Thiết kế UI, Viết Unit Test...). Mỗi subtask có: title, priority ('LOW'|'MEDIUM'|'HIGH'|'CRITICAL'), storyPoint.

BẮT BUỘC TRẢ VỀ ĐỊNH DẠNG JSON:
{
  "userStory": "...",
  "acceptanceCriteria": ["Tiêu chí 1", "Tiêu chí 2", "Tiêu chí 3"],
  "suggestedStoryPoint": 3,
  "suggestedDuration": 2,
  "suggestedSubtasks": [
    { "title": "Subtask 1", "priority": "HIGH", "storyPoint": 1 }
  ]
}`

    const userPrompt = `Tiêu đề task: ${body.title}\nMô tả hiện có: ${body.description || 'Chưa có mô tả'}`

    try {
      const result = await this.openRouterService.generateJson<EnrichTaskResDTO>(userPrompt, systemPrompt)

      return {
        userStory: result.userStory || `Là một người dùng, tôi muốn ${body.title} để nâng cao trải nghiệm làm việc.`,
        acceptanceCriteria: Array.isArray(result.acceptanceCriteria) ? result.acceptanceCriteria : [],
        suggestedStoryPoint: typeof result.suggestedStoryPoint === 'number' ? result.suggestedStoryPoint : 2,
        suggestedDuration: typeof result.suggestedDuration === 'number' ? result.suggestedDuration : 1,
        suggestedSubtasks: Array.isArray(result.suggestedSubtasks)
          ? result.suggestedSubtasks.map((sub: any) => {
              let priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM'
              const p = String(sub?.priority || '').trim().toUpperCase()
              if (p.includes('CRIT') || p.includes('KHẨN') || p.includes('URGENT')) priority = 'CRITICAL'
              else if (p.includes('HIGH') || p.includes('CAO')) priority = 'HIGH'
              else if (p.includes('LOW') || p.includes('THẤP')) priority = 'LOW'

              const rawSp = Number(sub?.storyPoint)
              const sp = isNaN(rawSp) ? 1 : Math.max(0, Math.round(rawSp))
              return {
                title: String(sub?.title || 'Công việc con').trim(),
                priority,
                storyPoint: sp
              }
            })
          : []
      }
    } catch (err: any) {
      this.logger.error('Lỗi khi enrich task:', err)
      throw new BadRequestException(`Không thể phân tích task: ${err?.message || err}`)
    }
  }
}
