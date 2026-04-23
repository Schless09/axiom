-- Axiom VLA — Loss leakage analytics layer
-- Run in Supabase SQL Editor after supabase_migration_claim_reviews.sql.
--
-- Adds reserve_amount to claim_reviews so the analytics dashboard can
-- compute dollar-value leakage exposure (reserve × AI/adjuster delta).

ALTER TABLE public.claim_reviews
  ADD COLUMN IF NOT EXISTS reserve_amount numeric CHECK (reserve_amount >= 0);

COMMENT ON COLUMN public.claim_reviews.reserve_amount IS
  'Initial reserve amount set by adjuster (USD). Used to compute estimated leakage exposure.';
