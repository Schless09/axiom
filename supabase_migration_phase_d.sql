-- Migration: Phase D multi-evidence synthesis
-- Run in Supabase → SQL Editor
-- Safe to re-run (uses IF NOT EXISTS / IF column does not exist guards).

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  claims.synthesis_raw
--     Stores the final multi-evidence synthesis output produced after all
--     per-item analyses complete. Shape: SynthesisResult (see synthesis-engine.ts).
--     Kept separate from vla_analysis_raw (which holds the primary dashcam VLA)
--     so each can evolve independently.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.claims
  add column if not exists synthesis_raw jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  evidence.analyzed_jointly
--     True when this evidence item was analyzed as part of a multi-angle joint
--     call (i.e. frames merged with another video item) rather than standalone.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.evidence
  add column if not exists analyzed_jointly boolean default false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.  evidence.gps_lat / evidence.gps_lon
--     Optional GPS coordinates extracted from dashcam EXIF or user-provided.
--     Used by weather/context.ts to fetch historical conditions.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.evidence
  add column if not exists gps_lat double precision,
  add column if not exists gps_lon double precision;

commit;
