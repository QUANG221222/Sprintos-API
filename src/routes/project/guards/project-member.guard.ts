import {
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException
} from '@nestjs/common'
import { PrismaService } from '~/shared/services/prisma.service'
import { REQUEST_USER_KEY } from '~/shared/constants/auth.constants'
import { AccessTokenPayLoad } from '~/shared/types/jwt.type'
import { ProjectMemberStatus } from '~/generated/prisma/client'
import {
	ProjectForbiddenError,
	ProjectIdRequiredError,
	ProjectNotFoundError
} from '../project.error'

@Injectable()
export class ProjectMemberGuard implements CanActivate {
	constructor(private readonly prismaService: PrismaService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest()
		const user = request[REQUEST_USER_KEY] as AccessTokenPayLoad | undefined
		if (!user) {
			throw new UnauthorizedException('Unauthorized')
		}

		const projectIdRaw = request.params?.projectId ?? request.body?.projectId
		const projectId = Number(projectIdRaw)
		if (!projectIdRaw || Number.isNaN(projectId)) {
			throw ProjectIdRequiredError
		}

		const project = await this.prismaService.project.findFirst({
			where: {
				id: projectId,
				deletedAt: null
			},
			select: {
				ownerId: true
			}
		})

		if (!project) {
			throw ProjectNotFoundError
		}

		if (project.ownerId === user.userId) {
			return true
		}

		const member = await this.prismaService.projectMember.findFirst({
			where: {
				projectId,
				memberId: user.userId,
				status: ProjectMemberStatus.ACTIVE,
				deletedAt: null
			},
			select: { id: true }
		})

		if (!member) {
			throw ProjectForbiddenError
		}

		return true
	}
}
