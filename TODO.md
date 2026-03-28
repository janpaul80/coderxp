# Phase 11 — Autonomous Build Platform: Completion Plan

## Current State (as of 2026-03-24)
- SSL: 18/18 ✅ — coderxp.pro fully live (verified post Sprint 5 deploy + cutover)
- Sprint 1 COMPLETE ✅ — 47/47 e2e, preview proxy, dynamic file generation
- Sprint 2 COMPLETE ✅ — targeted repair (generateRepairPlan + repairProjectFiles), Langdock Gap 7
- Sprint 3 COMPLETE ✅ — tsc clean, 18/18 SSL, 47/47 e2e, deployed
- Sprint 4 COMPLETE ✅ — Memory/Rules system, Richer Chat (Mermaid+GFM), Settings Modal wired
- Sprint 5 COMPLETE ✅ — Memory-aware codegen (Gap 8), Build continuation (Gap 9), Multi-server preview routing (Gap 10), coderxp.pro cutover 18/18
- Sprint 6 IN PROGRESS — Token streaming wiring, preview health, continuation e2e, memory e2e
- Build pipeline: plan → approve → generate files → npm install → Vite preview
- Providers: Blackbox (primary), OpenRouter, Langdock (Agent API), OpenClaw (local)
- Frontend: full component tree — chat, timeline, file explorer, credential modal, browser view, settings modal

### Carry-forward (Sprint 5 → Sprint 6)
- Gap 10 multi-server runtime proof: DEFERRED — requires ≥2 active servers. Tracked below.

### Deployment Rule (enforced in deploy.sh Step 5b — do not regress)
- Always use `rsync "$DIST_DIR/" "$SERVER:$SERVER_DEST/"` (trailing slash preserves `assets/` subdir)
- Always reset permissions after deploy: `chown -R www-data:www-data $DEST && find $DEST -type d -exec chmod 755 {} + && find $DEST -type f -exec chmod 644 {} +`
- Root cause of past 404s: `assets/` dir created with root-only perms (mode 700) when using `mv` or `mkdir` manually

---

## Gap Analysis — What Is Actually Broken or Missing

### 🔴 CRITICAL BLOCKERS (product unusable without these)

#### Gap 1: Preview URL is server-local — users cannot see their builds
**Root cause**: `previewManager.ts` allocates ports 3100–3200 on the server and returns
`http://localhost:PORT` as the preview URL. This URL is sent to the user's browser as an
iframe `src`. A remote user's browser resolves `localhost` as their own machine — not the
server. The preview is invisible to every remote user.

**Fix required**: Add a Node.js reverse-proxy route:
`GET /api/preview/:jobId/app/*` → `http://localhost:PORT/*`
This proxies the Vite dev server through the existing nginx → Node.js path.

**Files to touch**:
- `apps/server/src/routes/preview.ts` — add proxy handler using `http-proxy-middleware` or manual `http.request`
- `apps/server/src/jobs/builderQueue.ts` — change `previewUrl` stored in DB from `http://localhost:PORT` to `https://coderxp.pro/api/preview/:jobId/app/`
- `nginx/coderxp.pro.conf` — verify `/api/preview/` is proxied (it is, via `/api/*`)

#### Gap 2: Dynamic file generation — frontendScope is ignored
**Root cause**: `buildFileSpecs()` in `codeGenerator.ts` generates a fixed set of files:
`Home.tsx`, `Login.tsx`, `Register.tsx`, `Dashboard.tsx`. If the plan's `frontendScope`
contains `["Pricing page", "Contact page", "Blog page", "About page", "Testimonials section"]`,
none of those files are generated. The plan is complete but the code is not.

**Fix required**: Parse `plan.frontendScope` and dynamically generate a page file for each
scope item that doesn't already have a fixed spec. Map scope items to file paths:
- "Pricing page" → `src/pages/Pricing.tsx`
- "Contact page" → `src/pages/Contact.tsx`
- "About page" → `src/pages/About.tsx`
- "Blog page" → `src/pages/Blog.tsx`
- "Testimonials section" → `src/components/Testimonials.tsx`
- etc.

**Files to touch**:
- `apps/server/src/services/codeGenerator.ts` — `buildFileSpecs()`: add dynamic scope-driven specs
- `apps/server/src/services/codeGeneratorPrompts.ts` — add `promptGenericPage()` for dynamic pages
- `apps/server/src/services/codeGeneratorFallbacks.ts` — add `fallbackGenericPage()` for dynamic pages
- `apps/server/src/App.tsx` (generated) — `promptAppTsx()` must include routes for all dynamic pages

---

### 🟠 HIGH PRIORITY (product is weak without these)

#### Gap 3: Repair is a full rebuild — complaint context is discarded
**Root cause**: `job:repair` socket event re-queues the entire build job from scratch.
The user's complaint (e.g. "the pricing section is missing") is stored in chat but never
read by the repair job. The repair generates the same files as the original build.

**Fix required**: Targeted repair flow:
1. `job:repair` reads the most recent `fix_request` message from the chat
2. Identifies which files need to be regenerated based on the complaint
3. Re-generates only those files into the existing workspace
4. Re-runs the preview (skip npm install if package.json unchanged)

**Files to touch**:
- `apps/server/src/socket/events.ts` — `job:repair` handler: read complaint, pass to builder
- `apps/server/src/jobs/builderQueue.ts` — add `repairMode` flag + `targetFiles` list to job data
- `apps/server/src/services/codeGenerator.ts` — add `repairProjectFiles()` that regenerates specific files

#### Gap 4: No streaming AI generation — live coding visibility is fake
**Root cause**: `generateFileWithAI()` calls `complete()` which waits for the full response
before returning. The frontend sees `GENERATING src/pages/Home.tsx` then immediately
`CREATE src/pages/Home.tsx (12.4 KB)` with no tokens in between. There is no live coding
visibility — just start/end events.

**Fix required**: Add streaming support to `providers.ts` and stream tokens to frontend
via `job:log` events with `type: 'stream'`.

**Files to touch**:
- `apps/server/src/lib/providers.ts` — add `completeStream()` function (SSE/streaming)
- `apps/server/src/services/codeGenerator.ts` — use streaming in `generateFileWithAI()`
- `apps/server/src/jobs/builderQueue.ts` — emit `job:log` stream events per token batch
- `apps/web/src/hooks/useSocket.ts` — handle `job:log` stream type
- `apps/web/src/components/execution/TimelineEvent.tsx` — render streaming tokens

#### Gap 5: fix_request intent does not auto-trigger repair
**Root cause**: When `classifyIntent()` returns `fix_request`, `handleWithAI()` calls
`generateRepairResponse()` which returns a text message saying "click Repair Build".
The user has to manually click a button. This breaks the autonomous experience.

**Fix required**: When `fix_request` is detected AND the most recent job is `failed`,
automatically emit `job:repair` to re-queue the job. The chat response should say
"I'm repairing it now" not "click the button".

**Files to touch**:
- `apps/server/src/socket/events.ts` — `handleWithAI()` fix_request case: auto-trigger repair

#### Gap 6: Provider fallback chain has no retry/circuit-breaker
**Root cause**: `complete()` tries primary provider, then blackbox, then langdock — but
with no retry delay, no exponential backoff, and no circuit breaker. A flaky provider
causes immediate cascade to fallback on every request, even if the primary would succeed
on retry.

**Fix required**: Add per-provider retry with exponential backoff (2 attempts, 1s/2s delay)
and a simple in-memory circuit breaker (open after 3 consecutive failures, reset after 60s).

**Files to touch**:
- `apps/server/src/lib/providers.ts` — add `withRetry()` wrapper + circuit breaker state

---

### 🟡 MEDIUM PRIORITY (architecture hardening)

#### Gap 7: Langdock Agent API — verification + env var cleanup
**Current state**: Code already uses `agentId` and `https://api.langdock.com/agent/v1/chat/completions`.
The migration from Assistant API is already done in code.

**What still needs fixing**:
- `completeWithLangdock()` only sends `userPrompt` — the `systemPrompt` is silently dropped.
  For Agent API this is correct (agents have their own system prompts in Langdock dashboard),
  but it means planner system prompt is not applied. Fix: prepend systemPrompt to userMessage.
- Env var `LANGDOCK_ASSISTANT_ID` (old) may exist in server `.env.local` — needs migration to
  `LANGDOCK_AGENT_ID`.
- 404 response (agent not found) needs specific error handling — currently treated same as 500.
- Per-role agent IDs (`AGENT_ARCHITECT_ID`, `AGENT_OPENCLAW_ID`, etc.) need documentation.

**Files to touch**:
- `apps/server/src/lib/providers.ts` — `completeWithLangdock()`: prepend systemPrompt, handle 404
- `scripts/server-setup.sh` — update `.env.local` template with new Langdock env vars
- `MULTI_SERVER_ARCHITECTURE.md` — document Langdock Agent API migration

#### Gap 8: Memory context not used in code generation
**Root cause**: `getCombinedContext()` is called in `chat:send` and passed to `generatePlan()`.
But `generateProjectFiles()` in `codeGenerator.ts` has no access to memory context.
Generated code doesn't know about prior project decisions, confirmed tech stack, or user preferences.

**Fix required**: Pass `memoryContext` from the plan record into `CodeGenProject` and inject
it into AI prompts for key files (App.tsx, Home.tsx, server/index.ts).

**Files to touch**:
- `apps/server/src/services/codeGeneratorTypes.ts` — add `memoryContext?: string` to `CodeGenProject`
- `apps/server/src/services/codeGeneratorPrompts.ts` — inject memory context into prompts
- `apps/server/src/jobs/builderQueue.ts` — fetch and pass memory context when building `codeGenProject`

#### Gap 9: Build continuation — no "add feature to existing build"
**Root cause**: There is no intent or flow for "add a payment page to my existing app".
Every build request creates a new plan and a new job. The existing workspace is abandoned.

**Fix required**: Add `continuation` intent to planner. When detected:
1. Load existing workspace for the project's most recent completed job
2. Generate only the new/modified files
3. Re-run preview

**Files to touch**:
- `apps/server/src/services/planner.ts` — add `continuation` to `PlannerIntent`
- `apps/server/src/socket/events.ts` — handle `continuation` intent
- `apps/server/src/jobs/builderQueue.ts` — add `continuationMode` with existing workspace path

#### Gap 10: Multi-server preview routing
**Root cause**: Preview processes run on whichever server handled the build job. In a
multi-server setup, the proxy route `/api/preview/:jobId/app/*` on server A cannot proxy
to a Vite process running on server B.

**Fix required**: Store `workerName` with the preview instance. The proxy route checks
`job.workerName` and routes to the correct server's internal endpoint.

**Files to touch**:
- `apps/server/src/routes/preview.ts` — proxy route: check workerName, route to correct server
- `apps/server/src/services/workerRouter.ts` — expose worker base URLs for proxy routing

---

### 🟢 LOW PRIORITY / FUTURE

#### Gap 11: CUDA + Mamba 2 Assessment

**What Mamba 2 is**: A state-space model (SSM) architecture with O(n) complexity vs
transformer O(n²). Excellent for long-context tasks. Developed by Albert Gu and Tri Dao.

**Where it could fit in CoderXP**:
- The OpenClaw path (local Ollama) already supports any Ollama-compatible model
- Mamba 2 would run via OpenClaw if a production-quality code model existed
- Long file generation (3000+ token files) would benefit from linear complexity

**Current reality (Q1 2026)**:
- No production-quality Mamba 2 code generation models exist on Ollama
- Available: `mamba` (research-grade, not code-specialized)
- `qwen2.5-coder:7b` (transformer, Ollama) outperforms any available Mamba 2 model for code
- CUDA requirement: NVIDIA GPU with CUDA 11.8+ needed for meaningful speedup

**Recommendation**: **Defer to Phase 13**
- Current priority: harden cloud provider fallback chain (Gaps 5–6)
- Near-term local inference: `qwen2.5-coder:7b` via OpenClaw (already supported)
- Revisit Mamba 2 when `mamba2-coder` or equivalent production model is available on Ollama
- CUDA optimization relevant when self-hosting inference at scale (>100 concurrent builds)

**What to do now**: Document OpenClaw configuration in server-setup.sh so operators can
optionally run local inference. No code changes needed.

---

## Implementation Sequence (Shortest Strong Path)

### Sprint 1 — Critical Fixes (3–4 days)
**Goal**: Users can actually see their builds. File generation matches the plan.

- [x] **Gap 1**: Preview proxy route — `GET /api/preview/:jobId/app/*` ✅ COMPLETE
  - `http-proxy-middleware` added to server dependencies
  - Proxy handler added in `apps/server/src/routes/preview.ts`
  - `builderQueue.ts` stores proxy URL (`https://coderxp.pro/api/preview/:jobId/app/`) in DB
  - `builderQueue.ts` emits proxy URL in `job:complete`
  - **Root cause fixed**: `previewManager.ts` `runNpmInstall` now sets `NODE_ENV: 'development'`
    so devDependencies (vite, @vitejs/plugin-react) are installed in workspace
  - **Verified**: `test-dynamic-build-e2e.mjs` → **47/47 ✅** (2026-03-23)
  - Preview URL confirmed: `https://coderxp.pro/api/preview/:jobId/app/` (public HTTPS)

- [x] **Gap 2**: Dynamic file generation from frontendScope ✅ COMPLETE
  - Added `DynamicPage` interface to `codeGeneratorTypes.ts`
  - Added `promptGenericPage()` to `codeGeneratorPrompts.ts`; updated `promptAppTsx()` to accept `dynamicPages`
  - Added `fallbackGenericPage()` to `codeGeneratorFallbacks.ts`; updated `fallbackAppTsx()` to accept `dynamicPages`
  - Added `parseDynamicPages()` + 13-entry `SCOPE_TO_PAGE` map to `codeGenerator.ts`
  - `buildFileSpecs()` now generates a `FileSpec` per matched dynamic page
  - TypeScript: 0 errors ✅

### Sprint 2 — Repair & Intelligence (3–4 days)
**Goal**: Repair works correctly. Fix requests auto-trigger repair.

- [ ] **Gap 3**: Targeted repair
  - Add `repairMode` + `targetFiles` to builder job data
  - Add `repairProjectFiles()` to codeGenerator.ts
  - Update `job:repair` handler to read complaint from chat and pass target files

- [ ] **Gap 5**: Auto-trigger repair on fix_request
  - Update `handleWithAI()` fix_request case to auto-emit repair when job is failed

- [ ] **Gap 7**: Langdock Agent API cleanup
  - Fix systemPrompt handling in `completeWithLangdock()`
  - Add 404 handling for agent not found
  - Update env var documentation

### Sprint 3 — Streaming & Hardening (3–4 days)
**Goal**: Live coding visibility. Provider reliability.

- [ ] **Gap 4**: Streaming AI generation
  - Add `completeStream()` to providers.ts
  - Stream tokens via `job:log` events
  - Frontend renders streaming tokens in TimelineEvent

- [ ] **Gap 6**: Provider retry + circuit breaker
  - Add `withRetry()` wrapper
  - Add circuit breaker state per provider

### Sprint 4 — Architecture & Polish ✅ COMPLETE (2026-03-23)
**Goal**: Memory/Rules system, Richer Chat, Settings Modal wired.

- [x] **Memory/Rules system**: `userRules`/`projectRules` in Prisma, memory.ts CRUD, 6 rules API endpoints, rulesContext injected into planner system prompt
- [x] **Richer Chat**: ReactMarkdown + remark-gfm + MermaidBlock in ChatMessage.tsx; Mermaid dark theme, GFM tables, task lists
- [x] **Settings Modal**: SettingsModal.tsx + RulesPanel.tsx created; Settings button in AuthDropdown wired via LeftPanel.tsx
- [x] **Deploy**: 18/18 SSL ✅, frontend assets 200 ✅, permissions rule documented in deploy.sh

### Sprint 5 — Architecture & Polish ✅ COMPLETE (2026-03-24)
**Goal**: Memory context in generation. Build continuation. Multi-server preview routing. coderxp.pro cutover.

- [x] **Gap 8**: Memory context in code generation ✅
  - `memoryContext?: string` added to `CodeGenProject` in `codeGeneratorTypes.ts`
  - `buildProjectContext()` in `codeGeneratorPrompts.ts` injects memoryContext block into all AI prompts
  - `getCombinedContext(projectId, userId)` fetched and injected in main build, repair, and continuation flows in `builderQueue.ts`
- [x] **Gap 9**: Build continuation intent ✅
  - `'continuation'` added to `PlannerIntent` + `intentSchema` + `heuristicClassify()` in `planner.ts`
  - `case 'continuation'` handler added to `handleWithAI()` in `events.ts` — queries most recent completed job, emits `job:continuation_suggested`
  - `continuation` mode branch in `builderQueue.ts` — loads existing workspace, generates only new pages + App.tsx via `repairProjectFiles()`
- [x] **Gap 10**: Multi-server preview routing ✅
  - `getWorkerBaseUrl(workerName)` added to `workerRouter.ts`
  - `preview.ts` refactored: `proxyToUrl()` helper + cross-server fallback via DB `workerName` lookup → `getWorkerBaseUrl()` → proxy to remote worker
- [x] **coderxp.pro cutover** ✅ — 18/18 SSL verification passed (2026-03-24)
  - Frontend dist deployed via scp (58 files)
  - Server source deployed via scp (all Sprint 5 changes)
  - `cutover-coderxp-pro.sh` executed: .env.local updated, SSL cert renewed, nginx reloaded, pm2 restarted
  - `DOMAIN=coderxp.pro node test-ssl-verify.mjs` → **18/18 PASSED** ✅

---

## Files Likely Touched Per Sprint

### Sprint 1
| File | Change |
|------|--------|
| `apps/server/src/routes/preview.ts` | Add proxy route `/api/preview/:jobId/app/*` |
| `apps/server/src/jobs/builderQueue.ts` | Store proxy URL, emit proxy URL in job:complete |
| `apps/server/src/services/codeGenerator.ts` | Dynamic file specs from frontendScope |
| `apps/server/src/services/codeGeneratorPrompts.ts` | `promptGenericPage()` |
| `apps/server/src/services/codeGeneratorFallbacks.ts` | `fallbackGenericPage()` |
| `apps/server/package.json` | Add `http-proxy-middleware` |

### Sprint 2
| File | Change |
|------|--------|
| `apps/server/src/socket/events.ts` | Auto-repair on fix_request; pass complaint to repair |
| `apps/server/src/jobs/builderQueue.ts` | `repairMode` + `targetFiles` support |
| `apps/server/src/services/codeGenerator.ts` | `repairProjectFiles()` |
| `apps/server/src/lib/providers.ts` | Langdock 404 handling, systemPrompt fix |

### Sprint 3
| File | Change |
|------|--------|
| `apps/server/src/lib/providers.ts` | `completeStream()`, retry, circuit breaker |
| `apps/server/src/jobs/builderQueue.ts` | Emit stream events |
| `apps/web/src/hooks/useSocket.ts` | Handle stream log type |
| `apps/web/src/components/execution/TimelineEvent.tsx` | Render streaming tokens |

### Sprint 4
| File | Change |
|------|--------|
| `apps/server/src/services/codeGeneratorTypes.ts` | `memoryContext` in CodeGenProject |
| `apps/server/src/services/codeGeneratorPrompts.ts` | Inject memory context |
| `apps/server/src/jobs/builderQueue.ts` | Fetch + pass memory context |
| `apps/server/src/services/planner.ts` | `continuation` intent |
| `apps/server/src/socket/events.ts` | Handle continuation intent |

---

## What Needs Testing After Each Sprint

### After Sprint 1
- [x] Build a landing page → verify all frontendScope pages are generated ✅ (47/47 e2e)
- [x] Open preview URL in remote browser → verify iframe loads ✅ (public HTTPS URL confirmed)
- [x] Verify preview URL in DB is `https://coderxp.pro/api/preview/:jobId/app/` not `http://localhost:PORT` ✅
- [x] SSL: `DOMAIN=coderxp.pro node test-ssl-verify.mjs` → **18/18 PASSED** ✅ (2026-03-23)
- [x] `test-dynamic-build-e2e.mjs` → **47/47 PASSED** ✅ (2026-03-23) — Sprint 1 COMPLETE

### After Sprint 2
- [ ] Send "the pricing section is missing" → verify auto-repair triggers
- [ ] Verify repair only regenerates targeted files (not full rebuild)
- [ ] Verify Langdock fallback works with new systemPrompt handling

### After Sprint 3
- [ ] Build a project → verify token streaming visible in timeline
- [ ] Kill OpenRouter key → verify fallback to Blackbox with retry
- [ ] Kill all cloud providers → verify graceful degradation to templates

### After Sprint 4 ✅ VERIFIED (2026-03-23)
- [x] SSL 18/18 ✅
- [x] Frontend assets (JS/CSS bundles) load correctly ✅
- [x] pm2 coderxp-server online ✅
- [x] Auth/API/WSS all reachable ✅

### After Sprint 5 ✅ VERIFIED (2026-03-24)
- [x] SSL 18/18 ✅ — `DOMAIN=coderxp.pro node test-ssl-verify.mjs` → 18 passed, 0 failed
- [x] coderxp.pro fully live: HTTPS apex, HTTP→HTTPS, www→apex, TLS cert, /health, HSTS, CORS, auth, API, WSS, security headers, frontend assets, AI providers, auto-renewal ✅
- [x] pm2 coderxp-server online (64.6mb) ✅
- [x] No coderxp.app leakage — old nginx symlink removed ✅
- [ ] Build project A → send "add a blog page" → verify continuation adds blog files
- [ ] Verify memory context from prior build is reflected in generated code

---

## Deployment After Each Sprint
```bash
DOMAIN=coderxp.pro ./scripts/deploy.sh
DOMAIN=coderxp.pro node test-ssl-verify.mjs  # Must remain 18/18
```

### Deployment Checklist (enforced)
1. `pnpm run build` in `apps/web` — must succeed with 0 errors
2. `rsync "$DIST_DIR/" "$SERVER:$SERVER_DEST/"` — trailing slash preserves `assets/` subdir
3. `chown -R www-data:www-data $DEST && find $DEST -type d -exec chmod 755 {} + && find $DEST -type f -exec chmod 644 {} +`
4. `nginx -t && systemctl reload nginx`
5. `pm2 restart coderxp-server`
6. `node test-ssl-verify.mjs` → must be 18/18

---

## HeftCoder Parity Checklist

| Capability | Status | Sprint |
|-----------|--------|--------|
| Strong chat panel | ✅ Exists | — |
| Autonomous planning | ✅ Exists | — |
| Intent classification | ✅ Exists | — |
| Plan → approve → build flow | ✅ Exists | — |
| Live file creation visibility | ✅ Exists | — |
| Live dependency install visibility | ✅ Exists | — |
| Live preview | ✅ Fixed (public HTTPS proxy URL) | Sprint 1 |
| Complete file generation | ✅ Fixed (dynamic scope-driven pages) | Sprint 1 |
| Self-healing repair | ✅ Targeted repair (generateRepairPlan + repairProjectFiles) | Sprint 2 |
| Auto-repair on complaint | ✅ fix_request auto-triggers repair | Sprint 2 |
| Live coding (token streaming) | ❌ Missing | Sprint 3 |
| Provider resilience | ⚠️ Partial (no retry/circuit breaker) | Sprint 3 |
| Memory/Rules system | ✅ userRules + projectRules, injected into planner | Sprint 4 |
| Richer Chat (Mermaid/GFM) | ✅ ReactMarkdown + remark-gfm + MermaidBlock | Sprint 4 |
| Settings Modal | ✅ Wired to Settings button in auth dropdown | Sprint 4 |
| Memory-aware generation | ✅ memoryContext injected into all codegen prompts | Sprint 5 |
| Build continuation | ✅ continuation intent + additive workspace mode | Sprint 5 |
| Credential handoff | ✅ Exists | — |
| Browser-capable execution | ✅ Exists | — |
| Multi-server readiness | ✅ getWorkerBaseUrl + cross-server preview proxy | Sprint 5 |
