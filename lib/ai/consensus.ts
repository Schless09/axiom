import type { VlaAnalysis, VlaTimelineEvent } from "@/lib/ai/vla-schemas";
import type { ModelUsage } from "@/lib/ai/pricing";
import { assessFactualDivergence } from "@/lib/ai/factual-divergence";
import { checkSceneCoherence } from "@/lib/ai/scene-coherence";

export type ModelProvider = "gemini" | "openai" | "anthropic";

export interface ModelResult {
  provider: ModelProvider;
  analysis: VlaAnalysis;
  rawText: string;
  usage: ModelUsage;
}

/** Summary stored alongside the merged analysis inside `vla_analysis_raw`. */
export interface ConsensusMetadata {
  providers: ModelProvider[];
  /**
   * Per-provider liability estimate — keys are provider names.
   * e.g. { gemini: 65, openai: 70, anthropic: 68 }
   */
  per_model: Record<string, number | null>;
  /**
   * Max spread (pp) across all providers that returned a liability estimate.
   * e.g. max(70,65,68) - min(70,65,68) = 5
   */
  liability_delta: number | null;
  /**
   * True when the spread across models exceeds 20 pp,
   * or when fewer than expected models returned results.
   */
  review_required: boolean;
  agreement_level: "strong" | "moderate" | "weak";
  /**
   * True when models disagree on material facts (structured fields or narrative heuristics).
   * Liability percent alone can still match while stories diverge — this captures that case.
   */
  factual_divergence: boolean;
  /** Short explanations for scorecard / audit (e.g. yes vs no on another_vehicle_present). */
  factual_divergence_reasons: string[];
  /**
   * Scene-level hallucination check: did one model describe a completely different
   * scene from the other two? Populated by the Gemini Flash meta-review step.
   */
  scene_coherence: {
    coherent: boolean;
    outlier_provider: string | null;
    outlier_reason: string | null;
    scene_summary: string | null;
  };
}

export interface ConsensusResult {
  /** Merged analysis that drives the UI and DB columns. */
  analysis: VlaAnalysis;
  consensus: ConsensusMetadata;
  /** Raw outputs keyed by provider — stored for audit/debugging. */
  raw_by_provider: Partial<Record<ModelProvider, VlaAnalysis>>;
  /** Per-model token usage and estimated cost for this run. */
  model_usage: ModelUsage[];
  /** Sum of estimated_cost_usd across all models. */
  total_cost_usd: number;
}

/** Max spread (pp) that triggers `review_required`. */
const REVIEW_THRESHOLD = 20;

const FACTUAL_DIVERGENCE_PREFIX =
  "Multiple vision models gave incompatible accounts of this evidence (for example, whether another vehicle or a conflict appears). " +
  "Treat the timeline and narrative below as provisional until a human adjuster reviews the source file.\n\n---\n\n";

/** Two events within this window (seconds) are treated as the same incident. Keep in sync with `TIMELINE_MATCH_WINDOW_S` in `factual-divergence.ts`. */
const TIMESTAMP_TOLERANCE_S = 2;

function classifyAgreement(delta: number): "strong" | "moderate" | "weak" {
  if (delta <= 10) return "strong";
  if (delta <= REVIEW_THRESHOLD) return "moderate";
  return "weak";
}

/**
 * Merge N model results into a single consensus.
 *
 * Priority order for narrative / timeline anchor: gemini > anthropic > openai.
 * Liability = average across all successful models.
 * Overall confidence is downgraded to "low" when models disagree sharply.
 *
 * Runs a Gemini Flash meta-review (scene coherence check) after the three models
 * return but before final scores are locked in. Any outlier detected there is
 * appended to `factual_divergence_reasons` and triggers `review_required`.
 */
export async function buildConsensus(results: ModelResult[]): Promise<ConsensusResult> {
  if (results.length === 0) {
    throw new Error("buildConsensus: no model results provided");
  }

  const model_usage = results.map((r) => r.usage);
  const total_cost_usd =
    Math.round(
      model_usage.reduce((sum, u) => sum + u.estimated_cost_usd, 0) * 1_000_000,
    ) / 1_000_000;

  const raw_by_provider: Partial<Record<ModelProvider, VlaAnalysis>> = {};
  for (const r of results) raw_by_provider[r.provider] = r.analysis;

  // Run scene coherence check concurrently with building per_model map.
  // Errors are swallowed inside checkSceneCoherence — never blocks the pipeline.
  const coherencePromise = checkSceneCoherence(results);

  // Build per_model liability map
  const per_model: Record<string, number | null> = {};
  for (const r of results) {
    per_model[r.provider] = r.analysis.recommended_liability_percent ?? null;
  }

  const liabilities = Object.values(per_model).filter((v): v is number => v != null);

  const consensusLiability =
    liabilities.length > 0
      ? Math.round(liabilities.reduce((a, b) => a + b, 0) / liabilities.length)
      : undefined;

  const delta =
    liabilities.length >= 2 ? Math.max(...liabilities) - Math.min(...liabilities) : null;

  const factual = assessFactualDivergence(
    results.map((r) => ({ provider: r.provider, analysis: r.analysis })),
  );

  // Await the coherence check that was kicked off earlier
  const coherence = await coherencePromise;

  // A scene-incoherent outlier is a form of factual divergence
  const coherenceDivergent = !coherence.coherent;
  const coherenceReasons: string[] = [];
  if (coherenceDivergent && coherence.outlier_provider) {
    const msg = `Scene coherence check flagged ${coherence.outlier_provider.toUpperCase()} as describing a different scene${coherence.outlier_reason ? ": " + coherence.outlier_reason : "."}`;
    coherenceReasons.push(msg);
  }

  const combinedDivergent = factual.divergent || coherenceDivergent;
  const combinedReasons = [...factual.reasons, ...coherenceReasons];

  const reviewRequired =
    (delta != null && delta > REVIEW_THRESHOLD) || combinedDivergent;

  // Single-model fast path — coherence check is meaningless with one model
  if (results.length === 1) {
    const r = results[0];
    return {
      analysis: r.analysis,
      consensus: {
        providers: [r.provider],
        per_model,
        liability_delta: null,
        review_required: false,
        agreement_level: "strong",
        factual_divergence: false,
        factual_divergence_reasons: [],
        scene_coherence: {
          coherent: true,
          outlier_provider: null,
          outlier_reason: null,
          scene_summary: null,
        },
      },
      raw_by_provider,
      model_usage,
      total_cost_usd,
    };
  }

  // Choose primary (best anchor for timeline / narratives) by priority
  const PRIORITY: ModelProvider[] = ["gemini", "anthropic", "openai"];
  const primary =
    PRIORITY.map((p) => results.find((r) => r.provider === p)).find(Boolean) ?? results[0];

  // Merge timelines: primary is the anchor, all others contribute
  const secondaryTimelines = results
    .filter((r) => r.provider !== primary.provider)
    .map((r) => r.analysis.timeline);

  const mergedTimeline = mergeTimelines(primary.analysis.timeline, secondaryTimelines);

  // Confidence: downgrade when models disagree sharply
  const confidences = results.map((r) => r.analysis.overall_confidence);
  let overallConfidence: VlaAnalysis["overall_confidence"] = reviewRequired
    ? "low"
    : confidences.every((c) => c === "high")
      ? "high"
      : confidences.some((c) => c === "low")
        ? "low"
        : "medium";

  if (combinedDivergent) {
    overallConfidence = "low";
  }

  let narrative_summary = primary.analysis.narrative_summary;
  let case_file_narrative = primary.analysis.case_file_narrative;
  if (combinedDivergent) {
    narrative_summary = narrative_summary
      ? FACTUAL_DIVERGENCE_PREFIX + narrative_summary
      : FACTUAL_DIVERGENCE_PREFIX.trim();
    case_file_narrative = case_file_narrative
      ? FACTUAL_DIVERGENCE_PREFIX + case_file_narrative
      : FACTUAL_DIVERGENCE_PREFIX.trim();
  }

  const consensusAnalysis: VlaAnalysis = {
    ...primary.analysis,
    timeline: mergedTimeline,
    recommended_liability_percent: consensusLiability,
    overall_confidence: overallConfidence,
    narrative_summary,
    case_file_narrative,
  };

  let agreement_level = delta != null ? classifyAgreement(delta) : "strong";
  if (combinedDivergent) {
    agreement_level = "weak";
  }

  return {
    analysis: consensusAnalysis,
    consensus: {
      providers: results.map((r) => r.provider),
      per_model,
      liability_delta: delta,
      review_required: reviewRequired,
      agreement_level,
      factual_divergence: combinedDivergent,
      factual_divergence_reasons: combinedReasons,
      scene_coherence: {
        coherent: coherence.coherent,
        outlier_provider: coherence.outlier_provider,
        outlier_reason: coherence.outlier_reason,
        scene_summary: coherence.scene_summary,
      },
    },
    raw_by_provider,
    model_usage,
    total_cost_usd,
  };
}

/**
 * Anchor on the primary timeline; for each event, find the closest matching
 * event from every other model (within TIMESTAMP_TOLERANCE_S) and average
 * the fault estimate + union the violation tags.
 */
function mergeTimelines(
  primary: VlaTimelineEvent[],
  secondaries: VlaTimelineEvent[][],
): VlaTimelineEvent[] {
  return primary.map((ev) => {
    const evTs = ev.timestamp_seconds ?? 0;
    let fault = ev.suggested_liability_percent;
    let matchCount = 1;
    const tags = new Set(ev.violation_tags ?? []);
    let frame_index = ev.frame_index;
    let evidence_span = ev.evidence_span;

    for (const secondary of secondaries) {
      const match = secondary.reduce<VlaTimelineEvent | null>((best, s) => {
        const dist = Math.abs((s.timestamp_seconds ?? 0) - evTs);
        if (dist > TIMESTAMP_TOLERANCE_S) return best;
        if (!best) return s;
        return dist < Math.abs((best.timestamp_seconds ?? 0) - evTs) ? s : best;
      }, null);

      if (match) {
        fault += match.suggested_liability_percent;
        matchCount++;
        for (const tag of match.violation_tags ?? []) tags.add(tag);
        if (frame_index == null && match.frame_index != null) frame_index = match.frame_index;
        if (evidence_span == null && match.evidence_span != null) evidence_span = match.evidence_span;
      }
    }

    return {
      ...ev,
      ...(frame_index != null ? { frame_index } : {}),
      ...(evidence_span != null ? { evidence_span } : {}),
      suggested_liability_percent: Math.round(fault / matchCount),
      violation_tags: [...tags],
    };
  });
}
