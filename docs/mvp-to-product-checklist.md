# MVP → Advanced Product Checklist

## What we're building

**Axiom** is a web app for **insurance claim evidence review**: users in an **organization** upload dashcam video, still images, PDFs, and audio, which are stored in **Supabase** (Postgres + private Storage) and analyzed with **Gemini + GPT-4o + Claude** using a structured **VLA-style** output — timeline of events, suggested fault percentages, adjuster-oriented narrative, and **statute-aligned** references matched against a **jurisdiction** (`state_code`) and a reference `statutes` table. The product goal is a **scorecard** a human adjuster or pilot partner can use for shadow audits and liability discussions, not a black-box verdict.

Technically: **Next.js** (App Router) front end with **Supabase Auth**, **RLS**-scoped multi-tenancy, a synchronous **analyze** API route, optional **Sentry** observability, and an offline **Python** ingestion script for frame sampling and future training pipelines. Evidence is stored in a registry-style `evidence` table with source metadata; per-model results are persisted in `evidence_analysis` for audit and regression testing.

Use this as a living roadmap. Reorder or split by what your pilot contract actually requires.

**Snapshot:** items below use `[x]` for what the repo already delivers; "*(partial)*" means the rest of the bullet is still open.

---

## Tier 1 — Feedback loop + analysis quality

- [x] **Adjuster annotation layer**: `claim_reviews` table (one row per claim, RLS-scoped); per-event agree/dispute toggles + notes; claim-level fault % + reserve amount + notes; save draft / submit; read-only view when submitted; AI-vs-adjuster delta in claims list; `supabase_migration_claim_reviews.sql` + `supabase_migration_leakage.sql` (adds `reserve_amount`)
- [x] **Timeline → video seek**: `EvidencePlayer` client component unifies video player + timeline; clicking any timestamp seeks and plays the video to that moment
- [x] **Controlled violation vocabulary**: `violation_tags: string[]` field added to `vlaTimelineEventSchema`; Gemini prompt updated to output tags from the controlled vocabulary list; `statute-matcher.ts` now does exact `violation_type` match on tags before falling back to token-overlap scoring; zero-fault/no-tag events skipped to prevent junk matches; minimum token-overlap score raised to 2
- [x] **Confidence signaling**: `confidence: "high" | "medium" | "low"` per-event + `overall_confidence` overall added to schema + prompt; per-event colored dot in timeline (green/yellow/red); "Review recommended" amber banner on scorecard when overall or any event confidence is low

---

## Tier 2 — Workflow improvements

- [x] **Background job restructure**: upload form no longer blocks on model call; `router.push` to scorecard immediately after upload; `AnalysisTrigger` client component fires analyze from the scorecard when claim is `pending`; decouples upload latency from analysis latency
- [x] **Re-analyze button**: `reanalyzeClaim` server action resets claim to `pending`; `ReAnalyzeButton` component shown on completed/error scorecards; triggers `AnalysisTrigger` on next render
- [x] **Search and filter on claims list**: plain HTML `<form method="GET">` filter bar; `?q=`, `?status=`, `?state=` query params; server-side Supabase filtering; no client JS dependency
- [x] **Email notification (Resend)**: `lib/email/resend.ts` with `sendAnalysisCompleteEmail`; called in analyze route after `completed`; fails silently if `RESEND_API_KEY` / `RESEND_FROM_EMAIL` unset; email includes claim number, AI fault %, scorecard link, and AI disclaimer
- [x] **Dashcam perspective (post-upload)**: `claims.dashcam_perspective` column; `PerspectivePicker` component on the scorecard lets adjusters set insured / witness / adverse *after* watching the video; changing perspective resets the claim to `pending` and triggers re-analysis automatically; `updateClaimPerspective` server action; `supabase_migration_dashcam_perspective.sql`

---

## Tier 3 — Polish and trust

- [x] **Upload form off homepage**: signed-in users redirected from `/` to `/dashboard/new`; `/dashboard/new` page hosts batch `ClaimUploadForm`; homepage is now a pure marketing/conversion page for unauthenticated visitors
- [x] **Stuck claim recovery**: claims list page auto-marks claims in `analyzing` status for > 15 min as `error` with a retry message; runs silently on every page load; no manual DB intervention needed for timed-out analyses
- [x] **Video proxy + transcoding**: `/api/claims/[id]/video` route; downloads raw file from Supabase, transcodes to H.264 MP4 with `faststart` via FFmpeg for universal browser playback; caches transcoded sidecar in Storage to avoid repeat transcoding; `ffmpeg-static` dependency

---

## Phase A — Production-ready MVP (ship to a real pilot safely)

- [x] **Supabase live**: `supabase_schema.sql` + `supabase_seed.sql`, RLS, `evidence` Storage path in app, `.env.example` — *when you ship prod/staging, apply schema + bucket + env on each target*
- [x] **Auth UX**: sign-in / sign-up / forgot password / update password, PKCE callback, middleware session refresh, dashboard gated by auth + org membership — *middleware now redirects unauthenticated users away from `/dashboard/**` to `/login?next=<path>`*
- [x] **Signup → org provisioning**: DB trigger on `auth.users` (`handle_provision_org_for_new_user` in `supabase_schema.sql`; one-off migrate via `supabase_migration_signup_org_provisioning.sql`) creates a personal `organizations` row + `user_org_memberships` for each new user
- [x] **Claims list**: `/dashboard/claims` page lists all of the user's claims with status, fault estimate, AI-vs-adjuster delta, and date; linked from the navbar "My Claims" link and the scorecard "All claims" button
- [x] **Error & empty states**: upload failures, analysis failures, missing org, network errors, claim `error` / `pending` / `analyzing` copy on scorecard; `pending`/`analyzing` banner with auto-refresh every 5 s via `PollingRefresher` client component
- [x] **Observability**: Sentry (client/server/edge), `global-error`, analyze span + duration measurement + `captureException`, server action instrumentation on upload
- [x] **Cost guardrails**: 100 MB file cap (`uploadClaimEvidence` + `serverActions.bodySizeLimit`), `maxDuration` on analyze route, per-org concurrency cap (max 5 simultaneous analyses, configurable via `MAX_CONCURRENT_ANALYSES` env var → 429), duplicate-analysis guard (409 if claim already `analyzing`)
- [x] **Data retention & deletion**: `deleteClaim` server action removes Storage objects + DB rows (evidence cascades via FK); `DeleteClaimButton` on scorecard with browser confirmation; document lifecycle in pilot agreement (see note below)
- [ ] **PII / redaction plan**: `data_ingestion.py` documents redaction before training upload; no in-app face/plate blur yet
- [x] **Export for pilots**: `GET /api/claims/:id/export` returns a structured JSON report (claim metadata + full VLA analysis + statute matches) as a downloadable file; "Export JSON" button on completed scorecards; report includes AI disclaimer required for pilot agreements

### Eval harness (measure model + statute alignment)

- [x] **Scaffold**: `eval/manifest.v1.json` (versioned clip list + `jurisdiction.state_code`), `lib/eval/manifest.ts` (Zod), `lib/eval/score.ts` (`scoreGroundTruth`, `matchesFromVlaRaw` for `vla_analysis_raw.statute_matches`), `npm run eval:validate`, local media under `eval/media/` (gitignored except `.gitkeep`)
- [ ] **Ground truth**: For each clip, add `ground_truth.statute_codes_any` and/or `violation_types_any` (and optionally `violation_types_all`) after **adjuster or expert review** — not guessed from CCD metadata alone; align `violation_type` strings with `statutes.violation_type` in your DB
- [ ] **Run & score**: Upload each clip through the app (or add a batch script), run analyze, compare stored `statute_matches` to manifest expectations via `scoreGroundTruth`; track pass rate over time when prompts/models change; `evidence_analysis.prompt_version` makes this queryable per prompt version
- [ ] **Optional automation**: One command that iterates manifest clips → upload + analyze + JSON report (not built yet)

> **Data lifecycle note (pilot agreement):** Evidence files are stored in Supabase Storage under `{org_id}/{user_id}/{claim_id}/`. Claims and evidence can be deleted by the uploading user via the scorecard (permanent — removes Storage objects and all DB rows). There is no scheduled auto-deletion; add a retention window to the pilot agreement and implement a cron/pg_cron job when required by contract.

---

## Phase B — Pilot workflow & trust (shadow-audit / TPA-ready)

- [x] **Batch upload**: `BatchUploadForm` component; multiple files with shared `batch_id`; per-file state + optional claim number; live batch progress page (`/dashboard/batch/[batchId]`) with analysis status per claim; `supabase_migration_batch_id.sql`
- [x] **Historical claim import (CSV)**: `/dashboard/import` page; `ImportForm` component parses CSV (claim #, state, fault %, reserve, notes, status); `importClaims` server action bulk-inserts claims and optionally creates `claim_reviews` rows when `adjuster_fault_percent` is provided; skips duplicates by claim number
- [x] **Leakage monitoring + analytics**: org-wide `/dashboard/analytics`; KPIs (total claims, avg liability, avg delta, review rate); **6-month leakage trend** (high-variance claims per month, avg delta); **jurisdiction breakdown** table (per-state leakage rate, avg delta, total exposure); model confidence breakdown; `shadow-audit-export.tsx` downloads CSV for all claims above leakage threshold
- [x] **Human review queue**: `/dashboard/review-queue`; prioritized list of unreviewed completed claims sorted by urgency score (synthesis flags → low model confidence → liability extremes → claim age); summary bar showing pending count + avg liability + high-urgency count
- [x] **Audit trail** *(partial)*: `evidence_analysis` table records every provider's raw output, model version, `prompt_version`, `run_id`, cost, and confidence per analysis run — *not yet:* append-only log of who triggered re-analysis and when (would require a separate `claim_audit_log` table)
- [ ] **Role model within org**: adjuster vs admin (view all org claims vs own only) if TPAs need shared queue — *claims are currently owner-scoped in the list view; analytics is already org-wide*
- [ ] **PDF export**: structured PDF report for pilot agreements and carrier filing requirements (JSON export exists)

---

## Phase C — Legal & deterministic logic (reduce "black box" risk)

- [x] **Canonical violation tags**: model outputs controlled vocabulary (`violation_tags` enum array) in addition to free-text `action`
- [x] **Deterministic mapper** *(partial)*: exact `violation_type` tag → statute rows with tests; LLM does not invent citations; falls back to token-overlap scoring when no tag matches — *not yet:* formal rules table or config separate from the matcher code
- [x] **Statute data ops** *(partial)*: `statutes` table, multi-state seed (`supabase_migration_statutes_v2.sql`, `supabase_migration_statutes_v3.sql`), `statute-matcher.ts` — *not yet:* formal per-state ops runbook, version/snapshot id stamped on each analysis row
- [x] **Disclaimers in product**: AI disclaimer on scorecard + JSON export; "final liability remains the responsibility of the human adjuster" copy displayed

---

## Phase D — Vision quality & multi-evidence synthesis (deeper moat)

- [x] **Preprocessing** *(partial)*: `scripts/data_ingestion.py` — OpenCV frame sampling, optional training-bucket upload — *not:* in-product pipeline, optical flow/TTC in app
- [x] **Dense frame extraction**: `lib/video/extract-frames.ts` — two-phase strategy: 1 frame/sec for first 15 s, then 1 frame/3 s thereafter, max 20 frames; significantly improves model ability to catch events that happen quickly
- [x] **Evidence registry schema**: `evidence.source_type` (12 types: dashcam_video, police_report, damage_photo, etc.), `evidence.perspective`, `evidence.submitted_by`, `evidence.captured_at`, `evidence.original_filename`, `evidence.file_size_bytes`, `evidence.gps_lat/gps_lon`; `supabase_migration_evidence_registry.sql` + `supabase_migration_phase_d.sql`; `uploadClaimEvidence` and `addEvidenceToExistingClaim` populate all fields
- [x] **Non-video evidence ingestion** *(pipeline built, UI partial)*: `lib/ai/pdf-engine.ts` (Claude document blocks + GPT-4o fallback for policy docs / police reports); `lib/ai/audio-engine.ts` (Whisper transcription + structured extract); `lib/ai/damage-photo-engine.ts` (multi-provider parallel damage analysis); `addEvidenceToExistingClaim` accepts PDF + audio + image; analyze route dispatches to the appropriate engine per `source_type` — *not yet:* upload UI surfaces GPS fields; police-report-specific prompting; batch non-video ingest
- [x] **Multi-evidence synthesis layer**: `lib/ai/synthesis-engine.ts` — after all evidence is analyzed individually, `synthesizeClaim` weighs results across evidence types (police report > dashcam_video for official citations), runs consistency checks, aggregates a final liability with `confidence_band`, produces human-readable `review_reasons`; `synthesis_raw` stored in `claims`; synthesis panel shown on scorecard when `evidence_count > 1`; `supabase_migration_phase_d.sql`
- [x] **Physics / sanity layer**: `lib/ai/physics-layer.ts` — heuristic checks of model claims against coarse physics bounds (deceleration plausibility, speed vs damage severity, timeline gaps); flags feed into synthesis `physics_flags`
- [x] **Weather / road context**: `lib/weather/context.ts` — OpenWeatherMap historical timemachine API keyed by GPS + `captured_at`; graceful nulls when data unavailable; weather context injected into synthesis narrative
- [ ] **Multi-angle joint analysis**: when multiple video sources cover the same incident, send all frames to a single model call with cross-angle context instead of analyzing each independently (foundation: `analyzed_jointly` column in `supabase_migration_phase_d.sql`)

---

## Phase E — Multi-model & cost optimization (decision-grade path)

- [x] **Multi-model parallel analysis**: Gemini + GPT-4o + Claude run in `Promise.allSettled`; each model uses identical prompt and Zod schema; individual failures don't block the others
- [x] **Consensus layer**: mean liability across successful models; `agreement_level` (strong / moderate / weak based on pp spread); `liability_delta` pp; `review_required` flag when delta ≥ 20 pp; `ConsensusPanel` badge on scorecard; score suppressed when fundamental disagreement detected
- [x] **Factual divergence detection**: `assessFactualDivergence` checks structured `material_facts` (another_vehicle_present, conflict_or_contact) across models; falls back to narrative phrase heuristics when `material_facts` absent; triggers `review_required` + confidence downgrade + disclaimer prefix on narratives
- [x] **Scene coherence / hallucination check**: `lib/ai/scene-coherence.ts` — after three models return, **Gemini Flash** (`gemini-2.0-flash`, text-only, sub-cent) acts as a meta-judge; evaluates whether all models describe the same physical scene across 5 dimensions (setting, vehicle movement, incident type, actors, clip span); any outlier detected is named (`outlier_provider`), its discrepancy explained, and the reason appended to `factual_divergence_reasons`; errors are swallowed so the check never blocks the primary analysis; runs concurrently with sync consensus work to minimize added latency
- [x] **Per-model breakdown**: `ModelBreakdownPanel` on scorecard shows each model's liability %, confidence, narrative, and timeline events; collapsible details
- [x] **Model registry** *(partial)*: `evidence_analysis` table records `model_provider`, `model_version`, `prompt_version`, `run_id`, `input_tokens`, `output_tokens`, `estimated_cost_usd` per run — *not yet:* query UI, per-org model config
- [x] **Model cost display**: `ModelCostPanel` on scorecard shows per-model token counts + estimated cost; collapsible details
- [x] **Gemini fallback chain**: `gemini-2.5-flash` → `gemini-2.5-flash-lite` → `gemini-1.5-flash` → `gemini-1.5-pro`; retries on 4xx/5xx (except auth errors); 5 attempts with exponential backoff
- [x] **Prompt consistency** *(v4)*: `PROMPT_VERSION = "v4"` constant in `vla-engine.ts`; `buildSystemInstruction(perspective)` generates dynamic system prompt based on dashcam perspective; `USER_PROMPT` enforces insured-centric scoring, observable violations only, calibration examples for 0% insured fault; `material_facts` block required in all outputs; frame context preamble in OpenAI/Anthropic calls; all three models share identical prompts
- [ ] **Triage model**: cheap classifier on short clip or frames to skip full analysis for non-incident uploads *(evidence classifier exists but is used for source_type labeling, not skip decisions)*
- [ ] **Budget per claim**: cap tokens / $ per analysis with graceful degradation (shorter video, fewer frames)
- [ ] **Per-org model config**: allow orgs to enable/disable specific providers or set preferred models

---

## Phase F — Integration & scale (post-pilot)

- [ ] **API for TPAs**: webhooks or REST for claim creation and result delivery (outside the Next UI)
- [ ] **Enterprise auth (evaluate Clerk)**: when a pilot requires **SAML / SSO**, richer org & user admin, or faster compliance reviews than raw Supabase Auth — add **[Clerk](https://clerk.com)** (or compare **WorkOS**) and plan the **bridge to Supabase** (JWT custom claims → RLS, or sync strategy; avoid two sources of truth without a design doc)
- [ ] **Clerk rollout checklist** (only if chosen): dev/prod instances, allowed domains, session → Supabase `auth` / `user_org_memberships` mapping, migration path for existing Supabase Auth users, sign-out + webhook handling
- [ ] **Multi-region / residency** if contracts require data location guarantees
- [ ] **Compliance posture (evaluate later)**: structured gap review vs buyer expectations — HIPAA/BAA and PHI handling, SOC 2 Type 2 / ISO 27001 if certifications matter, GDPR (DPAs, transfers, EU hosting) — so marketing and architecture stay aligned before publishing trust claims
- [ ] **Load & queue**: background jobs for analyze (queue + worker) instead of only synchronous API route

---

## Quick reference: what you have today vs not

| Area | In repo now | Typical next step |
|------|-------------|---------------------|
| Next.js App Router + middleware | Yes | — |
| Supabase Auth + org RLS + Storage uploads | Yes | Prod project + env on each deploy |
| Sign-in / sign-up / password reset flows | Yes | — |
| Protected route enforcement (middleware redirect) | Yes | — |
| Claim upload (single + batch) | Yes | — |
| Multi-model VLA + statute DB match | Yes | Tags + deterministic mapper (Phase C) |
| Statutes seeded for major US states | Yes (IL TX CA FL NY PA OH GA NC MI WA + more) | Add remaining states as pilots onboard |
| Claim scorecard (video/image, timeline, summary) | Yes | — |
| Video proxy + H.264 transcoding + caching | Yes (`/api/claims/[id]/video`, FFmpeg) | — |
| Claims list with filter/search (`/dashboard/claims`) | Yes | Roles / shared org queue (Phase B) |
| Auto-polling on analyzing/pending scorecard | Yes (5 s `PollingRefresher`) | Replace with SSE/WebSocket for scale |
| Rate limiting on analyze route | Yes (5 concurrent cap + duplicate guard) | Per-org $ budget (Phase E) |
| JSON export of full analysis | Yes (`/api/claims/:id/export`) | PDF export (Phase B) |
| Claim deletion (Storage + DB) | Yes (`deleteClaim` server action) | Scheduled retention / auto-purge (pilot agreement) |
| AI disclaimer on scorecard + export | Yes | — |
| Sentry (errors + traces) | Yes (`NEXT_PUBLIC_SENTRY_DSN`) | Tune sample rates; source maps in CI |
| Org-scoped tenancy | Yes | Roles, shared queue (Phase B) |
| Auto-assign org on signup | Yes (DB trigger) | — |
| `.env.example` complete | Yes | — |
| Multi-model consensus (Gemini + GPT-4o + Claude) | Yes (parallel `Promise.allSettled`, consensus liability, agreement badge, per-model breakdown) | Per-org model config (Phase E) |
| Factual divergence detection (structured + narrative) | Yes (`assessFactualDivergence`, `material_facts` schema) | — |
| Scene coherence / hallucination check | Yes (`lib/ai/scene-coherence.ts`, Gemini Flash meta-judge) | — |
| Dashcam perspective selector (post-upload) | Yes (`PerspectivePicker` on scorecard, triggers re-analysis) | — |
| Evidence registry (source_type, perspective, GPS, metadata) | Yes (schema + upload actions + migrations) | Per-item perspective UI in upload forms |
| Per-model audit log | Yes (`evidence_analysis` table, run_id, prompt_version, cost) | Query UI; per-org model config (Phase E) |
| Prompt versioning | Yes (`PROMPT_VERSION = "v4"` in vla-engine.ts) | Wire to eval harness regression diff |
| Non-video evidence ingestion (PDF, audio, damage photo) | Yes (engines built + wired to analyze route) | Upload UI for GPS; police-report-specific prompts |
| Multi-evidence synthesis | Yes (`synthesis-engine.ts`, synthesis panel on scorecard) | Multi-angle joint analysis (Phase D) |
| Physics / sanity checks | Yes (`physics-layer.ts`, flags in synthesis) | — |
| Weather / road context | Yes (`lib/weather/context.ts`, OpenWeatherMap) | Expose GPS capture UI in evidence upload |
| Batch upload + live batch status page | Yes (`/dashboard/batch/[batchId]`) | — |
| Historical claim CSV import | Yes (`/dashboard/import`) | Richer field mapping; policy doc attach |
| Leakage monitoring + analytics | Yes (`/dashboard/analytics`, trend + jurisdiction + CSV export) | Dollar-weighted leakage thresholds |
| Human review queue | Yes (`/dashboard/review-queue`, urgency scoring) | Reviewer assignment; role-based access |
| Python frame ingestion script | Yes (`scripts/data_ingestion.py`) | Wire to training ops + redaction |
| Eval manifest + validate script | Yes (`eval/manifest.v1.json`, `eval:validate`) | Fill ground truth; batch run + score |
| Org admin / roles | No | Phase B / F |
| Clerk / enterprise SSO | No | Phase F when pilot requires it |
| Multi-angle joint video analysis | No (schema column ready) | Phase D |
| PDF export | No | Phase B |
| Append-only claim audit log | No | Phase B (`claim_audit_log` table) |
| Scheduled data retention / auto-purge | No | Pilot agreement → pg_cron |
| Per-org model config / budget cap | No | Phase E |
| TPA API / webhooks | No | Phase F |

---

*Last updated: Apr 2026 — Phase D multi-evidence pipeline complete (PDF/audio/damage photo engines, synthesis, physics, weather context), Phase E scene coherence / hallucination check added, Phase B leakage monitoring + review queue + batch + CSV import complete. Next focus: non-video evidence upload UI (GPS fields), PDF export, and eval harness ground truth.*
