import type { VlaAnalysis } from "@/lib/ai/vla-schemas";

type ModelProvider = "gemini" | "openai" | "anthropic";

export type FactualDivergenceAssessment = {
  divergent: boolean;
  reasons: string[];
};

const MATERIAL_FIELDS = ["another_vehicle_present", "conflict_or_contact"] as const;

/** Must stay in sync with `TIMESTAMP_TOLERANCE_S` in `consensus.ts` (merge / match window). */
const TIMELINE_MATCH_WINDOW_S = 2;

/** Same primary preference as `buildConsensus` — anchor timeline comparison on this model when present. */
const PRIMARY_ORDER: ModelProvider[] = ["gemini", "anthropic", "openai"];

function analysisTextBlob(a: VlaAnalysis): string {
  return [
    a.narrative_summary,
    a.case_file_narrative,
    ...a.timeline.map((t) => `${t.action} ${t.adjuster_observation ?? ""}`),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Coarse signal when `material_facts` is missing — catches “crash vs nothing happened” splits. */
function narrativeIncidentSignal(text: string): "conflict" | "none_reported" | "unclear" {
  const conflictHit =
    /\b(third[- ]party|opposing (vehicle|traffic)|oncoming vehicle|left turn|turned (left|into)|collision|struck\b|near[- ]miss|obstruct(ed)?\s+(the\s+)?(path|lane)|into (the\s+)?insured|cross(ed)?\s+into)\b/i.test(
      text,
    );
  const noneHit =
    /\b(no (other|third)[- ]party|no collision|no near[- ]miss|no other vehicles?|without incident|cleared the (crossing|intersection)|routine travel|not involved in any incident|no third-party)\b/i.test(
      text,
    );
  if (conflictHit && noneHit) return "unclear";
  if (conflictHit) return "conflict";
  if (noneHit) return "none_reported";
  return "unclear";
}

/**
 * Any mismatch on yes / no / uncertain across models is material — e.g. two models say
 * "no contact" while a third says "uncertain" must surface as divergence (previously
 * only yes-vs-no was detected and "uncertain" was ignored).
 */
function materialFactsStrictMismatch(
  entries: Partial<Record<ModelProvider, NonNullable<VlaAnalysis["material_facts"]>>>,
): { divergent: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const field of MATERIAL_FIELDS) {
    const values: string[] = [];
    for (const mf of Object.values(entries)) {
      if (!mf) continue;
      const v = mf[field];
      if (v === "yes" || v === "no" || v === "uncertain") values.push(v);
    }
    const unique = new Set(values);
    if (unique.size > 1) {
      reasons.push(
        `models disagree on material_facts.${field} (${[...unique].sort().join(", ")})`,
      );
    }
  }
  return { divergent: reasons.length > 0, reasons };
}

/**
 * If the primary timeline’s events don’t line up in time with another model’s timeline,
 * the models are likely narrating different interpretations of the same clip (even when
 * liability scores agree at 0 %).
 */
function assessTimelineMisalignment(
  runs: { provider: ModelProvider; analysis: VlaAnalysis }[],
): { divergent: boolean; reasons: string[] } {
  if (runs.length < 2) return { divergent: false, reasons: [] };

  const primary =
    PRIMARY_ORDER.map((p) => runs.find((r) => r.provider === p)).find(Boolean) ?? runs[0];
  const primaryTl = primary.analysis.timeline ?? [];
  if (primaryTl.length === 0) return { divergent: false, reasons: [] };

  const reasons: string[] = [];
  const secondaries = runs.filter((r) => r.provider !== primary.provider);

  for (const sec of secondaries) {
    const st = sec.analysis.timeline ?? [];
    if (st.length === 0) continue;

    let matched = 0;
    for (const ev of primaryTl) {
      const ts = ev.timestamp_seconds ?? 0;
      const hasNear = st.some((s) => Math.abs((s.timestamp_seconds ?? 0) - ts) <= TIMELINE_MATCH_WINDOW_S);
      if (hasNear) matched++;
    }
    const rate = matched / primaryTl.length;
    if (rate < 0.5) {
      reasons.push(
        `${primary.provider} timeline does not align with ${sec.provider} ` +
          `(${matched}/${primaryTl.length} events matched within ${TIMELINE_MATCH_WINDOW_S}s)`,
      );
    }
  }

  return { divergent: reasons.length > 0, reasons };
}

/**
 * Detect whether successful model runs describe materially incompatible versions of the evidence.
 * Order: strict `material_facts` agreement (including `uncertain` vs yes/no), structural timeline
 * alignment vs the primary model, then narrative phrase heuristics.
 */
export function assessFactualDivergence(
  runs: { provider: ModelProvider; analysis: VlaAnalysis }[],
): FactualDivergenceAssessment {
  if (runs.length < 2) {
    return { divergent: false, reasons: [] };
  }

  const withFacts = Object.fromEntries(
    runs
      .filter((r) => r.analysis.material_facts != null)
      .map((r) => [r.provider, r.analysis.material_facts!] as const),
  ) as Partial<Record<ModelProvider, NonNullable<VlaAnalysis["material_facts"]>>>;

  if (Object.keys(withFacts).length >= 2) {
    const { divergent, reasons } = materialFactsStrictMismatch(withFacts);
    if (divergent) return { divergent, reasons };
  }

  const timelineCheck = assessTimelineMisalignment(runs);
  if (timelineCheck.divergent) return timelineCheck;

  const signals = runs.map((r) => ({
    provider: r.provider,
    signal: narrativeIncidentSignal(analysisTextBlob(r.analysis)),
  }));

  const hasConflict = signals.some((s) => s.signal === "conflict");
  const hasNone = signals.some((s) => s.signal === "none_reported");
  if (hasConflict && hasNone) {
    return {
      divergent: true,
      reasons: [
        "models diverged on whether another vehicle / conflict is visible (narrative heuristic — confirm on source video)",
      ],
    };
  }

  return { divergent: false, reasons: [] };
}
