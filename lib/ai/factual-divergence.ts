import type { VlaAnalysis } from "@/lib/ai/vla-schemas";

type ModelProvider = "gemini" | "openai" | "anthropic";

export type FactualDivergenceAssessment = {
  divergent: boolean;
  reasons: string[];
};

const MATERIAL_FIELDS = ["another_vehicle_present", "conflict_or_contact"] as const;

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

function materialFactsConflict(
  entries: Partial<Record<ModelProvider, NonNullable<VlaAnalysis["material_facts"]>>>,
): { divergent: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const field of MATERIAL_FIELDS) {
    const values = new Set<string>();
    for (const mf of Object.values(entries)) {
      if (!mf) continue;
      const v = mf[field];
      if (v === "yes" || v === "no") values.add(v);
    }
    if (values.has("yes") && values.has("no")) {
      reasons.push(`models split on material_facts.${field} (yes vs no)`);
    }
  }
  return { divergent: reasons.length > 0, reasons };
}

/**
 * Detect whether successful model runs describe materially incompatible versions of the evidence.
 * Uses structured `material_facts` when present; falls back to narrative/timeline phrase heuristics.
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
    const { divergent, reasons } = materialFactsConflict(withFacts);
    if (divergent) return { divergent, reasons };
  }

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
