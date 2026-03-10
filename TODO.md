# Phase 5 Slice 1 — Launch Readiness & Reliability Hardening

## Completed: @ts-nocheck Removal & Typed Contracts

- [x] Remove `@ts-nocheck` from `apps/server/src/lib/prisma.ts` — singleton export, clean types
- [x] Remove `@ts-nocheck` from `apps/server/src/routes/auth.ts` — `Prisma.PrismaClientKnownRequestError` typed
- [x] Remove `@ts-nocheck` from `apps/server/src/services/planner.ts` — `Prisma.InputJsonValue`, `?.length ?? 0` fixed
- [x] Remove `@ts-nocheck` from `apps/server/src/services/buildTelemetry.ts` — full typed contracts, `nullableJson()` helper
- [x] Remove `@ts-nocheck` from `apps/server/src/jobs/builderQueue.ts` — singleton prisma, `JobStatus`/`BuildLogStep`/`CommandSummary` typed, Worker `concurrency` typed, `fileCount`/`totalBytes` via expanded `JobStepPatch`, all `as any` removed

## Completed: Telemetry Integration (Backend)

- [x] Create `buildTelemetry.ts` foundation module
- [x] Integrate telemetry into `builderQueue.ts`
  - [x] Replace scattered direct step/status updates with centralized `setJobStep`
  - [x] Persist structured logs via `appendJobLog`
  - [x] Keep socket `job:log` emissions aligned with persisted logs
  - [x] Persist runtime-proven metadata only
  - [x] Persist `failureCategory` with clean phase mapping
  - [x] Align retry semantics with BullMQ attempt context
- [x] Integrate telemetry callbacks into `previewManager.ts`
  - [x] Runtime hooks for install/start/health phases
  - [x] Pass command summary + failure phase back to builder queue

## Completed: Runtime Verification

- [x] Docker confirmed: `opencut-main-redis-1` on `0.0.0.0:6379`, `codedxp_postgres` on `localhost:5433`
- [x] Server starts cleanly — queue/worker healthy, no ECONNREFUSED
- [x] Upload matrix validation — A1–A4 all passing
- [x] API edge-case validation — auth, projects, chats/plans, billing, preview/job endpoints
- [x] Happy-path job: DB/socket/runtime alignment — full lifecycle verified
- [x] Cross-layer consistency — DB ↔ socket events ↔ runtime ↔ endpoint responses aligned
- [x] **test-closeout.mjs: 49/50 (98%)** — 1 carry-forward: H3 `/me` token sequencing in test harness (not a server bug)
- [x] **test-phase2-closeout.mjs: 74/74 (100%)** — full job lifecycle, npm install 169s, preview at :3101 ✅
- [x] **test-phase3d.mjs: 24/24 (100%)** — full E2E: LLM → approve → build → preview at :3102 ✅
- [x] Induced failure path: categorized failure + aligned events/state — **test-phase5-slice2.mjs PASSED (9.9s)** ✅
  - inject-failure-job → worker "Plan not found" → `scaffold_failure` persisted ✅
  - `/status`: status=failed, failureCategory=scaffold_failure, previewStatus=failed, errorDetails (268 chars) ✅
  - `/health`: healthy=false, failureCategory=scaffold_failure, error="Plan not found" ✅
  - `/logs`: all filter variants (level, step, limit) return 200 ✅

## Completed: Preview Route Enrichment (Phase 5 Slice 2)

- [x] `apps/server/src/routes/preview.ts` — @ts-nocheck removed, full rewrite
  - [x] `POST /test/inject-failure-job` — dev-only failure injection endpoint
  - [x] `GET /:jobId/status` — enriched: all DB fields + `live` object
  - [x] `GET /:jobId/health` — enriched: failureCategory, error, dbStatus, reason
  - [x] `GET /:jobId/logs` — new endpoint: filterable by level/step, limit param
- [x] `apps/server/src/services/buildTelemetry.ts` — `errorDetails?: string | null` in `JobStepPatch`
- [x] `apps/server/src/jobs/builderQueue.ts` — `let currentPhase` tracking, outer catch uses `classifyFailure(err, currentPhase)` + `errorDetails` + `previewStatus: 'failed'`

## Phase 5 Slice 3 — Multi-Worker Infrastructure (COMPLETE)

- [x] Schema: `workerName String?` + `workerSelectedReason String?` added to Job model
- [x] Migration `20260310202229_phase5_worker_routing` applied ✅
- [x] `apps/server/src/services/workerRouter.ts` — NEW: health polling, `selectWorker()`, `getWorkerHealthStatus()`
- [x] `apps/server/src/routes/workerInternal.ts` — NEW: `POST /internal/worker/emit` relay, `GET /internal/worker/router-health`
- [x] `apps/server/src/worker.ts` — NEW: standalone BullMQ Worker entry point for remote nodes
- [x] `apps/server/src/services/buildTelemetry.ts` — `workerName`/`workerSelectedReason` added to `JobStepPatch` + `setJobStep`
- [x] `apps/server/src/socket/events.ts` — `plan:approve` uses `selectWorker()` + persists routing metadata
- [x] `apps/server/src/routes/preview.ts` — `inject-failure-job` uses `selectWorker()` + persists routing metadata
- [x] `apps/server/src/index.ts` — registers `/internal` router, calls `startHealthPolling()` on listen, `stopHealthPolling()` on shutdown
- [x] `apps/server/src/env.ts` — logs all `WORKER_*` env vars at startup
- [x] `tsc --noEmit` → 0 errors ✅
- [x] Server starts cleanly in local-only mode (no `WORKER_PRIMARY_URL` set) ✅
- [x] `[WorkerRouter] No remote workers configured — running in local-only mode` logged ✅
- [x] `test-phase5-slice2.mjs` — 9/9 (100%) ✅ (backward compat: failure injection still works)
- [x] `test-phase2-closeout.mjs` — 74/74 (100%) ✅ (full regression: no regressions)

## Env Vars Added (Phase 5 Slice 3)

| Var | Default | Purpose |
|-----|---------|---------|
| `WORKER_PRIMARY_URL` | (unset) | Base URL of primary GPU worker (e.g. `http://x.x.x.220:3002`) |
| `WORKER_PRIMARY_NAME` | `primary` | Display name for primary worker |
| `WORKER_FAILOVER_URL` | (unset) | Base URL of failover worker |
| `WORKER_FAILOVER_NAME` | `failover` | Display name for failover worker |
| `WORKER_INTERNAL_SECRET` | (unset) | Shared secret for `/internal/worker/emit` relay auth |
| `WORKER_HEALTH_TIMEOUT_MS` | `5000` | Per-probe HTTP timeout |
| `WORKER_HEALTH_INTERVAL_MS` | `30000` | Health poll interval |
| `WORKER_HEALTH_FAIL_THRESHOLD` | `2` | Consecutive failures before marking unhealthy |

## Next Pass (Do Not Start Yet)

- [ ] Deploy `worker.ts` to Brev/Crusoe A100 node — set `WORKER_PRIMARY_URL` + `WORKER_INTERNAL_SECRET`
- [ ] Optional frontend transparency updates (only after backend hardening pass + proofs)
