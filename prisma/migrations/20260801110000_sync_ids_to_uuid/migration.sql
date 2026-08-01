-- DropForeignKey
ALTER TABLE "BoardColumn" DROP CONSTRAINT IF EXISTS "BoardColumn_sprintId_fkey";

-- DropForeignKey
ALTER TABLE "BoardColumnTaskOrder" DROP CONSTRAINT IF EXISTS "BoardColumnTaskOrder_boardColumnId_fkey";

-- DropForeignKey
ALTER TABLE "BoardColumnTaskOrder" DROP CONSTRAINT IF EXISTS "BoardColumnTaskOrder_taskId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_taskId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectChat" DROP CONSTRAINT IF EXISTS "ProjectChat_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectChatMessage" DROP CONSTRAINT IF EXISTS "ProjectChatMessage_projectChatId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectMember" DROP CONSTRAINT IF EXISTS "ProjectMember_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Sprint" DROP CONSTRAINT IF EXISTS "Sprint_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_boardColumnId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_parentId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_sprintId_fkey";

-- DropForeignKey
ALTER TABLE "TaskAssignee" DROP CONSTRAINT IF EXISTS "TaskAssignee_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskAttachment" DROP CONSTRAINT IF EXISTS "TaskAttachment_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskComment" DROP CONSTRAINT IF EXISTS "TaskComment_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskDependency" DROP CONSTRAINT IF EXISTS "TaskDependency_predecessorId_fkey";

-- DropForeignKey
ALTER TABLE "TaskDependency" DROP CONSTRAINT IF EXISTS "TaskDependency_successorId_fkey";

-- DropForeignKey
ALTER TABLE "TaskLabel" DROP CONSTRAINT IF EXISTS "TaskLabel_taskId_fkey";

-- AlterTable
ALTER TABLE "BoardColumn" DROP CONSTRAINT IF EXISTS "BoardColumn_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "sprintId" SET DATA TYPE TEXT,
ADD CONSTRAINT "BoardColumn_pkey" PRIMARY KEY ("id");
DROP SEQUENCE IF EXISTS "BoardColumn_id_seq";

-- AlterTable
ALTER TABLE "BoardColumnTaskOrder" DROP CONSTRAINT IF EXISTS "BoardColumnTaskOrder_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "boardColumnId" SET DATA TYPE TEXT,
ALTER COLUMN "taskId" SET DATA TYPE TEXT,
ADD CONSTRAINT "BoardColumnTaskOrder_pkey" PRIMARY KEY ("id");
DROP SEQUENCE IF EXISTS "BoardColumnTaskOrder_id_seq";

-- AlterTable
ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "projectId" SET DATA TYPE TEXT,
ALTER COLUMN "taskId" SET DATA TYPE TEXT,
ADD CONSTRAINT "Notification_pkey" PRIMARY KEY ("id");
DROP SEQUENCE IF EXISTS "Notification_id_seq";

-- AlterTable
ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Project_pkey" PRIMARY KEY ("id");
DROP SEQUENCE IF EXISTS "Project_id_seq";

-- AlterTable
ALTER TABLE "ProjectChat" DROP CONSTRAINT IF EXISTS "ProjectChat_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "projectId" SET DATA TYPE TEXT,
ADD CONSTRAINT "ProjectChat_pkey" PRIMARY KEY ("id");
DROP SEQUENCE IF EXISTS "ProjectChat_id_seq";

-- AlterTable
ALTER TABLE "ProjectChatMessage" DROP CONSTRAINT IF EXISTS "ProjectChatMessage_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "projectChatId" SET DATA TYPE TEXT,
ADD CONSTRAINT "ProjectChatMessage_pkey" PRIMARY KEY ("id");
DROP SEQUENCE IF EXISTS "ProjectChatMessage_id_seq";

-- AlterTable
ALTER TABLE "ProjectMember" DROP CONSTRAINT IF EXISTS "ProjectMember_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "projectId" SET DATA TYPE TEXT,
ADD CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id");
DROP SEQUENCE IF EXISTS "ProjectMember_id_seq";

-- AlterTable
ALTER TABLE "Sprint" DROP CONSTRAINT IF EXISTS "Sprint_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "projectId" SET DATA TYPE TEXT,
ALTER COLUMN "boardColumnIds" SET DATA TYPE TEXT[],
ADD CONSTRAINT "Sprint_pkey" PRIMARY KEY ("id");
DROP SEQUENCE IF EXISTS "Sprint_id_seq";

-- AlterTable
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "sprintId" SET DATA TYPE TEXT,
ALTER COLUMN "boardColumnId" SET DATA TYPE TEXT,
ALTER COLUMN "parentId" SET DATA TYPE TEXT,
ADD CONSTRAINT "Task_pkey" PRIMARY KEY ("id");
DROP SEQUENCE IF EXISTS "Task_id_seq";

-- AlterTable
ALTER TABLE "TaskAssignee" DROP CONSTRAINT IF EXISTS "TaskAssignee_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "taskId" SET DATA TYPE TEXT,
ADD CONSTRAINT "TaskAssignee_pkey" PRIMARY KEY ("id");
DROP SEQUENCE IF EXISTS "TaskAssignee_id_seq";

-- AlterTable
ALTER TABLE "TaskAttachment" DROP CONSTRAINT IF EXISTS "TaskAttachment_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "taskId" SET DATA TYPE TEXT,
ADD CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("id");
DROP SEQUENCE IF EXISTS "TaskAttachment_id_seq";

-- AlterTable
ALTER TABLE "TaskComment" DROP CONSTRAINT IF EXISTS "TaskComment_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "taskId" SET DATA TYPE TEXT,
ADD CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id");
DROP SEQUENCE IF EXISTS "TaskComment_id_seq";

-- AlterTable
ALTER TABLE "TaskDependency" DROP CONSTRAINT IF EXISTS "TaskDependency_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "predecessorId" SET DATA TYPE TEXT,
ALTER COLUMN "successorId" SET DATA TYPE TEXT,
ADD CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id");
DROP SEQUENCE IF EXISTS "TaskDependency_id_seq";

-- AlterTable
ALTER TABLE "TaskLabel" DROP CONSTRAINT IF EXISTS "TaskLabel_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "taskId" SET DATA TYPE TEXT,
ADD CONSTRAINT "TaskLabel_pkey" PRIMARY KEY ("id");
DROP SEQUENCE IF EXISTS "TaskLabel_id_seq";

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "BoardColumn" ADD CONSTRAINT "BoardColumn_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "BoardColumnTaskOrder" ADD CONSTRAINT "BoardColumnTaskOrder_boardColumnId_fkey" FOREIGN KEY ("boardColumnId") REFERENCES "BoardColumn"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "BoardColumnTaskOrder" ADD CONSTRAINT "BoardColumnTaskOrder_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_boardColumnId_fkey" FOREIGN KEY ("boardColumnId") REFERENCES "BoardColumn"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TaskLabel" ADD CONSTRAINT "TaskLabel_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ProjectChat" ADD CONSTRAINT "ProjectChat_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectChatMessage" ADD CONSTRAINT "ProjectChatMessage_projectChatId_fkey" FOREIGN KEY ("projectChatId") REFERENCES "ProjectChat"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
