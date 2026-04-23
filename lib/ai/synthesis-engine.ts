/**
 * Multi-evidence synthesis engine.
 *
 * After all per-evidence items have been analyzed individually, this module
 * aggregates the results into a single SynthesisResult that:
 *   1. Applies source-type priority weights when computing final liability
 *   2. Cross-checks consistency across evidence types
 *   3. Integrates physics sanity flags from physics-layer.ts
 *   4. Attaches weather context from weather/context.ts
 *   5. Produces a narrative for the adjuster
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
  analysis_raw: Record<string, unknown>;
  /** GPS coordinates from evidence.gps_lat / gps_lon — used for weather context. */
  gps_lat?: number | null;
  gps_lon?: number | null;
  /** captured_at ISO string from evidence row — used for weather context. */
  captured_at?: string | null;
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

/**
 * Cross-check consistency between VLA results and other evidence types.
 * Returns a list of consistency check results for the synthesis output.
 */
function runConsistencyChecks(
  inputs: EvidenceInput[],
  liabilities: Array<{ liability: number; weight: number; source: string }>,
): ConsistencyCheck[] {
  const checks: ConsistencyCheck[] = [];

  // Check: VLA liability vs police report determination
  const vlaInputs = inputs.filter((i) => ["dashcam_video", "bystander_video", "surveillance_video", "telematics_video"].includes(i.source_type));
  const policeInputs = inputs.filter((i) => i.source_type === "police_report");

  if (vlaInputs.length > 0 && policeInputs.length > 0) {
    const vlaLiabilities = liabilities.filter((l) =>
      ["dashcam_video", "bystander_video", "surveillance_video"].includes(l.source),
    );
    const policeLiabilities = liabilities.filter((l) => l.source === "police_report");

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

  // Check: damage photo severity vs VLA impact description
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

  // Check: liability spread across all evidence
  if (liabilities.length >= 2) {
    const vals = liabilities.map((l) => l.liability);
    const spread = Math.max(...vals) - Math.min(...vals);
    checks.push({
      aspect: "Cross-evidence liability spread",
      result: spread <= 15 ? "consistent" : spread <= 30 ? "inconclusive" : "inconsistent",
      detail: `Liability estimates range ${Math.min(...vals).toFixed(0)}%–${Math.max(...vals).toFixed(0)}% across ${liabilities.length} evidence items (spread: ${spread.toFixed(0)} pp).`,
    });
  }

  return checks;
}

/**
 * Build the synthesis narrative paragraph combining all evidence findings.
 */
function buildNarrative(
  evidenceSummaries: EvidenceSummary[],
  finalLiability: number | undefined,
  consistencyChecks: ConsistencyCheck[],
  weatherCtx: WeatherContext | null,
  physicsFlags: PhysicsFlags | undefined,
  reviewRequired: boolean,
): string {
  const parts: string[] = [];

  // Weather context
  const weatherSummary = summarizeWeather(weatherCtx);
  if (weatherSummary) parts.push(weatherSummary);

  // Evidence overview
  const sourceList = evidenceSummaries.map((e) => e.source_type.replace(/_/g, " ")).join(", ");
  parts.push(
    `This claim was evaluated using ${evidenceSummaries.length} evidence item${evidenceSummaries.length > 1 ? "s" : ""}: ${sourceList}.`,
  );

  // Liability summary
  if (finalLiability != null) {
    parts.push(
      `Synthesized insured liability across all evidence: ${finalLiability}%.`,
    );
  } else {
    parts.push("Insufficient evidence to compute a synthesized liability estimate.");
  }

  // Consistency findings
  const inconsistencies = consistencyChecks.filter((c) => c.result === "inconsistent");
  if (inconsistencies.length > 0) {
    parts.push(
      `Consistency issues flagged: ${inconsistencies.map((c) => c.detail ?? c.aspect).join(" ")}`
    );
  }

  // Physics flags
  if (physicsFlags && physicsFlags.overall !== "pass") {
    const flagged = physicsFlags.checks.filter((c) => c.result === "warn" || c.result === "fail");
    parts.push(
      `Physics sanity checks: ${flagged.map((f) => f.detail ?? f.check).join("; ")}.`,
    );
  }

  // Review recommendation
  if (reviewRequired) {
    parts.push(
      "Human adjuster review is recommended before closing this claim.",
    );
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

  // ── Weighted liability average ────────────────────────────────────────────
  const liabilityInputs = evidenceSummaries
    .filter((e) => e.liability_percent != null)
    .map((e) => ({
      liability: e.liability_percent!,
      weight: e.weight * confidenceNum(e.confidence),
      source: e.source_type,
    }));

  let finalLiability: number | undefined;
  if (liabilityInputs.length > 0) {
    const totalWeight = liabilityInputs.reduce((s, l) => s + l.weight, 0);
    const weightedSum = liabilityInputs.reduce((s, l) => s + l.liability * l.weight, 0);
    finalLiability = Math.round(weightedSum / totalWeight);
  }

  // ── Physics checks (on primary VLA, if present) ────────────────────────────
  let physicsFlags: PhysicsFlags | undefined;
  if (primaryVlaAnalysis) {
    physicsFlags = runPhysicsChecks(primaryVlaAnalysis);
  }

  // ── Weather context (from first dashcam evidence with GPS coords) ──────────
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
  const consistencyChecks = runConsistencyChecks(inputs, liabilityInputs);

  // ── Review required determination ─────────────────────────────────────────
  const reviewReasons: string[] = [];

  if (physicsFlags?.overall === "fail") {
    reviewReasons.push("Physics sanity check failure");
  }
  if (consistencyChecks.some((c) => c.result === "inconsistent")) {
    reviewReasons.push("Inconsistent findings across evidence types");
  }
  const liabilitySpread =
    liabilityInputs.length >= 2
      ? Math.max(...liabilityInputs.map((l) => l.liability)) -
        Math.min(...liabilityInputs.map((l) => l.liability))
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
    finalLiability,
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
