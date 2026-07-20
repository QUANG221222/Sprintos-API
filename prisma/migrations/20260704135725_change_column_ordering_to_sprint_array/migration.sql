-- AlterTable
ALTER TABLE "Sprint" ADD COLUMN     "boardColumnIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "BoardColumn" DROP COLUMN "position";
