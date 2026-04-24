-- Align evidence.source_type CHECK with supabase_schema.sql (includes `other` and all registry values).
-- Run if inserts fail with: violates check constraint "evidence_source_type_check"
--
-- Optional — inspect current definition:
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.evidence'::regclass and contype = 'c';

begin;

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.evidence'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%source_type%'
  loop
    execute format('alter table public.evidence drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.evidence
  add constraint evidence_source_type_check
  check (
    source_type in (
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
    )
  );

commit;
