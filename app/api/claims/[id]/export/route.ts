import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrgIdForUser } from "@/lib/supabase/org";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/claims/:id/export
 * Returns a downloadable JSON report of the claim analysis.
 * Includes an AI disclaimer required for pilot agreements.
 */
export async function GET(_request: Request, { params }: Params) {
  const { id: claimId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = await getOrgIdForUser(supabase, user.id);
  if (!orgId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  const { data: claim, error: claimError } = await supabase
    .from("claims")
    .select("id, claim_number, state_code, status, liability_score, summary, created_at, user_id")
    .eq("id", claimId)
    .eq("org_id", orgId)
    .single();

  if (claimError || !claim || claim.user_id !== user.id) {
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }

  const { data: evidenceRows } = await supabase
    .from("evidence")
    .select("id, file_type, vla_analysis_raw")
    .eq("claim_id", claimId)
    .eq("org_id", orgId)
    .order("id", { ascending: true });

  const report = {
    exported_at: new Date().toISOString(),
    disclaimer:
      "This report is AI-assisted. Analysis is provided for adjuster review only. " +
      "Final liability determination remains the responsibility of the human adjuster and carrier.",
    claim: {
      id: claim.id,
      claim_number: claim.claim_number,
      state_code: claim.state_code,
      status: claim.status,
      liability_score: claim.liability_score,
      summary: claim.summary,
      created_at: claim.created_at,
    },
    evidence: (evidenceRows ?? []).map((ev) => ({
      id: ev.id,
      file_type: ev.file_type,
      analysis: ev.vla_analysis_raw,
    })),
  };

  const safeName = (claim.claim_number as string).replace(/[^a-zA-Z0-9-]/g, "_");
  const filename = `axiom-vla-${safeName}.json`;

  return new NextResponse(JSON.stringify(report, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
