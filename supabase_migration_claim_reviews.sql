-- Axiom VLA — Adjuster review layer
-- Run in Supabase SQL Editor after supabase_schema.sql.
--
-- One claim_reviews row per claim — stores the adjuster's determination
-- (fault %, notes, per-event agree/dispute overrides) so shadow-audit deltas
-- (AI recommendation vs human decision) can be measured over time.

-- -----------------------------------------------------------------------------
-- Table
-- -----------------------------------------------------------------------------
create table if not exists public.claim_reviews (
  id         uuid    default gen_random_uuid() primary key,
  claim_id   uuid    not null unique references public.claims(id) on delete cascade,
  org_id     uuid    not null references public.organizations(id) on delete cascade,
  user_id    uuid    not null references auth.users(id) on delete cascade,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null,

  -- Adjuster overall determination
  status                 text    default 'in_review'
                         check (status in ('in_review', 'submitted')),
  adjuster_fault_percent integer check (adjuster_fault_percent between 0 and 100),
  adjuster_notes         text,

  -- Per-event annotation array
  -- Each element: { timestamp_seconds: number, agreed: boolean, note?: string, fault_override?: number }
  event_overrides jsonb   not null default '[]'::jsonb
);

create index if not exists idx_claim_reviews_claim  on public.claim_reviews (claim_id);
create index if not exists idx_claim_reviews_user   on public.claim_reviews (user_id);
create index if not exists idx_claim_reviews_org    on public.claim_reviews (org_id);

-- Keep updated_at current on every write
create or replace function public.claim_reviews_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists claim_reviews_updated_at on public.claim_reviews;
create trigger claim_reviews_updated_at
  before update on public.claim_reviews
  for each row execute function public.claim_reviews_set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.claim_reviews enable row level security;

-- Users can only read their own reviews
create policy "claim_reviews_select_own"
  on public.claim_reviews for select
  to authenticated
  using (user_id = auth.uid());

-- Users can insert reviews only for claims they own in their org
create policy "claim_reviews_insert_own"
  on public.claim_reviews for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and org_id in (select m.org_id from public.user_org_memberships m where m.user_id = auth.uid())
    and exists (
      select 1 from public.claims c
      where c.id = claim_id and c.user_id = auth.uid()
    )
  );

-- Users can update only their own reviews
create policy "claim_reviews_update_own"
  on public.claim_reviews for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Users can delete only their own reviews
create policy "claim_reviews_delete_own"
  on public.claim_reviews for delete
  to authenticated
  using (user_id = auth.uid());
