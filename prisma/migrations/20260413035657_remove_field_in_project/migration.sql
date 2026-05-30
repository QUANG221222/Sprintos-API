/*
  Warnings:

  - You are about to drop the column `imagePublicId` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `imageUrl` on the `Project` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Project" DROP COLUMN "imagePublicId",
DROP COLUMN "imageUrl",
ADD COLUMN     "image" TEXT;

-- DropEnum
DROP TYPE "UserRole";
