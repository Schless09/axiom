"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgIdForUser } from "@/lib/supabase/org";

const BUCKET = "evidence";

export type DeleteClaimResult = { ok: true } | { ok: false; error: string };

/**
 * Permanently deletes a claim, its evidence DB rows, and the associated
 * Storage objects. Only the claim owner within the same org may delete.
 */
export async function deleteClaim(claimId: string): Promise<DeleteClaimResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, error: "Not authenticated." };
  }

  const orgId = await getOrgIdForUser(supabase, user.id);
  if (!orgId) {
    return { ok: false, error: "No organization context." };
  }

  const { data: claim, error: claimError } = await supabase
    .from("claims")
    .select("id, user_id")
    .eq("id", claimId)
    .eq("org_id", orgId)
    .single();

  if (claimError || !claim || claim.user_id !== user.id) {
    return { ok: false, error: "Claim not found or access denied." };
  }

  // Collect storage paths before cascade-deleting DB rows
  const { data: evidenceRows } = await supabase
    .from("evidence")
    .select("file_path")
    .eq("claim_id", claimId)
    .eq("org_id", orgId);

  const storagePaths = (evidenceRows ?? [])
    .map((e: { file_path: string }) => e.file_path)
    .filter(Boolean);

  if (storagePaths.length > 0) {
    // Best-effort: don't abort if storage removal partially fails
    await supabase.storage.from(BUCKET).remove(storagePaths);
  }

  // evidence rows are cascade-deleted by the claims FK
  const { error: deleteError } = await supabase
    .from("claims")
    .delete()
    .eq("id", claimId)
    .eq("org_id", orgId);

  if (deleteError) {
    return { ok: false, error: deleteError.message };
  }

  revalidatePath("/dashboard/claims");
  return { ok: true };
}
