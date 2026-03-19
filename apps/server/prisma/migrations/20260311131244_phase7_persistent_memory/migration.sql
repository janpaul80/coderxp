-- CreateTable
CREATE TABLE "project_memories" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferredStack" JSONB,
    "authProvider" TEXT,
    "integrations" JSONB NOT NULL DEFAULT '[]',
    "approvedDirection" TEXT,
    "lastBuildStatus" TEXT,
    "lastBuildMeta" JSONB,
    "failureHistory" JSONB NOT NULL DEFAULT '[]',
    "decisions" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_memories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferredStack" JSONB,
    "knownIntegrations" JSONB NOT NULL DEFAULT '[]',
    "projectHistory" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_memories_projectId_key" ON "project_memories"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "user_memories_userId_key" ON "user_memories"("userId");

-- AddForeignKey
ALTER TABLE "project_memories" ADD CONSTRAINT "project_memories_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_memories" ADD CONSTRAINT "project_memories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_memories" ADD CONSTRAINT "user_memories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
