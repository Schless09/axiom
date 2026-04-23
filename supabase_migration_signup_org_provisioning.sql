-- Run once in Supabase SQL Editor if you already applied an older supabase_schema.sql
-- *without* the sign-up provisioning block. New projects should use the full supabase_schema.sql instead.

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
