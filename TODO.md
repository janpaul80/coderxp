# Phase 9 — Product Quality Fixes (6 Gaps from Live Test)

## Current Status
All prior phases complete (Phase 8 Slice 2: 84/84 ✅). AI providers working. User tested live flow and identified 6 critical product gaps.

## User Test Results (landing page request)
- Plan approved: "responsive landing page with hero, features, pricing, contact form"
- Build completed in ~4min
- Result: incomplete (missing pricing, contact, testimonials, footer)
- Complaint → triggered new plan instead of repair
- No file explorer visibility
- Coding visibility weak (file count badges but no structure)

## 6 Product Gaps & Implementation Plan

### Gap 1: File Explorer Visibility [Priority 1] ✅ COMPLETE
**Problem**: No way to inspect generated files/folders/project structure
**Files**:
- [x] NEW `apps/web/src/components/explorer/FileExplorer.tsx` — tree view with expand/collapse, file icons
- [x] MODIFY `apps/web/src/components/layout/RightPanel.tsx` — added 'explorer' tab in preview/building views
- [x] NEW `apps/server/src/routes/workspaces.ts` — `GET /api/workspaces/:jobId/files` endpoint
- [x] MODIFY `apps/server/src/index.ts` — registered `/api/workspaces` route
- [x] MODIFY `apps/web/src/types/index.ts` — added `workspacePath?: string` to `Job` interface

### Gap 2: Live Coding Visibility [Priority 2] ✅ COMPLETE
**Problem**: Build activity too weak — no sense of real coding happening
**Files**:
- [x] MODIFY `apps/web/src/components/execution/TimelineEvent.tsx` — code snippet preview, stronger create animation, code toggle button
- [x] MODIFY `apps/web/src/components/execution/ExecutionTimeline.tsx` — LiveActivityBar: typewriter path animation, file counter, pulse dot

### Gap 3: Incomplete Builds (missing sections) [Priority 3] ✅ COMPLETE
**Problem**: Landing pages missing pricing/contact/footer/testimonials sections
**Files**:
- [x] MODIFY `apps/server/src/services/planner.ts` — COMPLETENESS RULES in `PLANNER_SYSTEM_PROMPT`; completeness-aware `buildFallbackPlanFromRequest()`
- [x] MODIFY `apps/server/src/jobs/builderQueue.ts` — `validateSectionCompleteness()` helper; emits `job:completion_warning` with `missingSections`; stores in `buildMeta`

### Gap 4: Complaint Triggers New Plan Instead of Repair [Priority 4] ✅ COMPLETE
**Problem**: User complaint about missing section → AI generates new plan instead of repair response
**Files**:
- [x] MODIFY `apps/server/src/services/planner.ts` — added `'fix_request'` to `PlannerIntent`; updated `classifyIntent` system prompt + `heuristicClassify` with fix patterns; added `generateRepairResponse()`
- [x] MODIFY `apps/server/src/socket/events.ts` — `fix_request` case: checks recent job, calls `generateRepairResponse()`, emits `job:repair_suggested` if job failed

### Gap 5: Weak Conversational Handling (plan spam) [Priority 5] ✅ COMPLETE
**Problem**: Every message triggers a plan — questions/greetings get plan responses
**Files**:
- [x] MODIFY `apps/server/src/services/planner.ts` — added `generateConversationalResponse()`; `question` intent separated from `clarification_needed`
- [x] MODIFY `apps/server/src/socket/events.ts` — `question` intent → `generateConversationalResponse()` (no plan); `clarification_needed` → `generateClarification()` only

### Gap 6: Early Completion Without Validation [Priority 6] ✅ COMPLETE
**Problem**: Builder marks job complete without checking if planned sections were delivered
**Files**:
- [x] MODIFY `apps/server/src/jobs/builderQueue.ts` — `validateSectionCompleteness(frontendScope, fileTree)` runs after workspace validation; emits `job:completion_warning`; stores `missingSections` in `buildMeta`

---

## All 6 Gaps: ✅ COMPLETE

### Summary of Changes
| File | Changes |
|------|---------|
| `apps/server/src/services/planner.ts` | `fix_request` intent, completeness rules, `generateRepairResponse()`, `generateConversationalResponse()`, `savePlannerRun()` |
| `apps/server/src/socket/events.ts` | `fix_request` → repair path; `question` → conversational; separated from `clarification_needed` |
| `apps/server/src/jobs/builderQueue.ts` | `validateSectionCompleteness()`, `job:completion_warning` event, `missingSections` in `buildMeta` |
| `apps/server/src/routes/workspaces.ts` | `GET /api/workspaces/:jobId/files` |
| `apps/server/src/routes/jobs.ts` | `GET /api/jobs/active`, `GET /api/jobs/active/completed` |
| `apps/server/src/index.ts` | Registered `/api/workspaces`, `/api/jobs` routes |
| `apps/web/src/components/explorer/FileExplorer.tsx` | File tree component |
| `apps/web/src/components/layout/RightPanel.tsx` | Explorer tab in preview/building views |
| `apps/web/src/components/execution/TimelineEvent.tsx` | Code snippet preview, stronger animations |
| `apps/web/src/components/execution/ExecutionTimeline.tsx` | LiveActivityBar with typewriter + file counter |
| `apps/web/src/types/index.ts` | `workspacePath?: string` on `Job` |

---

# Production Deployment — coderxp.app

## SSL / HTTPS ✅ COMPLETE
- SSL Labs rating: **A** (verified Mon 16 Mar 2026)
- Let's Encrypt cert issued for `coderxp.app` + `www.coderxp.app`
- HTTP → HTTPS redirect: ✅ (308)
- Auto-renewal: ✅ (certbot systemd timer)
- nginx config: `nginx/coderxp.app.conf`

## Deployment Scripts ✅ READY
| Script | Purpose | Run where |
|--------|---------|-----------|
| `scripts/setup-ssl.sh` | nginx + Let's Encrypt SSL | On server as root (DONE ✅) |
| `scripts/server-setup.sh` | Node.js, pnpm, pm2, Docker, Postgres, Redis, env template, migrations, pm2 start | On server as root (PENDING ⏳) |
| `scripts/deploy.sh` | Build frontend + rsync frontend + rsync backend + pnpm install + migrations + pm2 restart | From local machine (PENDING ⏳) |
| `test-ssl-verify.mjs` | Post-SSL live HTTPS verification (12 checks) | From local machine |

## Deployment Status
- [x] SSL certificate issued — A rating ✅
- [x] nginx config deployed on server ✅
- [x] `scripts/server-setup.sh` created — installs Node.js 22, pnpm, pm2, Docker, Postgres, Redis, env template, migrations, pm2 start
- [x] `scripts/deploy.sh` updated — now deploys both frontend AND backend (rsync source, pnpm install, prisma migrate, pm2 restart)
- [ ] `server-setup.sh` run on server — Node.js/pm2/Docker/Postgres/Redis not yet installed
- [ ] `.env.local` filled in on server — JWT_SECRET + AI provider keys needed
- [ ] Backend running on port 3001 on server
- [ ] Frontend built + deployed to `/var/www/coderxp/dist`
- [ ] `https://coderxp.app` fully live (app + API + sockets)

## Required Deployment Steps (in order)

### Step A — Run server-setup.sh on server (one-time)
```bash
# Copy script to server
scp codedxp/scripts/server-setup.sh root@87.106.111.220:/root/

# SSH in and run it
ssh root@87.106.111.220
chmod +x /root/server-setup.sh
/root/server-setup.sh
# Script will pause and ask you to fill in /opt/coderxp/.env.local
# Set JWT_SECRET (openssl rand -hex 32) and at least one AI provider key
```

### Step B — Run deploy.sh from local machine
```bash
# From codedxp/ directory on your local machine:
chmod +x scripts/deploy.sh
./scripts/deploy.sh
# Builds frontend, rsyncs frontend + backend, runs migrations, restarts pm2
```

### Step C — Run post-SSL live verification
```bash
node test-ssl-verify.mjs
# Should show: 🎉 ALL CHECKS PASSED
```

## Production Environment Variables (set in /opt/coderxp/.env.local on server)
| Variable | Required | Value |
|----------|----------|-------|
| `DATABASE_URL` | ✅ | `postgresql://codedxp:codedxp_secret@localhost:5433/codedxp_db` (pre-filled) |
| `REDIS_URL` | ✅ | `redis://localhost:6379` (pre-filled) |
| `JWT_SECRET` | ✅ | Generate: `openssl rand -hex 32` |
| `PORT` | ✅ | `3001` (pre-filled) |
| `NODE_ENV` | ✅ | `production` (pre-filled) |
| `CLIENT_URL` | ✅ | `https://coderxp.app` (pre-filled) |
| `BLACKBOX_KEYS` | ✅ (one AI key required) | Your BlackBox API keys |
| `OPEN_ROUTER_API_KEY` | optional | Alternative AI provider |
| `DIFY_API_KEY` | optional | Phase 8 Slice 2 AI builders |
