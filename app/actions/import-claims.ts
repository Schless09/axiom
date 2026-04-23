"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrgIdForUser } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";

export type ImportRow = {
  claim_number: string;
  state_code: string;
  adjuster_fault_percent: number | null;
  settlement_amount: number | null;
};

export type ImportResult = {
  ok: boolean;
  imported: number;
  skipped: number;
  errors: { claim_number: string; reason: string }[];
  error?: string;
};

export async function importClaimsFromCsv(rows: ImportRow[]): Promise<ImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, imported: 0, skipped: 0, errors: [], error: "Not authenticated." };
  }

  const orgId = await getOrgIdForUser(supabase, user.id);
  if (!orgId) {
    return { ok: false, imported: 0, skipped: 0, errors: [], error: "No organization context." };
  }

  if (rows.length === 0) {
    return { ok: true, imported: 0, skipped: 0, errors: [] };
  }

  // Find which claim numbers already exist so we can skip them
  const claimNumbers = rows.map((r) => r.claim_number);
  const { data: existing } = await supabase
    .from("claims")
    .select("claim_number")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .in("claim_number", claimNumbers);

  const existingSet = new Set((existing ?? []).map((e) => e.claim_number));
  const newRows = rows.filter((r) => !existingSet.has(r.claim_number));
  const skipped = rows.length - newRows.length;

  if (newRows.length === 0) {
    revalidatePath("/dashboard/claims");
    revalidatePath("/dashboard/analytics");
    return { ok: true, imported: 0, skipped, errors: [] };
  }

  // Batch insert claims
  const { data: insertedClaims, error: insertError } = await supabase
    .from("claims")
    .insert(
      newRows.map((r) => ({
        org_id: orgId,
        user_id: user.id,
        claim_number: r.claim_number,
        state_code: r.state_code.toUpperCase(),
        // status stays "pending" — awaiting video upload and AI analysis
        status: "pending",
      })),
    )
    .select("id, claim_number");

  if (insertError || !insertedClaims) {
    return {
      ok: false,
      imported: 0,
      skipped,
      errors: [],
      error: insertError?.message ?? "Batch claim insert failed.",
    };
  }

  // Map claim_number → id for review inserts
  const claimIdMap = new Map(insertedClaims.map((c) => [c.claim_number, c.id]));

  // Batch insert submitted adjuster reviews for rows that have outcome data
  const reviewsToInsert = newRows
    .filter((r) => r.adjuster_fault_percent != null)
    .map((r) => ({
      claim_id: claimIdMap.get(r.claim_number)!,
      org_id: orgId,
      user_id: user.id,
      status: "submitted",
      adjuster_fault_percent: r.adjuster_fault_percent,
      reserve_amount: r.settlement_amount ?? null,
      adjuster_notes: "Imported from historical data",
      event_overrides: [],
    }));

  const reviewErrors: { claim_number: string; reason: string }[] = [];

  if (reviewsToInsert.length > 0) {
    const { error: reviewError } = await supabase.from("claim_reviews").insert(reviewsToInsert);
    if (reviewError) {
      reviewErrors.push({ claim_number: "*", reason: `Could not save adjuster outcomes: ${reviewError.message}` });
    }
  }

  revalidatePath("/dashboard/claims");
  revalidatePath("/dashboard/analytics");

  return {
    ok: true,
    imported: insertedClaims.length,
    skipped,
    errors: reviewErrors,
  };
}
