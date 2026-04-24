import type { VlaAnalysis } from "@/lib/ai/vla-schemas";

type ModelProvider = "gemini" | "openai" | "anthropic";

export type FactualDivergenceAssessment = {
  divergent: boolean;
  reasons: string[];
};

/** All material_facts fields that should agree across models. */
const MATERIAL_FIELDS = [
  "another_vehicle_present",
  "conflict_or_contact",
  "vehicle_motion",
  "insured_identifiable",
  "turn_restriction",
] as const;

/** Must stay in sync with `TIMESTAMP_TOLERANCE_S` in `consensus.ts` (merge / match window). */
const TIMELINE_MATCH_WINDOW_S = 2;

/** Default primary for timeline alignment (matches insured-perspective consensus). */
const PRIMARY_ORDER_INSURED: ModelProvider[] = ["gemini", "anthropic", "openai"];
/** Witness POV: prefer Claude-first ordering (matches `buildConsensus` witness priority). */
const PRIMARY_ORDER_WITNESS: ModelProvider[] = ["anthropic", "gemini", "openai"];

function primaryOrderForPerspective(
  perspective: "insured" | "witness" | "adverse" | undefined,
): ModelProvider[] {
  return perspective === "witness" ? PRIMARY_ORDER_WITNESS : PRIMARY_ORDER_INSURED;
}

/**
 * Strict mismatch on any material_facts field (including new structured fields).
 * Any disagreement across yes / no / uncertain / stationary / moving / prohibited / permitted etc.
 * surfaces as a divergence reason — comparison is deterministic field equality, no regex.
 * Fields whose value is null/undefined for ALL models are skipped (not applicable to the clip).
 */
function materialFactsStrictMismatch(
  entries: Partial<Record<ModelProvider, NonNullable<VlaAnalysis["material_facts"]>>>,
): { divergent: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const field of MATERIAL_FIELDS) {
    const values: string[] = [];
    for (const mf of Object.values(entries)) {
      if (!mf) continue;
      const v = mf[field as keyof typeof mf];
      if (v != null) values.push(String(v));
    }
    if (values.length < 2) continue;
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
 * If the primary timeline's events don't line up in time with another model's timeline,
 * the models are likely narrating different interpretations of the same clip (even when
 * liability scores agree at 0 %).
 */
function assessTimelineMisalignment(
  runs: { provider: ModelProvider; analysis: VlaAnalysis }[],
  perspective: "insured" | "witness" | "adverse" | undefined,
): { divergent: boolean; reasons: string[] } {
  if (runs.length < 2) return { divergent: false, reasons: [] };

  const order = primaryOrderForPerspective(perspective);
  const primary = order.map((p) => runs.find((r) => r.provider === p)).find(Boolean) ?? runs[0];
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
      const hasNear = st.some(
        (s) => Math.abs((s.timestamp_seconds ?? 0) - ts) <= TIMELINE_MATCH_WINDOW_S,
      );
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

export type AssessFactualDivergenceOptions = {
  perspective?: "insured" | "witness" | "adverse";
};

/**
 * Detect whether model runs describe materially incompatible versions of the evidence.
 *
 * All checks accumulate reasons so the review queue shows every split (e.g. motion mismatch
 * AND sign contradiction in the same run), not only the first hit.
 *
 * Disagreement detection is entirely deterministic structured-field comparison + timestamp math.
 * No regex or prose parsing — new failure modes are handled by adding fields to material_facts.
 */
export function assessFactualDivergence(
  runs: { provider: ModelProvider; analysis: VlaAnalysis }[],
  options: AssessFactualDivergenceOptions = {},
): FactualDivergenceAssessment {
  if (runs.length < 2) {
    return { divergent: false, reasons: [] };
  }

  const reasons: string[] = [];

  const withFacts = Object.fromEntries(
    runs
      .filter((r) => r.analysis.material_facts != null)
      .map((r) => [r.provider, r.analysis.material_facts!] as const),
  ) as Partial<Record<ModelProvider, NonNullable<VlaAnalysis["material_facts"]>>>;

  if (Object.keys(withFacts).length >= 2) {
    reasons.push(...materialFactsStrictMismatch(withFacts).reasons);
  }

  reasons.push(...assessTimelineMisalignment(runs, options.perspective).reasons);

  return { divergent: reasons.length > 0, reasons };
}
