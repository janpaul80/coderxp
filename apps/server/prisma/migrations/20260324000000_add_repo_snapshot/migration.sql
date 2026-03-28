-- Sprint 8: Repo-Aware Memory Layer
-- Adds repoSnapshot column to project_memories.
-- Stores a structural snapshot of the generated workspace (file tree, components,
-- routes, API endpoints, Prisma models, dependencies) captured after every
-- successful build. Injected into planning, generation, repair, and continuation.
--
-- Uses IF NOT EXISTS — safe to re-run if migration state is ever reset.

ALTER TABLE "project_memories" ADD COLUMN IF NOT EXISTS "repoSnapshot" JSONB;
