-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "workTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];
