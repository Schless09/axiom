"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrgIdForUser } from "@/lib/supabase/org";

export type EventOverride = {
  timestamp_seconds: number;
  agreed: boolean;
  note?: string;
  fault_override?: number;
};

export type ClaimReviewPayload = {
  adjuster_fault_percent: number | null;
  adjuster_notes: string;
  event_overrides: EventOverride[];
  reserve_amount: number | null;
};

export type ClaimReviewResult = { ok: true } | { ok: false; error: string };

async function getVerifiedClaim(claimId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return { supabase: null, user: null, orgId: null, error: "Not authenticated." };

  const orgId = await getOrgIdForUser(supabase, user.id);
  if (!orgId) return { supabase: null, user: null, orgId: null, error: "No organization context." };

  const { data: claim, error: claimError } = await supabase
    .from("claims")
    .select("id, user_id")
    .eq("id", claimId)
    .eq("org_id", orgId)
    .single();

  if (claimError || !claim || claim.user_id !== user.id) {
    return { supabase: null, user: null, orgId: null, error: "Claim not found or access denied." };
  }

  return { supabase, user, orgId, error: null };
}

/**
 * Upsert an adjuster review for a claim. Creates or updates the draft.
 * Status stays "in_review" until explicitly submitted.
 */
export async function saveClaimReview(
  claimId: string,
  payload: ClaimReviewPayload,
): Promise<ClaimReviewResult> {
  const { supabase, user, orgId, error } = await getVerifiedClaim(claimId);
  if (error || !supabase || !user || !orgId) return { ok: false, error: error ?? "Unknown error." };

  const { error: upsertError } = await supabase.from("claim_reviews").upsert(
    {
      claim_id: claimId,
      org_id: orgId,
      user_id: user.id,
      status: "in_review",
      adjuster_fault_percent: payload.adjuster_fault_percent,
      adjuster_notes: payload.adjuster_notes,
      event_overrides: payload.event_overrides,
      reserve_amount: payload.reserve_amount,
    },
    { onConflict: "claim_id" },
  );

  if (upsertError) return { ok: false, error: upsertError.message };
  return { ok: true };
}

/**
 * Submit a finalized adjuster review. Sets status to "submitted".
 */
export async function submitClaimReview(
  claimId: string,
  payload: ClaimReviewPayload,
): Promise<ClaimReviewResult> {
  const { supabase, user, orgId, error } = await getVerifiedClaim(claimId);
  if (error || !supabase || !user || !orgId) return { ok: false, error: error ?? "Unknown error." };

  const { error: upsertError } = await supabase.from("claim_reviews").upsert(
    {
      claim_id: claimId,
      org_id: orgId,
      user_id: user.id,
      status: "submitted",
      adjuster_fault_percent: payload.adjuster_fault_percent,
      adjuster_notes: payload.adjuster_notes,
      event_overrides: payload.event_overrides,
      reserve_amount: payload.reserve_amount,
    },
    { onConflict: "claim_id" },
  );

  if (upsertError) return { ok: false, error: upsertError.message };
  return { ok: true };
}
