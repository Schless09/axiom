-- Axiom VLA — run in Supabase SQL Editor (fresh project).
-- Buckets: create "evidence" in Dashboard → Storage (private).

-- -----------------------------------------------------------------------------
-- Organizations (tenants / carriers)
-- -----------------------------------------------------------------------------
create table public.organizations (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  slug text unique
);

-- MVP: map users to orgs. Later: multiple rows per user for org switching.
create table public.user_org_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (user_id, org_id)
);

create index idx_user_org_memberships_org on public.user_org_memberships (org_id);

-- -----------------------------------------------------------------------------
-- Claims & evidence (org-scoped)
-- -----------------------------------------------------------------------------
create table public.claims (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  org_id uuid not null references public.organizations(id),
  user_id uuid references auth.users(id),
  claim_number text not null,
  state_code text not null, -- e.g., 'IL', 'CA'
  status text default 'pending' check (status in ('pending', 'analyzing', 'completed', 'error')),
  liability_score integer, -- 0-100 (percentage fault)
  summary text,
  final_report_url text,
  unique (org_id, claim_number)
);

create table public.evidence (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id),
  claim_id uuid references public.claims(id) on delete cascade,
  file_path text not null,        -- Supabase storage path: {org_id}/{user_id}/{claim_id}/...
  file_type text,                 -- 'video' | 'image'
  source_type text not null default 'dashcam_video'
    check (source_type in (
      'dashcam_video', 'surveillance_video', 'bystander_video', 'telematics_video',
      'police_report', 'recorded_statement', 'witness_statement', 'scene_diagram',
      'damage_photo', 'repair_estimate', 'medical_record', 'other'
    )),
  perspective text                -- 'insured' | 'adverse' | 'witness' | 'officer' | 'neutral'
    check (perspective is null or perspective in ('insured', 'adverse', 'witness', 'officer', 'neutral')),
  submitted_by text               -- who provided this evidence
    check (submitted_by is null or submitted_by in ('insured', 'adjuster', 'attorney', 'tpa', 'thirdparty', 'system')),
  captured_at timestamptz,        -- when the evidence was originally created (not uploaded)
  original_filename text,
  file_size_bytes bigint,
  vla_analysis_raw jsonb          -- consensus analysis output (mirrors evidence_analysis model_provider='consensus')
);

create table public.statutes (
  id uuid default gen_random_uuid() primary key,
  state_code text not null,
  statute_code text not null,
  description text not null,
  violation_type text
);

-- Per-item, per-model immutable analysis audit log.
-- One row per (evidence_id, model_provider) per analyze call + one 'consensus' row.
-- run_id groups all models from the same invocation; prompt_version tracks prompt changes.
create table public.evidence_analysis (
  id                uuid        default gen_random_uuid() primary key,
  evidence_id       uuid        not null references public.evidence(id) on delete cascade,
  claim_id          uuid        not null references public.claims(id)   on delete cascade,
  org_id            uuid        not null references public.organizations(id),
  run_id            uuid        not null,
  model_provider    text        not null,   -- 'gemini' | 'openai' | 'anthropic' | 'consensus'
  model_version     text,
  prompt_version    text,
  analyzed_at       timestamptz not null default now(),
  liability_score   integer     check (liability_score between 0 and 100),
  overall_confidence text       check (overall_confidence is null or overall_confidence in ('high', 'medium', 'low')),
  analysis_raw      jsonb,
  input_tokens      integer,
  output_tokens     integer,
  estimated_cost_usd numeric(12, 8)
);

create index idx_statutes_state on public.statutes (state_code);
create index idx_statutes_violation on public.statutes (violation_type);
create index idx_evidence_claim on public.evidence (claim_id);
create index idx_claims_org on public.claims (org_id);
create index idx_evidence_org on public.evidence (org_id);
create index idx_evidence_analysis_evidence on public.evidence_analysis (evidence_id);
create index idx_evidence_analysis_claim on public.evidence_analysis (claim_id);
create index idx_evidence_analysis_run on public.evidence_analysis (run_id);
create index idx_evidence_analysis_provider on public.evidence_analysis (model_provider);

-- Keep evidence.org_id aligned with claims.org_id
create or replace function public.evidence_sync_org_from_claim()
returns trigger
language plpgsql
as $$
declare
  v_org uuid;
begin
  select c.org_id into strict v_org
  from public.claims c
  where c.id = new.claim_id;
  new.org_id := v_org;
  return new;
exception
  when no_data_found then
    raise exception 'claim_id % not found', new.claim_id;
end;
$$;

create trigger evidence_set_org_id
  before insert or update of claim_id on public.evidence
  for each row execute function public.evidence_sync_org_from_claim();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.user_org_memberships enable row level security;
alter table public.claims enable row level security;
alter table public.evidence enable row level security;
alter table public.evidence_analysis enable row level security;
alter table public.statutes enable row level security;

-- Optional: swap membership checks for JWT once you set app_metadata.org_id (Auth Hook / Admin API):
--   (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid = claims.org_id
-- Policies below use user_org_memberships so MVP works without custom JWT claims.

create policy "orgs_select_member"
  on public.organizations for select
  to authenticated
  using (
    exists (
      select 1 from public.user_org_memberships m
      where m.user_id = auth.uid() and m.org_id = organizations.id
    )
  );

create policy "memberships_select_own"
  on public.user_org_memberships for select
  to authenticated
  using (user_id = auth.uid());

create policy "claims_select_org"
  on public.claims for select
  to authenticated
  using (
    auth.uid() = user_id
    and org_id in (select m.org_id from public.user_org_memberships m where m.user_id = auth.uid())
  );

create policy "claims_insert_org"
  on public.claims for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and org_id in (select m.org_id from public.user_org_memberships m where m.user_id = auth.uid())
  );

create policy "claims_update_org"
  on public.claims for update
  to authenticated
  using (
    auth.uid() = user_id
    and org_id in (select m.org_id from public.user_org_memberships m where m.user_id = auth.uid())
  )
  with check (
    auth.uid() = user_id
    and org_id in (select m.org_id from public.user_org_memberships m where m.user_id = auth.uid())
  );

create policy "claims_delete_org"
  on public.claims for delete
  to authenticated
  using (
    auth.uid() = user_id
    and org_id in (select m.org_id from public.user_org_memberships m where m.user_id = auth.uid())
  );

create policy "evidence_select_org"
  on public.evidence for select
  to authenticated
  using (
    org_id in (select m.org_id from public.user_org_memberships m where m.user_id = auth.uid())
    and exists (
      select 1 from public.claims c
      where c.id = evidence.claim_id and c.user_id = auth.uid()
    )
  );

create policy "evidence_insert_org"
  on public.evidence for insert
  to authenticated
  with check (
    org_id in (select m.org_id from public.user_org_memberships m where m.user_id = auth.uid())
    and exists (
      select 1 from public.claims c
      where c.id = evidence.claim_id and c.user_id = auth.uid()
    )
  );

create policy "evidence_update_org"
  on public.evidence for update
  to authenticated
  using (
    org_id in (select m.org_id from public.user_org_memberships m where m.user_id = auth.uid())
    and exists (
      select 1 from public.claims c
      where c.id = evidence.claim_id and c.user_id = auth.uid()
    )
  )
  with check (
    org_id in (select m.org_id from public.user_org_memberships m where m.user_id = auth.uid())
    and exists (
      select 1 from public.claims c
      where c.id = evidence.claim_id and c.user_id = auth.uid()
    )
  );

create policy "evidence_delete_org"
  on public.evidence for delete
  to authenticated
  using (
    org_id in (select m.org_id from public.user_org_memberships m where m.user_id = auth.uid())
    and exists (
      select 1 from public.claims c
      where c.id = evidence.claim_id and c.user_id = auth.uid()
    )
  );

create policy "evidence_analysis_select_org"
  on public.evidence_analysis for select
  to authenticated
  using (
    org_id in (select m.org_id from public.user_org_memberships m where m.user_id = auth.uid())
    and exists (
      select 1 from public.claims c
      where c.id = evidence_analysis.claim_id and c.user_id = auth.uid()
    )
  );

create policy "evidence_analysis_insert_org"
  on public.evidence_analysis for insert
  to authenticated
  with check (
    org_id in (select m.org_id from public.user_org_memberships m where m.user_id = auth.uid())
    and exists (
      select 1 from public.claims c
      where c.id = evidence_analysis.claim_id and c.user_id = auth.uid()
    )
  );

create policy "statutes_select_authenticated"
  on public.statutes for select
  to authenticated
  using (true);

-- -----------------------------------------------------------------------------
-- Storage: path layout {org_id}/{user_id}/{claim_id}/filename
-- -----------------------------------------------------------------------------
-- insert into storage.buckets (id, name, public) values ('evidence', 'evidence', false);

create policy "evidence_storage_select_org"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] in (
      select m.org_id::text from public.user_org_memberships m where m.user_id = auth.uid()
    )
  );

create policy "evidence_storage_insert_org"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] in (
      select m.org_id::text from public.user_org_memberships m where m.user_id = auth.uid()
    )
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "evidence_storage_update_org"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] in (
      select m.org_id::text from public.user_org_memberships m where m.user_id = auth.uid()
    )
  );

create policy "evidence_storage_delete_org"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] in (
      select m.org_id::text from public.user_org_memberships m where m.user_id = auth.uid()
    )
  );

-- Optional: bucket `training-frames` for scripts/data_ingestion.py (service role; not RLS-scoped here).

-- -----------------------------------------------------------------------------
-- Sign-up → org provisioning (each new auth user gets a personal org + membership)
-- Runs as SECURITY DEFINER so RLS does not block inserts. Idempotent per user (trigger fires once on INSERT).
-- -----------------------------------------------------------------------------
create or replace function public.handle_provision_org_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  local_part text;
  org_slug text;
  org_name text;
begin
  local_part := split_part(coalesce(new.email, ''), '@', 1);
  if local_part is null or length(trim(local_part)) = 0 then
    local_part := 'user';
  end if;

  org_slug := lower(regexp_replace(local_part, '[^a-z0-9]+', '-', 'g'));
  org_slug := trim(both '-' from org_slug);
  if org_slug is null or org_slug = '' then
    org_slug := 'org';
  end if;
  org_slug := left(org_slug, 40) || '-' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8);

  org_name := trim(local_part) || ' workspace';

  insert into public.organizations (name, slug)
  values (org_name, org_slug)
  returning id into new_org_id;

  insert into public.user_org_memberships (user_id, org_id)
  values (new.id, new_org_id);

  return new;
end;
$$;

revoke all on function public.handle_provision_org_for_new_user() from public;

drop trigger if exists on_auth_user_created_provision_org on auth.users;
create trigger on_auth_user_created_provision_org
  after insert on auth.users
  for each row execute procedure public.handle_provision_org_for_new_user();

-- -----------------------------------------------------------------------------
-- MVP seed (replace pilot user id after first signup)
-- -----------------------------------------------------------------------------
-- insert into public.organizations (id, name, slug)
--   values ('00000000-0000-0000-0000-000000000001', 'Pilot Org', 'pilot');
-- insert into public.user_org_memberships (user_id, org_id)
--   values ('<auth.users.id>', '00000000-0000-0000-0000-000000000001');
