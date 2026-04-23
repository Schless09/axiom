import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ModelResult, ModelProvider } from "@/lib/ai/consensus";

/**
 * Result of the meta-LLM scene coherence check.
 * Produced after all vision models run, before consensus is finalized.
 */
export type SceneCoherenceResult = {
  /** True when all models appear to describe the same physical scene. */
  coherent: boolean;
  /**
   * The model whose output looks like a hallucination or scene drift relative
   * to the other models. null when all models are coherent.
   */
  outlier_provider: ModelProvider | null;
  /** One-sentence explanation of why the outlier is flagged. */
  outlier_reason: string | null;
  /**
   * Human-readable list of discrepancies found (empty when coherent).
   * These feed into `factual_divergence_reasons` in the consensus.
   */
  reasons: string[];
  /**
   * Gemini's own brief description of what the majority of models agree
   * they saw. Useful for audit trails and adjuster notes.
   */
  scene_summary: string | null;
};

const SYSTEM_PROMPT = `You are a quality-control auditor for an AI-powered auto insurance claims analysis system.

Three independent AI vision models each analyzed the SAME dashcam video clip or image evidence and produced narrative descriptions and timeline events. Your single job is to determine whether all three models are observing the same physical scene, or whether one (or more) appears to be hallucinating details that differ from what the other two describe.

You are NOT re-adjudicating the claim. Do NOT comment on liability or fault. Focus only on whether the models agree on WHAT THEY SAW.

Evaluate these five dimensions:

1. SETTING — location type (highway, intersection, parking lot), weather, and lighting conditions
2. VEHICLE MOVEMENT — was the insured vehicle moving or stationary? At what approximate speed?
3. INCIDENT TYPE — did a collision, near-miss, or contact occur? Or was this routine driving with no incident?
4. KEY ACTORS — are the same actors present (other vehicles, pedestrians, cyclists)? Are they in the same positions?
5. CLIP SPAN — are described timelines plausible and roughly consistent (a 2-second clip vs a 40-second clip is a mismatch)?

An outlier means one model describes materially different actors, actions, or events from what the other two describe. Minor wording differences or confidence differences are NOT hallucinations.

Return ONLY a valid JSON object — no markdown fences, no explanation outside the JSON:

{
  "coherent": true | false,
  "outlier_provider": "gemini" | "openai" | "anthropic" | null,
  "outlier_reason": "<one sentence — what the outlier described differently>" | null,
  "reasons": ["<discrepancy 1>", "<discrepancy 2>"],
  "scene_summary": "<one sentence — what the majority of models agree they saw>"
}`;

/**
 * Build a compact text representation of one model's output for the grounding check.
 * Caps at 900 chars per model to keep the prompt economical.
 */
function summarizeModelOutput(result: ModelResult): string {
  const { provider, analysis } = result;
  const narratives = [analysis.case_file_narrative, analysis.narrative_summary]
    .filter(Boolean)
    .join(" ")
    .trim()
    .slice(0, 600);

  const timelineLines = analysis.timeline
    .slice(0, 8)
    .map((e) => {
      const span =
        e.evidence_span != null
          ? ` span=${e.evidence_span.start_seconds}-${e.evidence_span.end_seconds}s`
          : "";
      const fi = e.frame_index != null ? ` f=${e.frame_index}` : "";
      return `  t=${e.timestamp_seconds ?? "?"}s${fi}${span}: ${e.action}`;
    })
    .join("\n");

  const mf = analysis.material_facts;
  const factsLine = mf
    ? `Material facts: another_vehicle=${mf.another_vehicle_present}, conflict=${mf.conflict_or_contact}`
    : "";

  return [
    `=== ${provider.toUpperCase()} ===`,
    narratives,
    timelineLines ? `Timeline:\n${timelineLines}` : "",
    factsLine,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Run a Gemini Flash meta-review of the three model outputs to detect scene-level
 * hallucinations — cases where one model describes a completely different scenario
 * from what the other two observed in the same evidence file.
 *
 * Uses `gemini-2.0-flash` (text-only, sub-cent cost per call) so it adds minimal
 * latency and cost to the pipeline.
 *
 * Errors are swallowed so a coherence failure never blocks the primary analysis.
 */
export async function checkSceneCoherence(
  results: ModelResult[],
): Promise<SceneCoherenceResult> {
  const DEFAULT: SceneCoherenceResult = {
    coherent: true,
    outlier_provider: null,
    outlier_reason: null,
    reasons: [],
    scene_summary: null,
  };

  if (results.length < 2) return DEFAULT;

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 512,
      },
    });

    const modelBlock = results.map(summarizeModelOutput).join("\n\n");
    const userContent = `MODEL OUTPUTS TO REVIEW:\n\n${modelBlock}\n\nReturn the JSON object now.`;

    const response = await model.generateContent([
      { text: SYSTEM_PROMPT },
      { text: userContent },
    ]);

    const raw = response.response.text().trim();
    // Strip any accidental markdown fences
    const jsonText = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const parsed = JSON.parse(jsonText) as SceneCoherenceResult;

    // Validate the shape minimally before trusting it
    if (typeof parsed.coherent !== "boolean") {
      console.warn("[scene-coherence] unexpected response shape, skipping", parsed);
      return DEFAULT;
    }

    return parsed;
  } catch (err) {
    console.warn("[scene-coherence] check failed, skipping:", err);
    return DEFAULT;
  }
}
