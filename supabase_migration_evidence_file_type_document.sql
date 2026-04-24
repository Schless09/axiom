-- Allow evidence.file_type to be NULL or one of: video | image | document (PDFs use document).
--
-- If you already ran an older version and PDFs still fail, your CHECK may use a different
-- name than evidence_file_type_check. This script drops every CHECK on public.evidence whose
-- definition mentions file_type, then adds one canonical constraint.
--
-- Inspect checks first (optional):
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
      and pg_get_constraintdef(c.oid) ilike '%file_type%'
  loop
    execute format('alter table public.evidence drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.evidence
  add constraint evidence_file_type_check
  check (
    file_type is null
    or file_type in ('video', 'image', 'document')
  );

commit;
