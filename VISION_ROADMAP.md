# CoderXP Vision Roadmap — Product Direction Reset

Generated: 2026-03-30
Status: Active

## Core Vision

CoderXP is an autonomous product-building machine. Users go from idea to real working app to deployable product. Not a prototype generator. Not a template stamper. A real builder.

## Current State Assessment

### What works
- Real build pipeline (BullMQ, workspace, npm install, Vite dev server)
- Real preview system (port allocation, health checks, content validation, self-heal)
- Real-time streaming (Socket.IO: file tokens, terminal logs, file changes, agent status)
- AI planner (intent classification, structured plans, Zod validation)
- Multi-provider AI (OpenRouter, Blackbox, OpenClaw, Langdock + circuit breakers)
- 13-agent architecture with status tracking
- Integration support (Supabase OAuth, Stripe checkout/webhooks)
- Memory system (project/user memory, repo snapshots, rules)
- Plugin system, test engine, security audit, database architect, refactor agent

### Critical gaps
1. AI code generation is disabled (TEMPLATE-FIRST MODE returns null)
2. Backend server never starts in preview (only Vite frontend runs)
3. Templates produce generic landing pages regardless of project type
4. No database in preview (schema generated but never migrated)
5. Chat flow over-promises vs actual output quality

## Implementation Phases

### Phase 1: Make It Real
Priority: CRITICAL
- [ ] Re-enable AI code generation (remove TEMPLATE-FIRST block)
- [ ] Test AI generation with Blackbox provider
- [ ] Verify streaming tokens appear in frontend during AI generation
- [ ] Improve fallback templates with domain-specific content

### Phase 2: Full-Stack Preview
Priority: HIGH
- [ ] Start Express backend alongside Vite in preview
- [ ] Add SQLite as zero-config preview database
- [ ] Run prisma db push during build
- [ ] Configure Vite proxy for API calls
- [ ] Make login/register/CRUD functional in preview

### Phase 3: Domain-Specific Intelligence
Priority: HIGH
- [ ] Enhanced AI prompts for SaaS / dashboard / e-commerce / admin / chat apps
- [ ] Domain-specific Prisma models (Leads, Products, Messages, etc.)
- [ ] Generated CRUD endpoints matching domain models
- [ ] Real dashboard components (data tables, charts, metrics)
- [ ] Auth state management in generated apps

### Phase 4: Export & Deploy
Priority: MEDIUM
- [ ] GitHub export (create repo + push)
- [ ] Vercel deployment config (vercel.json)
- [ ] Docker support (Dockerfile)
- [ ] Complete README with setup instructions

### Phase 5: Agentic Refinement
Priority: MEDIUM
- [ ] Iterative modification (regenerate individual files)
- [ ] Visual Builder integration for live editing
- [ ] HMR feedback loop
- [ ] Error-driven auto-repair
