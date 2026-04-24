/**
 * Multi-evidence synthesis engine.
 *
 * After all per-evidence items have been analyzed individually, this module
 * aggregates the results into a single SynthesisResult that:
 *   1. Groups evidence by side (insured / adverse / neutral)
 *   2. Detects competing accounts when insured and adverse video are both present
 *   3. Uses neutral evidence (police report, witness, surveillance) as an arbiter
 *   4. Applies source-type priority weights within each side
 *   5. Cross-checks consistency across evidence types
 *   6. Integrates physics sanity flags from physics-layer.ts
 *   7. Attaches weather context from weather/context.ts
 *   8. Produces a narrative that describes which perspectives are present
 *
 * Evidence sides:
 *   insured  — dashcam_video (insured POV), recorded_statement by insured
 *   adverse  — dashcam_video (adverse POV), recorded_statement by adverse party
 *   neutral  — police_report, witness_statement, surveillance_video, bystander_video,
 *              damage_photo, repair_estimate, scene_diagram, medical_record, telematics_video
 *
 * Priority weights (higher = more authoritative for liability):
 *   police_report     1.0 — official agency determination
 *   dashcam_video     0.9 — objective continuous recording
 *   recorded_statement 0.8 — first-person account under oath
 *   surveillance_video 0.8 — third-party fixed camera
 *   bystander_video   0.7 — third-party mobile
 *   witness_statement 0.6 — written account, no cross-examination
 *   damage_photo      0.6 — physical evidence, no motion context
 *   telematics_video  0.75 — OEM sensor data
 *   repair_estimate   0.3 — financial, not liability-determining
 *   scene_diagram     0.4 — reconstructed, not direct observation
 *   medical_record    0.2 — injury documentation, not fault-relevant
 *   other             0.4
 */

import type { VlaAnalysis } from "@/lib/ai/vla-schemas";
import type {
  SynthesisResult,
  EvidenceSummary,
  ConsistencyCheck,
  WeatherContext,
  PhysicsFlags,
} from "@/lib/ai/vla-schemas";
import { runPhysicsChecks } from "@/lib/ai/physics-layer";
import { fetchWeatherContext, summarizeWeather, getAdverseConditionFlags } from "@/lib/weather/context";

export type { SynthesisResult };

/** Weight assigned to each source_type for liability averaging. */
const SOURCE_WEIGHTS: Record<string, number> = {
  police_report: 1.0,
  dashcam_video: 0.9,
  telematics_video: 0.75,
  recorded_statement: 0.8,
  surveillance_video: 0.8,
  bystander_video: 0.7,
  witness_statement: 0.6,
  damage_photo: 0.6,
  scene_diagram: 0.4,
  repair_estimate: 0.3,
  medical_record: 0.2,
  other: 0.4,
};

function getWeight(sourceType: string): number {
  return SOURCE_WEIGHTS[sourceType] ?? 0.4;
}

/** Confidence string → numeric for averaging. */
const CONFIDENCE_NUM: Record<string, number> = { high: 1, medium: 0.5, low: 0.2 };
function confidenceNum(c: string | undefined): number {
  return CONFIDENCE_NUM[c ?? "medium"] ?? 0.5;
}

/**
 * Per-evidence input passed to synthesize().
 * The analyze route builds these from evidence_analysis rows.
 */
export interface EvidenceInput {
  evidence_id: string;
  source_type: string;
  /**
   * Perspective stored on the evidence row: 'insured' | 'adverse' | 'witness' | null.
   * Drives how this item is grouped and weighted in synthesis.
   * null = infer from source_type defaults.
   */
  perspective?: string | null;
  analysis_raw: Record<string, unknown>;
  /** GPS coordinates from evidence.gps_lat / gps_lon — used for weather context. */
  gps_lat?: number | null;
  gps_lon?: number | null;
  /** captured_at ISO string from evidence row — used for weather context. */
  captured_at?: string | null;
}

/**
 * Which "side" of the claim this evidence belongs to.
 * insured  — recorded from or about the insured vehicle/party
 * adverse  — recorded from or about the opposing party
 * neutral  — third-party or official (police, witness, surveillance, damage)
 */
type EvidenceSide = "insured" | "adverse" | "neutral";

const NEUTRAL_SOURCE_TYPES = new Set([
  "police_report",
  "witness_statement",
  "surveillance_video",
  "bystander_video",
  "damage_photo",
  "repair_estimate",
  "scene_diagram",
  "medical_record",
  "telematics_video",
]);

function getSide(input: EvidenceInput): EvidenceSide {
  // Explicit perspective on the evidence row takes priority
  if (input.perspective === "insured") return "insured";
  if (input.perspective === "adverse") return "adverse";
  if (input.perspective === "witness") return "neutral";
  // Source-type defaults (when no per-item perspective is set)
  if (NEUTRAL_SOURCE_TYPES.has(input.source_type)) return "neutral";
  // dashcam_video without an explicit adverse tag → assume insured
  if (input.source_type === "dashcam_video") return "insured";
  return "neutral";
}

/**
 * Extract liability percent from a raw analysis JSON, regardless of which
 * engine produced it (VLA, PDF, damage photo all use different field names).
 */
function extractLiability(raw: Record<string, unknown>): number | undefined {
  if (typeof raw["recommended_liability_percent"] === "number") {
    return raw["recommended_liability_percent"] as number;
  }
  if (typeof raw["insured_liability_percent"] === "number") {
    return raw["insured_liability_percent"] as number;
  }
  return undefined;
}

function extractConfidence(raw: Record<string, unknown>): string | undefined {
  const conf = raw["overall_confidence"] ?? raw["confidence"];
  return typeof conf === "string" ? conf : undefined;
}

function extractKeyFindings(raw: Record<string, unknown>): string[] {
  const findings: string[] = [];

  // VLA analysis
  if (Array.isArray(raw["timeline"])) {
    const timeline = raw["timeline"] as Array<{ action?: string; adjuster_observation?: string }>;
    for (const event of timeline.slice(0, 3)) {
      if (event.action) findings.push(event.action);
    }
  }

  // Policy document
  if (typeof raw["fault_determination"] === "string" && raw["fault_determination"]) {
    findings.push(`Fault determination: ${raw["fault_determination"]}`);
  }

  if (Array.isArray(raw["violations_cited"])) {
    const violations = raw["violations_cited"] as Array<{ violation_description?: string }>;
    for (const v of violations.slice(0, 2)) {
      if (v.violation_description) findings.push(v.violation_description);
    }
  }

  // Damage photo
  if (typeof raw["primary_impact_point"] === "string" && raw["primary_impact_point"]) {
    findings.push(`Primary impact: ${raw["primary_impact_point"]}`);
  }
  if (typeof raw["estimated_severity"] === "string" && raw["estimated_severity"]) {
    findings.push(`Damage severity: ${raw["estimated_severity"]}`);
  }

  // Summary fallback
  if (findings.length === 0 && typeof raw["summary"] === "string") {
    findings.push((raw["summary"] as string).slice(0, 120));
  }

  return findings.slice(0, 5);
}

/** Weighted average liability for a set of (liability, weight) pairs. */
function weightedAvg(items: { liability: number; weight: number }[]): number | undefined {
  if (items.length === 0) return undefined;
  const total = items.reduce((s, x) => s + x.weight, 0);
  if (total === 0) return undefined;
  return Math.round(items.reduce((s, x) => s + x.liability * x.weight, 0) / total);
}

/**
 * Core perspective-aware liability computation.
 *
 * - Single-side claim (insured only, or neutral only): straightforward weighted average.
 * - Competing accounts (insured + adverse video):
 *     If neutral evidence exists → use it as the anchor; award ±10 pp to the side it corroborates.
 *     If no neutral → flag dispute and withhold a numeric score (return undefined).
 * - Neutral always wins a tiebreak; police_report carries the most weight within neutral.
 */
function computeLiability(
  insuredItems: { liability: number; weight: number }[],
  adverseItems: { liability: number; weight: number }[],
  neutralItems: { liability: number; weight: number }[],
): {
  finalLiability: number | undefined;
  competingAccounts: boolean;
  neutralAnchor: number | undefined;
  insuredSideAvg: number | undefined;
  adverseSideAvg: number | undefined;
} {
  const insuredAvg = weightedAvg(insuredItems);
  const adverseAvg = weightedAvg(adverseItems);
  const neutralAvg = weightedAvg(neutralItems);

  const hasInsured = insuredItems.length > 0 && insuredAvg != null;
  const hasAdverse = adverseItems.length > 0 && adverseAvg != null;
  const hasNeutral = neutralItems.length > 0 && neutralAvg != null;

  const competingAccounts = hasInsured && hasAdverse;

  let finalLiability: number | undefined;

  if (competingAccounts) {
    if (hasNeutral) {
      // Neutral is the arbiter. Blend: 60% neutral, 25% insured, 15% adverse.
      // Rationale: police report / witness / surveillance is most objective;
      // insured-side video contributes meaningfully; adverse-side has inherent bias risk.
      finalLiability = Math.round(
        neutralAvg! * 0.6 + insuredAvg! * 0.25 + adverseAvg! * 0.15,
      );
    } else {
      // No neutral arbiter — accounts conflict, cannot reliably score.
      finalLiability = undefined;
    }
  } else if (hasInsured && hasNeutral) {
    // Blend insured + neutral: 55% neutral, 45% insured
    finalLiability = Math.round(neutralAvg! * 0.55 + insuredAvg! * 0.45);
  } else if (hasNeutral) {
    finalLiability = neutralAvg;
  } else if (hasInsured) {
    finalLiability = insuredAvg;
  }

  return {
    finalLiability,
    competingAccounts,
    neutralAnchor: neutralAvg,
    insuredSideAvg: insuredAvg,
    adverseSideAvg: adverseAvg,
  };
}

/**
 * Perspective-aware consistency checks.
 * Includes the original cross-evidence checks plus competing-account detection.
 */
function runConsistencyChecks(
  inputs: EvidenceInput[],
  sides: { side: EvidenceSide; liability: number; weight: number; source: string }[],
  insuredSideAvg: number | undefined,
  adverseSideAvg: number | undefined,
  neutralAnchor: number | undefined,
): ConsistencyCheck[] {
  const checks: ConsistencyCheck[] = [];

  // ── Competing accounts: insured vs adverse video ────────────────────────
  const hasInsuredVideo = inputs.some(
    (i) => getSide(i) === "insured" && i.source_type === "dashcam_video",
  );
  const hasAdverseVideo = inputs.some(
    (i) => getSide(i) === "adverse" && i.source_type === "dashcam_video",
  );

  if (hasInsuredVideo && hasAdverseVideo && insuredSideAvg != null && adverseSideAvg != null) {
    const delta = Math.abs(insuredSideAvg - adverseSideAvg);
    checks.push({
      aspect: "Insured vs adverse dashcam accounts",
      result: delta <= 15 ? "consistent" : delta <= 30 ? "inconclusive" : "inconsistent",
      detail:
        delta <= 15
          ? `Insured-POV (${insuredSideAvg}%) and adverse-POV (${adverseSideAvg}%) video are broadly aligned.`
          : `Insured-POV video (${insuredSideAvg}%) and adverse-POV video (${adverseSideAvg}%) give competing accounts (${delta} pp spread). ${neutralAnchor != null ? `Neutral evidence anchors at ${neutralAnchor}%.` : "No neutral evidence available to arbitrate."}`,
    });
  }

  // ── Neutral evidence corroboration ─────────────────────────────────────
  if (neutralAnchor != null) {
    if (insuredSideAvg != null) {
      const delta = Math.abs(insuredSideAvg - neutralAnchor);
      checks.push({
        aspect: "Insured account vs neutral evidence",
        result: delta <= 15 ? "consistent" : delta <= 30 ? "inconclusive" : "inconsistent",
        detail:
          delta <= 15
            ? `Insured video/statement (${insuredSideAvg}%) is corroborated by neutral evidence (${neutralAnchor}%).`
            : `Insured video/statement (${insuredSideAvg}%) diverges from neutral evidence (${neutralAnchor}%) by ${delta} pp — review recommended.`,
      });
    }
    if (adverseSideAvg != null) {
      const delta = Math.abs(adverseSideAvg - neutralAnchor);
      checks.push({
        aspect: "Adverse account vs neutral evidence",
        result: delta <= 15 ? "consistent" : delta <= 30 ? "inconclusive" : "inconsistent",
        detail:
          delta <= 15
            ? `Adverse video/statement (${adverseSideAvg}%) is corroborated by neutral evidence (${neutralAnchor}%).`
            : `Adverse video/statement (${adverseSideAvg}%) diverges from neutral evidence (${neutralAnchor}%) by ${delta} pp — neutral evidence does not support their account.`,
      });
    }
  }

  // ── VLA vs police report ─────────────────────────────────────────────────
  const policeInputs = inputs.filter((i) => i.source_type === "police_report");
  const vlaInputs = inputs.filter((i) =>
    ["dashcam_video", "bystander_video", "surveillance_video"].includes(i.source_type),
  );

  if (vlaInputs.length > 0 && policeInputs.length > 0) {
    const vlaLiabilities = sides.filter((s) =>
      ["dashcam_video", "bystander_video", "surveillance_video"].includes(s.source),
    );
    const policeLiabilities = sides.filter((s) => s.source === "police_report");

    if (vlaLiabilities.length > 0 && policeLiabilities.length > 0) {
      const avgVla = vlaLiabilities.reduce((s, l) => s + l.liability, 0) / vlaLiabilities.length;
      const avgPolice = policeLiabilities.reduce((s, l) => s + l.liability, 0) / policeLiabilities.length;
      const delta = Math.abs(avgVla - avgPolice);

      checks.push({
        aspect: "VLA vs police report liability",
        result: delta <= 20 ? "consistent" : delta <= 35 ? "inconclusive" : "inconsistent",
        detail:
          delta <= 20
            ? `VLA (${avgVla.toFixed(0)}%) aligns with police determination (${avgPolice.toFixed(0)}%).`
            : `VLA (${avgVla.toFixed(0)}%) diverges from police determination (${avgPolice.toFixed(0)}%) by ${delta.toFixed(0)} pp — manual review recommended.`,
      });
    }
  }

  // ── Damage photo severity vs described mechanism ────────────────────────
  const damageInputs = inputs.filter((i) => i.source_type === "damage_photo");
  for (const dmg of damageInputs) {
    const severity = dmg.analysis_raw["estimated_severity"] as string | undefined;
    if (!severity) continue;

    const consistent = dmg.analysis_raw["consistent_with_described_mechanism"] as string | undefined;
    if (consistent === "no") {
      checks.push({
        aspect: "Damage pattern consistency",
        result: "inconsistent",
        detail: `Damage photo shows ${severity} damage inconsistent with described collision mechanism.`,
      });
    } else if (consistent === "yes") {
      checks.push({
        aspect: "Damage pattern consistency",
        result: "consistent",
        detail: `Damage photo (${severity}) is consistent with described collision mechanism.`,
      });
    } else {
      checks.push({
        aspect: "Damage pattern consistency",
        result: "inconclusive",
        detail: `Damage photo shows ${severity} damage; consistency with described mechanism is uncertain.`,
      });
    }
  }

  // ── Overall cross-evidence liability spread ─────────────────────────────
  const allLiabilities = sides.map((s) => s.liability);
  if (allLiabilities.length >= 2) {
    const spread = Math.max(...allLiabilities) - Math.min(...allLiabilities);
    checks.push({
      aspect: "Cross-evidence liability spread",
      result: spread <= 15 ? "consistent" : spread <= 30 ? "inconclusive" : "inconsistent",
      detail: `Liability estimates range ${Math.min(...allLiabilities).toFixed(0)}%–${Math.max(...allLiabilities).toFixed(0)}% across ${allLiabilities.length} evidence items (spread: ${spread.toFixed(0)} pp).`,
    });
  }

  return checks;
}

/**
 * Build the synthesis narrative with perspective context.
 */
function buildNarrative(
  evidenceSummaries: EvidenceSummary[],
  inputs: EvidenceInput[],
  finalLiability: number | undefined,
  competingAccounts: boolean,
  insuredSideAvg: number | undefined,
  adverseSideAvg: number | undefined,
  neutralAnchor: number | undefined,
  consistencyChecks: ConsistencyCheck[],
  weatherCtx: WeatherContext | null,
  physicsFlags: PhysicsFlags | undefined,
  reviewRequired: boolean,
): string {
  const parts: string[] = [];

  // Weather context
  const weatherSummary = summarizeWeather(weatherCtx);
  if (weatherSummary) parts.push(weatherSummary);

  // Evidence overview with perspective context
  const insuredEvidence = inputs.filter((i) => getSide(i) === "insured");
  const adverseEvidence = inputs.filter((i) => getSide(i) === "adverse");
  const neutralEvidence = inputs.filter((i) => getSide(i) === "neutral");

  const sourceList = evidenceSummaries.map((e) => e.source_type.replace(/_/g, " ")).join(", ");
  parts.push(
    `This claim was evaluated using ${evidenceSummaries.length} evidence item${evidenceSummaries.length > 1 ? "s" : ""}: ${sourceList}.`,
  );

  // Perspective breakdown (only when multi-perspective)
  if (adverseEvidence.length > 0 || (insuredEvidence.length > 0 && neutralEvidence.length > 0)) {
    const breakdown: string[] = [];
    if (insuredEvidence.length > 0) {
      breakdown.push(`${insuredEvidence.length} insured-side item${insuredEvidence.length > 1 ? "s" : ""}`);
    }
    if (adverseEvidence.length > 0) {
      breakdown.push(`${adverseEvidence.length} adverse-side item${adverseEvidence.length > 1 ? "s" : ""}`);
    }
    if (neutralEvidence.length > 0) {
      breakdown.push(`${neutralEvidence.length} neutral item${neutralEvidence.length > 1 ? "s" : ""} (${neutralEvidence.map((e) => e.source_type.replace(/_/g, " ")).join(", ")})`);
    }
    parts.push(`Evidence breakdown: ${breakdown.join("; ")}.`);
  }

  // Competing accounts notice
  if (competingAccounts) {
    if (insuredSideAvg != null && adverseSideAvg != null) {
      parts.push(
        `Competing accounts detected: insured-side evidence suggests ${insuredSideAvg}% insured fault; adverse-side evidence suggests ${adverseSideAvg}% insured fault.`,
      );
    }
    if (neutralAnchor != null) {
      parts.push(`Neutral evidence (police report / witness / surveillance) anchors liability at ${neutralAnchor}%, used as primary arbiter.`);
    } else {
      parts.push("No neutral evidence is available to arbitrate between the competing accounts — automated liability scoring is withheld.");
    }
  }

  // Liability summary
  if (finalLiability != null) {
    parts.push(`Synthesized insured liability across all evidence: ${finalLiability}%.`);
  } else if (!competingAccounts) {
    parts.push("Insufficient evidence to compute a synthesized liability estimate.");
  }

  // Consistency findings
  const inconsistencies = consistencyChecks.filter((c) => c.result === "inconsistent");
  if (inconsistencies.length > 0) {
    parts.push(
      `Consistency issues flagged: ${inconsistencies.map((c) => c.detail ?? c.aspect).join(" ")}`,
    );
  }

  // Physics flags
  if (physicsFlags && physicsFlags.overall !== "pass") {
    const flagged = physicsFlags.checks.filter((c) => c.result === "warn" || c.result === "fail");
    parts.push(
      `Physics sanity checks: ${flagged.map((f) => f.detail ?? f.check).join("; ")}.`,
    );
  }

  if (reviewRequired) {
    parts.push("Human adjuster review is recommended before closing this claim.");
  }

  return parts.join(" ");
}

/**
 * Main entry point: synthesize all per-evidence analyses into a final claim result.
 *
 * @param inputs — Array of per-evidence inputs (one per evidence row that has been analyzed)
 * @param primaryVlaAnalysis — The VLA analysis from the primary dashcam (used for physics checks)
 * @returns SynthesisResult
 */
export async function synthesizeClaim(
  inputs: EvidenceInput[],
  primaryVlaAnalysis: VlaAnalysis | null,
): Promise<SynthesisResult> {
  if (inputs.length === 0) {
    throw new Error("synthesizeClaim: no evidence inputs provided");
  }

  // ── Per-evidence summaries ────────────────────────────────────────────────
  const evidenceSummaries: EvidenceSummary[] = inputs.map((inp) => {
    const liability = extractLiability(inp.analysis_raw);
    const confidence = extractConfidence(inp.analysis_raw) as "high" | "medium" | "low" | undefined;
    const weight = getWeight(inp.source_type);

    return {
      evidence_id: inp.evidence_id,
      source_type: inp.source_type,
      weight,
      liability_percent: liability,
      confidence,
      key_findings: extractKeyFindings(inp.analysis_raw),
    };
  });

  // ── Group by side and build weighted liability inputs ────────────────────
  const allSides: { side: EvidenceSide; liability: number; weight: number; source: string }[] = [];
  const insuredLiabilities: { liability: number; weight: number }[] = [];
  const adverseLiabilities: { liability: number; weight: number }[] = [];
  const neutralLiabilities: { liability: number; weight: number }[] = [];

  for (const inp of inputs) {
    const liability = extractLiability(inp.analysis_raw);
    const confidence = extractConfidence(inp.analysis_raw);
    if (liability == null) continue;

    const weight = getWeight(inp.source_type) * confidenceNum(confidence);
    const side = getSide(inp);

    allSides.push({ side, liability, weight, source: inp.source_type });

    if (side === "insured") insuredLiabilities.push({ liability, weight });
    else if (side === "adverse") adverseLiabilities.push({ liability, weight });
    else neutralLiabilities.push({ liability, weight });
  }

  // ── Perspective-aware liability computation ───────────────────────────────
  const { finalLiability, competingAccounts, neutralAnchor, insuredSideAvg, adverseSideAvg } =
    computeLiability(insuredLiabilities, adverseLiabilities, neutralLiabilities);

  // ── Physics checks (on primary VLA, if present) ──────────────────────────
  let physicsFlags: PhysicsFlags | undefined;
  if (primaryVlaAnalysis) {
    physicsFlags = runPhysicsChecks(primaryVlaAnalysis);
  }

  // ── Weather context (from first dashcam evidence with GPS coords) ─────────
  let weatherCtx: WeatherContext | null = null;
  const dashcamWithGps = inputs.find(
    (i) =>
      ["dashcam_video", "bystander_video", "telematics_video"].includes(i.source_type) &&
      i.gps_lat != null &&
      i.gps_lon != null &&
      i.captured_at != null,
  );

  if (dashcamWithGps?.gps_lat != null && dashcamWithGps.gps_lon != null && dashcamWithGps.captured_at) {
    weatherCtx = await fetchWeatherContext(
      dashcamWithGps.gps_lat,
      dashcamWithGps.gps_lon,
      dashcamWithGps.captured_at,
    );
  }

  // ── Consistency checks ────────────────────────────────────────────────────
  const consistencyChecks = runConsistencyChecks(
    inputs,
    allSides,
    insuredSideAvg,
    adverseSideAvg,
    neutralAnchor,
  );

  // ── Review required determination ─────────────────────────────────────────
  const reviewReasons: string[] = [];

  if (competingAccounts && neutralAnchor == null) {
    reviewReasons.push("Competing insured and adverse accounts with no neutral evidence to arbitrate");
  }
  if (physicsFlags?.overall === "fail") {
    reviewReasons.push("Physics sanity check failure");
  }
  if (consistencyChecks.some((c) => c.result === "inconsistent")) {
    reviewReasons.push("Inconsistent findings across evidence types");
  }
  const allLiabilityValues = allSides.map((s) => s.liability);
  const liabilitySpread =
    allLiabilityValues.length >= 2
      ? Math.max(...allLiabilityValues) - Math.min(...allLiabilityValues)
      : 0;
  if (liabilitySpread > 30) {
    reviewReasons.push(`High liability spread across evidence (${liabilitySpread.toFixed(0)} pp)`);
  }
  const adverseConditions = getAdverseConditionFlags(weatherCtx);
  if (adverseConditions.length > 0) {
    reviewReasons.push(`Adverse weather conditions: ${adverseConditions.join(", ")}`);
  }

  const reviewRequired = reviewReasons.length > 0;

  // ── Overall confidence ─────────────────────────────────────────────────────
  const confValues = evidenceSummaries
    .map((e) => confidenceNum(e.confidence))
    .filter((v) => v > 0);
  const avgConf =
    confValues.length > 0 ? confValues.reduce((a, b) => a + b, 0) / confValues.length : 0.5;
  const overallConfidence: "high" | "medium" | "low" =
    reviewRequired
      ? "low"
      : avgConf >= 0.8
        ? "high"
        : avgConf >= 0.4
          ? "medium"
          : "low";

  // ── Narrative ─────────────────────────────────────────────────────────────
  const synthesisNarrative = buildNarrative(
    evidenceSummaries,
    inputs,
    finalLiability,
    competingAccounts,
    insuredSideAvg,
    adverseSideAvg,
    neutralAnchor,
    consistencyChecks,
    weatherCtx,
    physicsFlags,
    reviewRequired,
  );

  return {
    final_liability_percent: finalLiability,
    confidence: overallConfidence,
    evidence_count: inputs.length,
    evidence_summaries: evidenceSummaries,
    consistency_checks: consistencyChecks,
    physics_flags: physicsFlags,
    weather_context: weatherCtx ?? undefined,
    synthesis_narrative: synthesisNarrative,
    review_required: reviewRequired,
    review_reasons: reviewReasons,
    sources_used: evidenceSummaries.map((e) => e.source_type),
  };
}
