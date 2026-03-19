-- CreateEnum
CREATE TYPE "CredentialRequestStatus" AS ENUM ('pending', 'provided', 'skipped', 'expired', 'cancelled');

-- CreateTable
CREATE TABLE "credential_requests" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "integration" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "status" "CredentialRequestStatus" NOT NULL DEFAULT 'pending',
    "providedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_requests_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "credential_requests" ADD CONSTRAINT "credential_requests_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_requests" ADD CONSTRAINT "credential_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
