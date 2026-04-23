-- Migration: evidence registry enrichment + per-model audit trail
-- Run in Supabase → SQL Editor
-- Safe to re-run (uses IF NOT EXISTS / IF column does not exist guards).

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  Enrich evidence with source metadata
--     source_type  — what kind of evidence this file is
--     perspective  — from whose vantage point (per-item; claim-level
--                    dashcam_perspective still drives AI prompts)
--     submitted_by — who provided the file
--     captured_at  — when the evidence was originally created, not uploaded
--     original_filename — raw filename from the uploading client
--     file_size_bytes   — byte count at upload time
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.evidence
  add column if not exists source_type text not null default 'dashcam_video'
    check (source_type in (
      'dashcam_video',
      'surveillance_video',
      'bystander_video',
      'telematics_video',
      'police_report',
      'recorded_statement',
      'witness_statement',
      'scene_diagram',
      'damage_photo',
      'repair_estimate',
      'medical_record',
      'other'
    )),
  add column if not exists perspective text
    check (perspective is null or perspective in (
      'insured', 'adverse', 'witness', 'officer', 'neutral'
    )),
  add column if not exists submitted_by text
    check (submitted_by is null or submitted_by in (
      'insured', 'adjuster', 'attorney', 'tpa', 'thirdparty', 'system'
    )),
  add column if not exists captured_at timestamptz,
  add column if not exists original_filename text,
  add column if not exists file_size_bytes bigint;

-- Backfill: images already in the system are almost certainly damage photos,
-- not dashcam stills — correct the default for them.
update public.evidence
  set source_type = 'damage_photo'
  where file_type = 'image' and source_type = 'dashcam_video';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  evidence_analysis — immutable per-item, per-model analysis audit log
--
--     One row is written per (evidence_id, model_provider) per analyze call,
--     plus one row where model_provider = 'consensus' for the final blended
--     result. This is the foundation for:
--       • model registry / reproducibility  (Phase E)
--       • adjuster-vs-AI delta tracking     (Phase B)
--       • prompt regression testing         (eval harness)
--       • multi-evidence synthesis later    (Phase B/D)
--
--     run_id groups all rows written in a single analyze invocation so you can
--     query "what did each model say in the same run?" easily.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.evidence_analysis (
  id                uuid        default gen_random_uuid() primary key,
  evidence_id       uuid        not null references public.evidence(id) on delete cascade,
  claim_id          uuid        not null references public.claims(id)   on delete cascade,
  org_id            uuid        not null references public.organizations(id),

  -- What ran
  run_id            uuid        not null,             -- groups models from the same analyze call
  model_provider    text        not null,             -- 'gemini' | 'openai' | 'anthropic' | 'consensus'
  model_version     text,                             -- e.g. 'gemini-2.5-flash', 'gpt-4o'
  prompt_version    text,                             -- bump on every prompt change; enables regression diff

  -- Outputs
  analyzed_at       timestamptz not null default now(),
  liability_score   integer     check (liability_score between 0 and 100),
  overall_confidence text       check (overall_confidence is null or overall_confidence in ('high', 'medium', 'low')),
  analysis_raw      jsonb,                            -- full structured output from this provider/consensus

  -- Cost tracking (mirrors model_usage in consensus output)
  input_tokens      integer,
  output_tokens     integer,
  estimated_cost_usd numeric(12, 8)
);

create index if not exists idx_evidence_analysis_evidence  on public.evidence_analysis (evidence_id);
create index if not exists idx_evidence_analysis_claim     on public.evidence_analysis (claim_id);
create index if not exists idx_evidence_analysis_run       on public.evidence_analysis (run_id);
create index if not exists idx_evidence_analysis_provider  on public.evidence_analysis (model_provider);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.  RLS for evidence_analysis
--     Same pattern as evidence: org-scoped + claim owner.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.evidence_analysis enable row level security;

create policy "evidence_analysis_select_org"
  on public.evidence_analysis for select
  to authenticated
  using (
    org_id in (
      select m.org_id from public.user_org_memberships m where m.user_id = auth.uid()
    )
    and exists (
      select 1 from public.claims c
      where c.id = evidence_analysis.claim_id and c.user_id = auth.uid()
    )
  );

-- The analyze route runs as the authenticated user (createClient uses the
-- user's JWT), so a standard insert policy works without service-role bypass.
create policy "evidence_analysis_insert_org"
  on public.evidence_analysis for insert
  to authenticated
  with check (
    org_id in (
      select m.org_id from public.user_org_memberships m where m.user_id = auth.uid()
    )
    and exists (
      select 1 from public.claims c
      where c.id = evidence_analysis.claim_id and c.user_id = auth.uid()
    )
  );

commit;
