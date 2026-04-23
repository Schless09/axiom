-- Migration: add dashcam_perspective to claims
-- Run in Supabase → SQL Editor

alter table public.claims
  add column if not exists dashcam_perspective text
    not null
    default 'insured'
    check (dashcam_perspective in ('insured', 'witness', 'adverse'));

comment on column public.claims.dashcam_perspective is
  'Who owns the dashcam: insured = claimant vehicle, witness = bystander vehicle, adverse = opposing party vehicle';
