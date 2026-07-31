import { Injectable } from "@nestjs/common";
import { PrismaService } from "../services/prisma.service";
import { GetProjectDetailResType } from "../models/shared-project.model";
import { ProjectMemberRole } from "../constants/project.constants";

@Injectable()
export class SharedProjectRepository {
    constructor(
        private readonly prismaService: PrismaService
    ) {}

    async findProjectById(projectId: string): Promise<GetProjectDetailResType | null> {
        const project = await this.prismaService.project.findFirst({
            where: {
                id: projectId,
                deletedAt: null
            },
            include: {
                members: {
                    include: {
                        role: true
                    }
                }
            }
        })
        if (!project) return null
        return {
            ...project,
            members: project.members.map(member => ({
                ...member,
                role: member.role.name as typeof ProjectMemberRole[keyof typeof ProjectMemberRole]
            }))
        }
    }
}