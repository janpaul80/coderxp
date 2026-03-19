-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "buildMeta" JSONB,
ADD COLUMN     "commandSummary" JSONB,
ADD COLUMN     "failureCategory" TEXT,
ADD COLUMN     "generatedFileCount" INTEGER,
ADD COLUMN     "generatedKeyFiles" JSONB,
ADD COLUMN     "generatedTotalBytes" INTEGER,
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scaffoldValidation" JSONB;
