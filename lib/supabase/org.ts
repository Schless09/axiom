import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns the org_id for the signed-in user (MVP: first membership row).
 * Scope tenant data with `.eq("org_id", orgId)` in addition to RLS.
 */
export async function getOrgIdForUser(
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
