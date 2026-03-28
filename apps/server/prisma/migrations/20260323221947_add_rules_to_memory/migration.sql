-- AlterTable
-- Using IF NOT EXISTS: projectRules was already added to project_memories outside this migration.
-- This makes the migration safe to re-run without failing on duplicate column.
ALTER TABLE "project_memories" ADD COLUMN IF NOT EXISTS "projectRules" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
-- Using IF NOT EXISTS: guards against userRules already existing in user_memories.
ALTER TABLE "user_memories" ADD COLUMN IF NOT EXISTS "userRules" JSONB NOT NULL DEFAULT '[]';
