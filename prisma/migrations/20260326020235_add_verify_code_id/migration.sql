/*
  Warnings:

  - You are about to drop the column `verifyToken` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "verifyToken",
ADD COLUMN     "verifyCodeId" INTEGER;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_verifyCodeId_fkey" FOREIGN KEY ("verifyCodeId") REFERENCES "VerificationCode"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
