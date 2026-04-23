-- Migration: add batch_id to claims
-- Run in Supabase SQL editor (Dashboard → SQL Editor → New query)

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS batch_id uuid;

-- Index for fast batch status page queries
CREATE INDEX IF NOT EXISTS claims_batch_id_idx
  ON public.claims (batch_id)
  WHERE batch_id IS NOT NULL;
