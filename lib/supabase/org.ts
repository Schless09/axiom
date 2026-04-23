import type { SupabaseClient } from "@supabase/supabase-js";

/** Resolved org for the signed-in user (first membership row). */
export type OrgProfile = {
  orgId: string;
  name: string;
  slug: string;
};

async function getMembershipOrgId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("user_org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .order("org_id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data?.org_id) return null;
  return data.org_id as string;
}

/**
 * Returns org id, display name, and slug for UI (navbar, workspace labels).
 * Provisioning is server-side: `handle_provision_org_for_new_user` on `auth.users`
 * (see `supabase_schema.sql`). There is no org name field at sign-up — the trigger
 * creates a personal workspace from the email local-part.
 */
export async function getOrgProfileForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<OrgProfile | null> {
  const orgId = await getMembershipOrgId(supabase, userId);
  if (!orgId) return null;

  const { data: org, error } = await supabase
    .from("organizations")
    .select("name, slug")
    .eq("id", orgId)
    .maybeSingle();

  if (error || !org?.name) return null;

  return {
    orgId,
    name: org.name,
    slug: typeof org.slug === "string" ? org.slug : "",
  };
}

/**
 * Returns the org_id for the signed-in user (MVP: first membership row).
 * Scope tenant data with `.eq("org_id", orgId)` in addition to RLS.
 */
export async function getOrgIdForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  return getMembershipOrgId(supabase, userId);
}
