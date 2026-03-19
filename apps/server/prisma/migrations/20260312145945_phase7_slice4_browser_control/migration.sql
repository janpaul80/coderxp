-- CreateEnum
CREATE TYPE "BrowserSessionStatus" AS ENUM ('pending_approval', 'active', 'completed', 'terminated_by_user', 'terminated_timeout', 'failed');

-- CreateEnum
CREATE TYPE "BrowserActionType" AS ENUM ('navigate', 'click', 'type_text', 'screenshot', 'wait', 'scroll', 'extract_text');

-- CreateEnum
CREATE TYPE "BrowserActionStatus" AS ENUM ('pending', 'executing', 'complete', 'failed');

-- CreateTable
CREATE TABLE "browser_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT,
    "domain" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "plannedActions" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "status" "BrowserSessionStatus" NOT NULL DEFAULT 'pending_approval',
    "grantedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "browser_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "browser_actions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "BrowserActionType" NOT NULL,
    "description" TEXT NOT NULL,
    "target" TEXT,
    "value" TEXT,
    "screenshotBeforePath" TEXT,
    "screenshotAfterPath" TEXT,
    "status" "BrowserActionStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "browser_actions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "browser_sessions" ADD CONSTRAINT "browser_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_actions" ADD CONSTRAINT "browser_actions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "browser_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
