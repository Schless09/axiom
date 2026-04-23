-- DANGER: Dev / reset only — deletes ALL claims, evidence rows, orgs, memberships, and auth users.
-- Run in Supabase → SQL Editor. Empty the `evidence` Storage bucket afterward (SQL cannot remove files).
-- Statutes rows are NOT deleted.

begin;

delete from public.claims;
delete from public.user_org_memberships;
delete from public.organizations;
delete from auth.users;

commit;
