-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('STORY', 'TASK', 'BUG', 'TECH_DEBT', 'EPIC');

-- AlterTable
ALTER TABLE "BoardColumn" ADD COLUMN     "color" VARCHAR(50),
ADD COLUMN     "isBlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isCancelled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isDone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isWip" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "type" "TaskType" NOT NULL DEFAULT 'TASK';

-- CreateTable
CREATE TABLE "SprintDailySnapshot" (
    "id" TEXT NOT NULL,
    "sprintId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "remainingStoryPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completedStoryPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalStoryPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SprintDailySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SprintDailySnapshot_sprintId_date_idx" ON "SprintDailySnapshot"("sprintId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SprintDailySnapshot_sprintId_date_key" ON "SprintDailySnapshot"("sprintId", "date");

-- CreateIndex
CREATE INDEX "BoardColumn_isDone_idx" ON "BoardColumn"("isDone");

-- AddForeignKey
ALTER TABLE "SprintDailySnapshot" ADD CONSTRAINT "SprintDailySnapshot_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
