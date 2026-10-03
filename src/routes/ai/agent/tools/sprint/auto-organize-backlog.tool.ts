import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { PrismaService } from '~/shared/services/prisma.service'
import { AgentContext } from '../../agent.types'
import { IAgentTool, ToolActionLevel, ToolExecutionResult } from '../tool.interface'
import { AnalyzeBacklogTool } from './analyze-backlog.tool'
import { TeamSkillsTool } from './team-skills.tool'
import { AutoPlanSprintsTool } from './auto-plan-sprints.tool'
import { AutoAssignByRoleTool } from './auto-assign-by-role.tool'

@Injectable()
export class AutoOrganizeBacklogTool implements IAgentTool {
  readonly name = 'autoOrganizeBacklogAndSprint'
  readonly description =
    'Công cụ Scrum Master tự động hóa toàn diện (One-Click AI Scrum Master): ' +
    'Tự động quét toàn bộ Backlog dự án, nhận diện hồ sơ chuyên môn của các thành viên trong team, ' +
    'quy hoạch chia Backlog thành các chu kỳ Sprint tối ưu theo thứ tự phụ thuộc kỹ thuật (Topological Sort), ' +
    'và tự động gán task cho đúng thành viên theo Role (Backend/Frontend/QA) kết hợp cân bằng tải (8-13 SP/người, không quá 15 SP). ' +
    'Mặc định chạy ở chế độ dryRun: true (xem trước toàn bộ bản kế hoạch chi tiết, KHÔNG ghi DB trừ khi dryRun: false).'
  readonly category: ToolCategory = 'SPRINT'
  readonly riskLevel: ToolRiskLevel = 'WRITE'
  readonly level: ToolActionLevel = 'WRITE'
  readonly parameters = {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'Mã dự án (nếu để trống sẽ tự lấy từ ngữ cảnh hiện tại)'
      },
      targetVelocityPerSprint: {
        type: 'number',
        description: 'Dung lượng Story Points tối đa cho mỗi Sprint (mặc định 35-40 SP)'
      },
      memberRoles: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            memberNameOrEmail: { type: 'string', description: 'Tên hoặc email thành viên' },
            role: {
              type: 'string',
              enum: ['BACKEND', 'FRONTEND', 'FULLSTACK', 'QA_TEST', 'DEVOPS', 'DESIGN']
            }
          },
          required: ['memberNameOrEmail', 'role']
        },
        description: 'Chỉ định vai trò cụ thể cho các thành viên trong team (tùy chọn, nếu không có AI tự suy luận)'
      },
      dryRun: {
        type: 'boolean',
        description:
          'Chế độ xem trước (Mặc định true: chỉ xuất kế hoạch tổng thể để người dùng duyệt, false: chính thức tạo Sprints và gán việc vào DB)'
      }
    }
  }

  private readonly logger = new Logger(AutoOrganizeBacklogTool.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly analyzeBacklogTool: AnalyzeBacklogTool,
    private readonly teamSkillsTool: TeamSkillsTool,
    private readonly autoPlanSprintsTool: AutoPlanSprintsTool,
    private readonly autoAssignByRoleTool: AutoAssignByRoleTool
  ) {}

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
      projectId?: string
      targetVelocityPerSprint?: number
      memberRoles?: Array<{ memberNameOrEmail: string; role: any }>
      dryRun?: boolean
    },
    context: AgentContext
  ): Promise<ToolExecutionResult> {
    const targetProjectId = args.projectId || context.targetProjectId
    if (!targetProjectId) {
      return {
        output: 'Lỗi: Không xác định được projectId.',
        status: 'ERROR',
        summary: 'Thiếu projectId'
      }
    }

    const dryRun = args.dryRun !== false

    try {
      this.logger.log(
        `🚀 AutoOrganizeBacklog: Bắt đầu điều phối toàn diện cho dự án ${targetProjectId} (DryRun: ${dryRun})...`
      )

      // 1. Phân tích Backlog
      const backlogResult = await this.analyzeBacklogTool.execute(
        { projectId: targetProjectId },
        context
      )
      if (backlogResult.status === 'ERROR') return backlogResult
      const backlogData = JSON.parse(backlogResult.output)

      if (!backlogData.totalTasks || backlogData.totalTasks === 0) {
        return {
          output: JSON.stringify({
            message: 'Backlog hiện tại không có task nào để lập kế hoạch Sprint.',
            details: backlogData
          }),
          status: 'SUCCESS',
          summary: 'Backlog trống, không cần lập kế hoạch'
        }
      }

      // 2. Lấy hồ sơ kỹ năng của Team
      const teamResult = await this.teamSkillsTool.execute({ projectId: targetProjectId }, context)
      if (teamResult.status === 'ERROR') return teamResult
      const teamData = JSON.parse(teamResult.output)

      // 3. Quy hoạch chia Sprints (Topological Sort + Velocity Budget)
      const recommendedVelocity =
        args.targetVelocityPerSprint || teamData.teamRecommendedSprintVelocitySP || 35

      const planResult = await this.autoPlanSprintsTool.execute(
        {
          projectId: targetProjectId,
          targetVelocityPerSprint: recommendedVelocity,
          dryRun
        },
        context
      )
      if (planResult.status === 'ERROR') return planResult
      const planData = JSON.parse(planResult.output)

      // 4. Nếu dryRun === false: Đã tạo Sprints thật, gán việc cho từng Sprint
      let assignmentResults: any[] = []
      if (!dryRun && planData.sprints && planData.sprints.length > 0) {
        for (const s of planData.sprints) {
          const assignRes = await this.autoAssignByRoleTool.execute(
            {
              sprintId: s.id,
              memberRoles: args.memberRoles,
              dryRun: false
            },
            context
          )
          assignmentResults.push({
            sprintId: s.id,
            sprintName: s.name,
            result: JSON.parse(assignRes.output)
          })
        }
      }

      // 5. Nếu dryRun === true: Mô phỏng gán việc cho từng Sprint dự kiến
      const simulatedSprintAssignments: any[] = []
      if (dryRun && planData.sprints && planData.sprints.length > 0) {
        // Mô phỏng gán việc theo danh sách task của từng Sprint
        for (const spkg of planData.sprints) {
          const memberAllocations: Record<
            string,
            { name: string; role: string; sp: number; tasks: string[] }
          > = {}

          // Khởi tạo các member
          for (const m of teamData.members || []) {
            let role = m.inferredSkillRole
            if (args.memberRoles) {
              const override = args.memberRoles.find(
                (mr) =>
                  mr.memberNameOrEmail.toLowerCase() === m.name.toLowerCase() ||
                  mr.memberNameOrEmail.toLowerCase() === m.email.toLowerCase()
              )
              if (override) role = override.role
            }
            memberAllocations[m.userId] = {
              name: m.name,
              role,
              sp: 0,
              tasks: []
            }
          }

          // Greedy phân bổ task cho member
          const memberList = Object.entries(memberAllocations)
          for (const t of spkg.tasks) {
            // Lọc ứng viên khớp role
            let candidates = memberList.filter(
              ([_, val]) =>
                val.role === t.role || val.role === 'FULLSTACK' || t.role === 'FULLSTACK'
            )
            if (candidates.length === 0) candidates = memberList

            // Chọn người đang nhận ít SP nhất
            candidates.sort(([_, a], [__, b]) => a.sp - b.sp)
            const chosen = candidates[0]
            if (chosen) {
              chosen[1].sp += t.storyPoint || 1
              chosen[1].tasks.push(t.title)
            }
          }

          simulatedSprintAssignments.push({
            sprintName: spkg.name,
            goal: spkg.goal,
            startDate: spkg.startDate,
            endDate: spkg.endDate,
            totalStoryPoints: spkg.totalStoryPoints,
            totalDurationDays: spkg.totalDurationDays,
            tasksCount: spkg.tasksCount,
            memberAllocations: Object.values(memberAllocations).map((val) => ({
              memberName: val.name,
              role: val.role,
              assignedSP: val.sp,
              assignedTasksCount: val.tasks.length,
              loadStatus: val.sp > 15 ? 'OVERLOADED' : val.sp >= 8 ? 'OPTIMAL' : 'MODERATE'
            }))
          })
        }
      }

      // 6. Tổng hợp toàn bộ Output cho LLM
      const masterOutput = {
        action: dryRun ? 'DRY_RUN_PROPOSAL' : 'COMMITTED_EXECUTION',
        projectId: targetProjectId,
        overview: {
          totalBacklogTasks: backlogData.totalTasks,
          totalBacklogStoryPoints: backlogData.totalStoryPoints,
          teamMembersCount: teamData.totalMembers,
          recommendedVelocityPerSprint: recommendedVelocity,
          sprintsProposedCount: dryRun ? planData.sprints?.length : planData.sprints?.length
        },
        backlogHealthCheck: backlogData.healthCheck,
        roleBreakdown: backlogData.roleBreakdown,
        sprints: dryRun ? simulatedSprintAssignments : assignmentResults
      }

      return {
        output: JSON.stringify(masterOutput),
        status: 'SUCCESS',
        summary: dryRun
          ? `Đã lập kế hoạch: ${backlogData.totalTasks} tasks $\\rightarrow$ ${simulatedSprintAssignments.length} Sprints (Preview)`
          : `Đã tạo thật ${assignmentResults.length} Sprints và gán việc vào DB`
      }
    } catch (err: any) {
      this.logger.error(`AutoOrganizeBacklogTool error: ${err?.message}`, err?.stack)
      return {
        output: `Lỗi điều phối Backlog & Sprint: ${err?.message || err}`,
        status: 'ERROR',
        summary: 'Lỗi tự động điều phối Backlog'
      }
    }
  }
}
