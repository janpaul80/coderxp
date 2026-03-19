-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "fileCount" INTEGER,
ADD COLUMN     "totalBytes" INTEGER,
ADD COLUMN     "workspacePath" TEXT;
