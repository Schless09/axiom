import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrgIdForUser } from "@/lib/supabase/org";

type Params = { params: Promise<{ id: string }> };

/** Subset of synthesis JSON for carriers (full synthesis_raw stays in DB for debugging). */
function synthesisExportSummary(raw: unknown): {
  review_required: boolean;
  review_reasons: string[];
  confidence: string;
  final_liability_percent?: number;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.review_required !== "boolean" || typeof o.confidence !== "string") return null;
  const reasons = Array.isArray(o.review_reasons)
    ? o.review_reasons.filter((x): x is string => typeof x === "string")
    : [];
  const out: {
    review_required: boolean;
    review_reasons: string[];
    confidence: string;
    final_liability_percent?: number;
  } = {
    review_required: o.review_required,
    review_reasons: reasons,
    confidence: o.confidence,
  };
  if (typeof o.final_liability_percent === "number") {
    out.final_liability_percent = o.final_liability_percent;
  }
  return out;
}

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
    .select("id, claim_number, state_code, status, liability_score, summary, created_at, user_id, dashcam_perspective")
    .eq("id", claimId)
    .eq("org_id", orgId)
    .single();

  if (claimError || !claim || claim.user_id !== user.id) {
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }

  // Phase D column — separate query so export still works if migration not applied
  let synthesisRaw: unknown = null;
  const { data: synRow, error: synErr } = await supabase
    .from("claims")
    .select("synthesis_raw")
    .eq("id", claimId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!synErr && synRow && typeof synRow === "object" && "synthesis_raw" in synRow) {
    synthesisRaw = (synRow as { synthesis_raw: unknown }).synthesis_raw ?? null;
  }

  const { data: evidenceRows } = await supabase
    .from("evidence")
    .select("id, file_type, source_type, perspective, vla_analysis_raw")
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
      dashcam_perspective: claim.dashcam_perspective ?? null,
      synthesis_summary: synthesisExportSummary(synthesisRaw) ?? undefined,
    },
    evidence: (evidenceRows ?? []).map((ev) => ({
      id: ev.id,
      file_type: ev.file_type,
      source_type: ev.source_type ?? null,
      perspective: ev.perspective ?? null,
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
