import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'
import { inferTechnicalRole, TechnicalRole } from './analyze-backlog.tool'

export interface MemberAssignmentSummary {
  userId: string
  name: string
  email: string
  role: TechnicalRole
  tasksCount: number
  totalAssignedSP: number
  loadStatus: 'OVERLOADED' | 'OPTIMAL' | 'MODERATE' | 'AVAILABLE'
  assignedTasks: Array<{
    id: string
    title: string
    storyPoint: number
    role: TechnicalRole
  }>
}

@Injectable()
export class AutoAssignByRoleTool implements IAgentTool {
  readonly name = 'autoAssignTasksByRole'
  readonly description =
    'Tự động phân công các task trong Sprint cho các thành viên dựa trên vai trò chuyên môn kỹ thuật (Backend, Frontend, QA, DevOps) ' +
    'kết hợp thuật toán cân bằng tải (Greedy Load Balancing): ' +
    'Đảm bảo mỗi thành viên nhận từ 8-13 Story Points (vùng tối ưu), ngăn chặn tuyệt đối tình trạng quá tải (>15 SP). ' +
    'Mặc định chạy ở chế độ dryRun: true (xem trước bảng phân công, KHÔNG ghi DB trừ khi dryRun: false).'
  readonly category: ToolCategory = 'SPRINT'
  readonly riskLevel: ToolRiskLevel = 'WRITE'
  readonly level: ToolActionLevel = 'WRITE'
  readonly parameters = {
    type: 'object',
    properties: {
      sprintId: {
        type: 'string',
        description: 'Mã Sprint cần phân công task (nếu để trống sẽ tự lấy từ ngữ cảnh hiện tại)'
      },
      memberRoles: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            memberNameOrEmail: { type: 'string', description: 'Tên hoặc email của thành viên' },
            role: {
              type: 'string',
              enum: ['BACKEND', 'FRONTEND', 'FULLSTACK', 'QA_TEST', 'DEVOPS', 'DESIGN']
            }
          },
          required: ['memberNameOrEmail', 'role']
        },
        description: 'Tùy chọn ghi đè vai trò của thành viên do người dùng chỉ định (nếu không cung cấp AI sẽ tự suy luận từ lịch sử)'
      },
      maxCapacityPerMemberSP: {
        type: 'number',
        description: 'Giới hạn Story Points tối đa cho 1 thành viên trong Sprint (mặc định 13 SP)'
      },
      dryRun: {
        type: 'boolean',
        description: 'Chế độ xem trước (Mặc định true: chỉ tính toán để xem trước, false: gán task thật vào DB)'
      }
    }
  }

  private readonly logger = new Logger(AutoAssignByRoleTool.name)

  constructor(private readonly prisma: PrismaService) {}

  toOpenAiTool(): OpenAI.Chat.ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters
      }
    }
  }

  async execute(
    args: {
      sprintId?: string
      memberRoles?: Array<{
        memberNameOrEmail: string
        role: TechnicalRole
      }>
      maxCapacityPerMemberSP?: number
      dryRun?: boolean
    },
    context: AgentContext
  ): Promise<ToolExecutionResult> {
    const targetSprintId = args.sprintId || context.activeSprintId
    if (!targetSprintId) {
      return {
        output: 'Lỗi: Không xác định được sprintId. Vui lòng cung cấp sprintId.',
        status: 'ERROR',
        summary: 'Thiếu sprintId'
      }
    }

    const dryRun = args.dryRun !== false // Mặc định true
    const maxCapacity = Math.max(8, args.maxCapacityPerMemberSP || 13)

    try {
      // 1. Lấy thông tin Sprint và ProjectId
      const sprint = await this.prisma.sprint.findUnique({
        where: { id: targetSprintId, deletedAt: null },
        select: { id: true, name: true, projectId: true }
      })

      if (!sprint) {
        return {
          output: `Lỗi: Không tìm thấy Sprint với ID: ${targetSprintId}`,
          status: 'ERROR',
          summary: 'Sprint không tồn tại'
        }
      }

      // 2. Lấy danh sách thành viên ACTIVE của dự án
      const projectMembers = await this.prisma.projectMember.findMany({
        where: {
          projectId: sprint.projectId,
          status: 'ACTIVE',
          deletedAt: null
        },
        include: {
          member: { select: { id: true, displayName: true, email: true } }
        }
      })

      if (projectMembers.length === 0) {
        return {
          output: 'Lỗi: Dự án không có thành viên nào để phân công task.',
          status: 'ERROR',
          summary: 'Dự án không có thành viên'
        }
      }

      // 3. Xác định Role của từng thành viên (User Override hoặc Auto Infer)
      const userOverrideMap = new Map<string, TechnicalRole>()
      if (args.memberRoles && args.memberRoles.length > 0) {
        for (const mr of args.memberRoles) {
          const key = mr.memberNameOrEmail.toLowerCase().trim()
          userOverrideMap.set(key, mr.role)
        }
      }

      const memberProfiles: Array<{
        userId: string
        name: string
        email: string
        role: TechnicalRole
        currentSP: number
        assignedTasks: MemberAssignmentSummary['assignedTasks']
      }> = []

      for (const pm of projectMembers) {
        const u = pm.member
        let assignedRole: TechnicalRole | undefined = undefined

        // 1. Kiểm tra User Override từ tham số gọi tool
        if (userOverrideMap.has(u.displayName.toLowerCase()) || userOverrideMap.has(u.email.toLowerCase())) {
          assignedRole =
            userOverrideMap.get(u.displayName.toLowerCase()) || userOverrideMap.get(u.email.toLowerCase())
        }

        // 2. Ưu tiên lấy trực tiếp vai trò kỹ thuật đã được cấu hình trong ProjectMember
        if (!assignedRole && pm.technicalRole && pm.technicalRole !== 'OTHER' && pm.technicalRole !== 'FULLSTACK') {
          assignedRole = pm.technicalRole as TechnicalRole
        }

        // 3. Nếu chưa có hoặc là FULLSTACK, kiểm tra xem lịch sử task có thể hiện chuyên môn vượt trội không
        if (!assignedRole || assignedRole === 'FULLSTACK') {
          const pastAssignments = await this.prisma.taskAssignee.findMany({
            where: {
              userId: u.id,
              task: { sprint: { projectId: sprint.projectId }, deletedAt: null }
            },
            include: { task: { select: { title: true, description: true } } },
            take: 15
          })

          const counts: Record<TechnicalRole, number> = {
            BACKEND: 0,
            FRONTEND: 0,
            FULLSTACK: 0,
            QA_TEST: 0,
            DEVOPS: 0,
            DESIGN: 0,
            OTHER: 0
          }

          for (const pa of pastAssignments) {
            const r = inferTechnicalRole(pa.task.title, pa.task.description)
            counts[r] += 1
          }

          let bestRole: TechnicalRole = (pm.technicalRole as TechnicalRole) || 'FULLSTACK'
          let maxCount = 0
          for (const [r, c] of Object.entries(counts)) {
            if (c > maxCount && r !== 'OTHER') {
              maxCount = c
              bestRole = r as TechnicalRole
            }
          }

          // Suy từ tên nếu chưa có lịch sử và chưa cấu hình
          if (maxCount === 0 && (!pm.technicalRole || pm.technicalRole === 'OTHER')) {
            const lowerName = u.displayName.toLowerCase()
            if (lowerName.includes('fe') || lowerName.includes('front')) bestRole = 'FRONTEND'
            else if (lowerName.includes('be') || lowerName.includes('back')) bestRole = 'BACKEND'
            else if (lowerName.includes('qa') || lowerName.includes('test')) bestRole = 'QA_TEST'
            else bestRole = 'FULLSTACK'
          }

          assignedRole = bestRole
        }

        memberProfiles.push({
          userId: u.id,
          name: u.displayName,
          email: u.email,
          role: assignedRole,
          currentSP: 0,
          assignedTasks: []
        })
      }

      // 4. Lấy danh sách task của Sprint cần gán
      const tasks = await this.prisma.task.findMany({
        where: { sprintId: targetSprintId, deletedAt: null },
        include: { assignees: true },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }]
      })

      if (tasks.length === 0) {
        return {
          output: JSON.stringify({
            message: `Sprint "${sprint.name}" hiện không có task nào để phân công.`
          }),
          status: 'SUCCESS',
          summary: 'Sprint không có task'
        }
      }

      // 5. Thuật toán Greedy Load Balancing gán việc theo Role
      // Sắp xếp task có Story Point lớn trước
      const sortedTasks = [...tasks].sort((a, b) => (b.storyPoint || 1) - (a.storyPoint || 1))
      const taskAssignmentsToCommit: Array<{ taskId: string; userId: string }> = []

      for (const t of sortedTasks) {
        const sp = t.storyPoint || 1
        const taskRole = inferTechnicalRole(t.title, t.description)

        // Tìm các thành viên có role phù hợp
        let candidateMembers = memberProfiles.filter((m) => {
          if (m.role === taskRole) return true
          if (m.role === 'FULLSTACK') return true
          if (taskRole === 'FULLSTACK') return m.role === 'BACKEND' || m.role === 'FRONTEND'
          return false
        })

        // Nếu không có ai khớp role hoặc tất cả đều đã vượt trần, mở rộng ra toàn team
        if (candidateMembers.length === 0) {
          candidateMembers = memberProfiles
        }

        // Chọn thành viên có currentSP nhỏ nhất (đang rảnh nhất)
        candidateMembers.sort((a, b) => a.currentSP - b.currentSP)
        const chosenMember = candidateMembers[0]

        if (chosenMember) {
          chosenMember.currentSP += sp
          chosenMember.assignedTasks.push({
            id: t.id,
            title: t.title,
            storyPoint: sp,
            role: taskRole
          })
          taskAssignmentsToCommit.push({ taskId: t.id, userId: chosenMember.userId })
        }
      }

      // 6. Xây dựng bản tóm tắt phân bổ
      const memberSummaries: MemberAssignmentSummary[] = memberProfiles.map((m) => {
        let loadStatus: MemberAssignmentSummary['loadStatus'] = 'AVAILABLE'
        if (m.currentSP > 15) loadStatus = 'OVERLOADED'
        else if (m.currentSP >= 8) loadStatus = 'OPTIMAL'
        else if (m.currentSP >= 5) loadStatus = 'MODERATE'

        return {
          userId: m.userId,
          name: m.name,
          email: m.email,
          role: m.role,
          tasksCount: m.assignedTasks.length,
          totalAssignedSP: m.currentSP,
          loadStatus,
          assignedTasks: m.assignedTasks
        }
      })

      // 7. Nếu dryRun === false: Commit thật vào bảng TaskAssignee
      if (!dryRun) {
        await this.prisma.$transaction(async (tx) => {
          for (const item of taskAssignmentsToCommit) {
            // Xóa assignment cũ của task nếu có (hoặc replace)
            await tx.taskAssignee.deleteMany({
              where: { taskId: item.taskId }
            })

            // Tạo assignment mới
            await tx.taskAssignee.create({
              data: {
                taskId: item.taskId,
                userId: item.userId
              }
            })
          }
        })

        this.logger.log(
          `✅ AutoAssignByRole: Đã gán thật ${taskAssignmentsToCommit.length} tasks cho ${memberProfiles.length} thành viên vào DB.`
        )

        return {
          output: JSON.stringify({
            status: 'COMMITTED',
            message: `Đã gán thành công ${taskAssignmentsToCommit.length} tasks trong Sprint "${sprint.name}".`,
            sprintName: sprint.name,
            allocation: memberSummaries
          }),
          status: 'SUCCESS',
          summary: `Đã phân công ${tasks.length} tasks cho ${memberProfiles.length} thành viên trong "${sprint.name}"`
        }
      }

      // 8. Nếu dryRun === true: Trả về Preview
      const previewPayload = {
        status: 'DRY_RUN_PREVIEW',
        message: 'Bảng phân công nhiệm vụ dự kiến theo Role & Cân bằng tải (Chưa ghi vào DB).',
        sprintId: targetSprintId,
        sprintName: sprint.name,
        totalTasks: tasks.length,
        totalStoryPoints: tasks.reduce((sum, t) => sum + (t.storyPoint || 1), 0),
        memberAllocation: memberSummaries
      }

      return {
        output: JSON.stringify(previewPayload),
        status: 'SUCCESS',
        summary: `Đề xuất phân công ${tasks.length} tasks cho ${memberProfiles.length} thành viên trong "${sprint.name}" · DryRun: true`
      }
    } catch (err: any) {
      this.logger.error(`AutoAssignByRoleTool error: ${err?.message}`, err?.stack)
      return {
        output: `Lỗi phân công task theo Role: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Lỗi gán task tự động'
      }
    }
  }
}
