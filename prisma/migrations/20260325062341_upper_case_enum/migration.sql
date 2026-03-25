/*
  Warnings:

  - The values [backlog,todo,in_process,review,done] on the enum `BoardColumnTitle` will be removed. If these variants are still used in the database, this will fail.
  - The values [owner,member,viewer] on the enum `ProjectMemberRole` will be removed. If these variants are still used in the database, this will fail.
  - The values [active,pending] on the enum `ProjectMemberStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [planned,active,completed] on the enum `SprintStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [low,medium,high,critical] on the enum `TaskPriority` will be removed. If these variants are still used in the database, this will fail.
  - The values [admin,user] on the enum `UserRole` will be removed. If these variants are still used in the database, this will fail.
  - The values [active,inactive] on the enum `UserStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "BoardColumnTitle_new" AS ENUM ('BACKLOG', 'TODO', 'IN_PROCESS', 'REVIEW', 'DONE');
ALTER TABLE "BoardColumn" ALTER COLUMN "title" TYPE "BoardColumnTitle_new" USING ("title"::text::"BoardColumnTitle_new");
ALTER TYPE "BoardColumnTitle" RENAME TO "BoardColumnTitle_old";
ALTER TYPE "BoardColumnTitle_new" RENAME TO "BoardColumnTitle";
DROP TYPE "public"."BoardColumnTitle_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "ProjectMemberRole_new" AS ENUM ('OWNER', 'MEMBER', 'VIEWER');
ALTER TABLE "ProjectMember" ALTER COLUMN "role" TYPE "ProjectMemberRole_new" USING ("role"::text::"ProjectMemberRole_new");
ALTER TYPE "ProjectMemberRole" RENAME TO "ProjectMemberRole_old";
ALTER TYPE "ProjectMemberRole_new" RENAME TO "ProjectMemberRole";
DROP TYPE "public"."ProjectMemberRole_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "ProjectMemberStatus_new" AS ENUM ('ACTIVE', 'PENDING');
ALTER TABLE "public"."ProjectMember" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ProjectMember" ALTER COLUMN "status" TYPE "ProjectMemberStatus_new" USING ("status"::text::"ProjectMemberStatus_new");
ALTER TYPE "ProjectMemberStatus" RENAME TO "ProjectMemberStatus_old";
ALTER TYPE "ProjectMemberStatus_new" RENAME TO "ProjectMemberStatus";
DROP TYPE "public"."ProjectMemberStatus_old";
ALTER TABLE "ProjectMember" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "SprintStatus_new" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED');
ALTER TABLE "public"."Sprint" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Sprint" ALTER COLUMN "status" TYPE "SprintStatus_new" USING ("status"::text::"SprintStatus_new");
ALTER TYPE "SprintStatus" RENAME TO "SprintStatus_old";
ALTER TYPE "SprintStatus_new" RENAME TO "SprintStatus";
DROP TYPE "public"."SprintStatus_old";
ALTER TABLE "Sprint" ALTER COLUMN "status" SET DEFAULT 'PLANNED';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "TaskPriority_new" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
ALTER TABLE "Task" ALTER COLUMN "priority" TYPE "TaskPriority_new" USING ("priority"::text::"TaskPriority_new");
ALTER TYPE "TaskPriority" RENAME TO "TaskPriority_old";
ALTER TYPE "TaskPriority_new" RENAME TO "TaskPriority";
DROP TYPE "public"."TaskPriority_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'USER');
ALTER TABLE "public"."User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "public"."UserRole_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "UserStatus_new" AS ENUM ('ACTIVE', 'INACTIVE');
ALTER TABLE "public"."User" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "status" TYPE "UserStatus_new" USING ("status"::text::"UserStatus_new");
ALTER TYPE "UserStatus" RENAME TO "UserStatus_old";
ALTER TYPE "UserStatus_new" RENAME TO "UserStatus";
DROP TYPE "public"."UserStatus_old";
ALTER TABLE "User" ALTER COLUMN "status" SET DEFAULT 'INACTIVE';
COMMIT;

-- AlterTable
ALTER TABLE "ProjectMember" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Sprint" ALTER COLUMN "status" SET DEFAULT 'PLANNED';

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER',
ALTER COLUMN "status" SET DEFAULT 'INACTIVE';
