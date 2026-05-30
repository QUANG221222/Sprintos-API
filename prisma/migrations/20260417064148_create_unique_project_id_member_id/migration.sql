-- DropIndex
DROP INDEX "ProjectMember_memberId_idx";

-- DropIndex
DROP INDEX "ProjectMember_projectId_idx";

CREATE UNIQUE INDEX "ProjectMember_projectId_memberId_unique" ON "ProjectMember" ("projectId", "memberId") WHERE "deletedAt" IS NULL;
