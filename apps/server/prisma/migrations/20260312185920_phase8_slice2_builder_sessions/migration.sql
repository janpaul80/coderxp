-- CreateEnum
CREATE TYPE "BuilderSessionStatus" AS ENUM ('in_progress', 'spec_ready', 'approved', 'building', 'complete', 'abandoned');

-- CreateTable
CREATE TABLE "builder_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "builderType" TEXT NOT NULL,
    "status" "BuilderSessionStatus" NOT NULL DEFAULT 'in_progress',
    "difyConversationId" TEXT,
    "spec" JSONB,
    "planId" TEXT,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "builder_sessions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "builder_sessions" ADD CONSTRAINT "builder_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "builder_sessions" ADD CONSTRAINT "builder_sessions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
