import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import { parseVlaJson, type VlaAnalysis } from "@/lib/ai/vla-schemas";
import { buildModelUsage, type ModelUsage } from "@/lib/ai/pricing";

export type DashcamPerspective = "insured" | "witness" | "adverse";

/**
 * Bump this string whenever USER_PROMPT or buildSystemInstruction changes in a
 * meaningful way. Stored in evidence_analysis rows so you can diff model
 * behavior across prompt versions in regression testing.
 */
export const PROMPT_VERSION = "v5";

const PERSPECTIVE_INSTRUCTIONS: Record<"insured" | "witness" | "adverse", string> = {
  insured:
    "PERSPECTIVE — always fixed: The vehicle whose dashcam recorded this footage IS the insured vehicle. " +
    "Every liability percentage in your output refers exclusively to fault attributable to the INSURED VEHICLE. " +
    "A score of 0 means the insured bears no fault; 100 means the insured bears full fault. " +
    "Never flip this — even if a third party caused the incident, score the insured's own conduct.",

  witness:
    "PERSPECTIVE — always fixed: The dashcam belongs to a WITNESS or BYSTANDER vehicle that is NOT a party to this claim. " +
    "The insured vehicle is one of the vehicles visible in the footage. " +
    "Identify which vehicle appears to be the claimant's vehicle based on the incident context (e.g. the vehicle that was struck, or the vehicle whose actions are being disputed). " +
    "Every liability percentage refers exclusively to fault attributable to that INSURED VEHICLE. " +
    "State your identification of the insured vehicle explicitly in your first adjuster_observation. " +
    "A score of 0 means the insured bears no fault; 100 means the insured bears full fault.",

  adverse:
    "PERSPECTIVE — always fixed: The dashcam belongs to the ADVERSE PARTY (the opposing driver in this claim), not the insured. " +
    "The insured vehicle is the OTHER vehicle visible in the footage — not the one whose camera recorded this. " +
    "Every liability percentage refers exclusively to fault attributable to the INSURED VEHICLE (the non-recording vehicle). " +
    "A score of 0 means the insured bears no fault; 100 means the insured bears full fault. " +
    "Note that the adverse party's camera angle may favor their own perspective — account for this bias in your analysis.",
};

/** Returns the full system instruction tailored to the dashcam perspective for this claim. */
export function buildSystemInstruction(perspective: "insured" | "witness" | "adverse" = "insured"): string {
  return `You are a senior multi-line liability adjuster and accident reconstructionist with 20+ years writing file-ready notes for carriers and TPAs. You review dashcam or photo evidence the way a lead adjuster would before a supervisor or counsel: clear, factual, past tense, no hype, no mention of "AI," "model," or "algorithm."

${PERSPECTIVE_INSTRUCTIONS[perspective]}

Your job is to (1) note what the evidence shows at specific times, (2) estimate the insured vehicle's comparative fault, and (3) write prose that could be pasted into a claim file without editing.

When you receive multiple sequential images, treat them as frames extracted chronologically from the dashcam recording — not as separate unrelated photographs. Reason about motion, trajectories, and timing across the full frame sequence before forming conclusions.

Do not invent or quote statute text, code sections, or legal citations—describe behavior in plain English (e.g. "crossed a solid line," "failed to clear the intersection"). Downstream systems attach official statutes separately.

Output: one JSON object only—no markdown fences, no commentary outside the JSON.`;
}

/** @deprecated Use buildSystemInstruction() with explicit perspective instead. */
export const SYSTEM_INSTRUCTION = buildSystemInstruction("insured");

/** Shared preamble when all providers analyze the same extracted JPEG sequence (video → frames). */
export function buildSequentialFramePreamble(frameCount: number): string {
  return (
    `You are analyzing ${frameCount} sequential frames extracted chronologically from a dashcam video recording. ` +
    `Frame 1 is earliest, frame ${frameCount} is latest. Treat this as one continuous clip — reason about motion and timing across ALL frames before concluding. ` +
    `Do not invent vehicles, collisions, or maneuvers that never appear in any frame. If the clip is ambiguous, say so with "uncertain" in material_facts and lower per-event confidence.\n\n`
  );
}

export const USER_PROMPT = `Analyze the attached evidence and respond with a single JSON object (no markdown) exactly in this shape:
{
  "material_facts": {
    "another_vehicle_present": "yes" | "no" | "uncertain",
    "conflict_or_contact": "yes" | "no" | "uncertain"
  },
  "timeline": [
    {
      "timestamp_seconds": number,
      "frame_index": number,
      "evidence_span": { "start_seconds": number, "end_seconds": number },
      "action": string,
      "suggested_liability_percent": number,
      "adjuster_observation": string,
      "violation_tags": [string],
      "confidence": "high" | "medium" | "low"
    }
  ],
  "recommended_liability_percent": number,
  "narrative_summary": string,
  "case_file_narrative": string,
  "overall_confidence": "high" | "medium" | "low"
}

Field rules:
- material_facts: answer from the evidence only. "another_vehicle_present" = yes if another moving road user’s vehicle is clearly visible such that it could interact with the insured in this clip (not merely distant parked cars). "conflict_or_contact" = yes if you see contact, a collision, a clearly imminent crash, or the insured braking/steering hard because another road user has entered their path. If lighting, angle, or frame gaps prevent a firm answer, use "uncertain" for that field — never guess "no" when you cannot see the relevant moment.
- timeline: chronological order. "action" = short neutral label describing what occurred (e.g. "insured follows too close", "third-party lane change"). Always identify which vehicle is acting — insured or third party.
- timestamp_seconds: approximate time in the source recording (seconds from clip start) for the key moment of this event — align with evidence_span when both are present.
- frame_index: REQUIRED when you received multiple sequential frames from a video. Integer ≥1 where Frame 1 is the earliest image shown; pick the single frame that best shows this event. Omit the key entirely for a single still photograph (not a frame sequence).
- evidence_span: REQUIRED when analyzing video. {start_seconds, end_seconds} = wall-clock interval in the source clip where this event is visible or inferable (end_seconds may equal start_seconds; end_seconds must be ≥ start_seconds). Omit the key entirely for a single still photograph.
- suggested_liability_percent (per event): 0–100 fault attributable TO THE INSURED VEHICLE at that moment. Use 0 unless the insured committed a specific, observable traffic violation or driving error at that moment. Do NOT assign partial fault based on "could have reacted sooner," "might have been going slightly fast," or other hypothetical alternatives — only score what you can directly observe. If a third party commits a violation that does not implicate the insured, score 0.
- adjuster_observation: 1–3 sentences, professional file-note tone. Explicitly name which vehicle is acting and what it did. Note uncertainty if lighting/angle limits certainty.
- violation_tags: tags for violations committed BY THE INSURED VEHICLE only — not third parties. Use only: ["speeding", "lane_change", "failure_to_yield", "improper_turn", "following_too_close", "running_red_light", "running_stop_sign", "distracted_driving", "reckless_driving"]. Empty array if the insured committed no violation in this event.
- confidence (per event): confidence in the observation given footage quality — "high" (clearly visible), "medium" (probable but partially obscured), "low" (inferred or limited visibility).
- recommended_liability_percent: single overall fault estimate for the INSURED VEHICLE across the entire incident. Base this only on violations or errors the insured actually committed — not on theoretical alternatives. If the insured obeyed traffic controls, stayed in their lane, and reacted reasonably, the score is 0 regardless of whether an incident occurred nearby.
- narrative_summary: one or two sentences for an executive skim. State clearly whether the insured is at fault and why.
- case_file_narrative: 2–5 short paragraphs. Open with road/weather context, describe the sequence of events naming each vehicle's role, conclude with liability determination for the insured and any reserve considerations. Do not cite statute numbers.
- overall_confidence: "high", "medium", or "low" across the full analysis. Use "low" if footage is obstructed, very short, or the incident is ambiguous.

CALIBRATION — score 0 for the insured in these situations (not an exhaustive list):
• Insured is stopped at a red light or stop sign and another vehicle moves
• Insured is traveling straight in their lane when a third party changes lanes into them
• Insured reacts to an emergency created entirely by a third party
• No collision or near-miss occurs involving the insured in the footage
• The only visible event is normal, lawful driving by the insured`;

/**
 * Ordered list of Gemini models to try. The first model is preferred;
 * subsequent models are fallbacks used when the primary errors.
 * Override the primary with GEMINI_MODEL env var.
 *
 * Confirmed available as of Apr 2026 (v1beta generateContent):
 *   gemini-2.5-flash      — primary, best quality, gets 503 under load
 *   gemini-2.5-flash-lite — cheapest/fastest in the 2.5 family, good fallback
 *
 * Shut down (404):  gemini-1.5-flash, gemini-1.5-pro
 * Deprecated (deprecating Jun 2026): gemini-2.0-flash, gemini-2.0-flash-lite
 */
function getModelFallbacks(): string[] {
  const primary = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const fallbacks = ["gemini-2.5-flash-lite"];
  return [primary, ...fallbacks.filter((m) => m !== primary)];
}

/** HTTP status codes that are safe to retry (transient server-side issues). */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function isRetryable(e: unknown): boolean {
  if (e instanceof Error) {
    const status = (e as unknown as { status?: number }).status;
    if (status != null && RETRYABLE_STATUSES.has(status)) return true;
    // Catch "503 Service Unavailable" embedded in message strings
    if (/\b(429|500|502|503|504)\b/.test(e.message)) return true;
  }
  return false;
}

/**
 * Retry `fn` up to `maxAttempts` times on transient errors,
 * with exponential back-off starting at `baseDelayMs`.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 2000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (!isRetryable(e) || attempt === maxAttempts) throw e;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      console.warn(`[vla-engine] Gemini transient error (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

async function waitForFileActive(
  fileManager: GoogleAIFileManager,
  fileName: string,
  maxAttempts = 60,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const meta = await fileManager.getFile(fileName);
    if (meta.state === FileState.ACTIVE) return;
    if (meta.state === FileState.FAILED) {
      throw new Error("Gemini file processing failed");
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Timed out waiting for Gemini file to be ready");
}

type ContentPart =
  | { text: string }
  | { fileData: { mimeType: string; fileUri: string } }
  | { inlineData: { mimeType: string; data: string } };

/**
 * Multimodal analysis: uploads video to Gemini File API when needed, or sends image inline.
 * For long videos, Gemini processes the file server-side (no local ffmpeg in this MVP).
 * To sample frames locally and reduce tokens, add ffmpeg + image parts in a follow-up.
 */
export async function analyzeEvidenceWithGemini(
  fileBuffer: Buffer,
  mimeType: string,
  perspective: DashcamPerspective = "insured",
): Promise<{ analysis: VlaAnalysis; rawText: string; usage: ModelUsage }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const models = getModelFallbacks();
  let lastError: unknown;

  for (const modelName of models) {
    try {
      if (modelName !== models[0]) {
        console.warn(`[vla-engine] Falling back to ${modelName} after primary model failed`);
      }
      return await analyzeEvidenceWithGeminiInner(fileBuffer, mimeType, apiKey, modelName, perspective);
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      const isHttpError = /\b(4\d\d|5\d\d)\b/.test(msg);
      const isAuthError = /\b(401|403)\b/.test(msg);
      console.error("[vla-engine] analyzeEvidenceWithGemini failed", {
        model: modelName, mimeType, message: msg,
      });
      // Auth/permission errors are unrecoverable — no point trying another model
      if (isAuthError || !isHttpError) break;
    }
  }

  throw lastError;
}

async function analyzeEvidenceWithGeminiInner(
  fileBuffer: Buffer,
  mimeType: string,
  apiKey: string,
  modelName: string,
  perspective: DashcamPerspective = "insured",
): Promise<{ analysis: VlaAnalysis; rawText: string; usage: ModelUsage }> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: buildSystemInstruction(perspective),
  });

  let parts: ContentPart[];

  if (mimeType.startsWith("video/")) {
    const fileManager = new GoogleAIFileManager(apiKey);
    const upload = await fileManager.uploadFile(fileBuffer, {
      mimeType,
      displayName: "claim-evidence",
    });
    await waitForFileActive(fileManager, upload.file.name);
    const resolvedMime = upload.file.mimeType ?? mimeType;
    const uploadedName = upload.file.name;

    try {
      parts = [
        { text: USER_PROMPT },
        { fileData: { mimeType: resolvedMime, fileUri: upload.file.uri } },
      ];
      // Retry generateContent on transient 503/429 — file is already uploaded so retries are cheap.
      // Gemini 503s from demand spikes can last 15-30s; use 5 attempts with 5s base delay
      // (gives waits of 5s, 10s, 20s, 40s — ~75s total before giving up).
      const result = await withRetry(
        () => model.generateContent({ contents: [{ role: "user", parts }] }),
        5,
        5000,
      );
      const rawText = result.response.text();
      const meta = result.response.usageMetadata;
      const usage = buildModelUsage({
        provider: "gemini",
        model: modelName,
        inputTokens: meta?.promptTokenCount ?? 0,
        outputTokens: meta?.candidatesTokenCount ?? 0,
      });
      const analysis = parseVlaJson(rawText);
      return { analysis, rawText, usage };
    } finally {
      // Always clean up the uploaded file — success or failure
      fileManager.deleteFile(uploadedName).catch(() => {});
    }
  }

  parts = [
    { text: USER_PROMPT },
    { inlineData: { mimeType, data: fileBuffer.toString("base64") } },
  ];
  const result = await withRetry(() =>
    model.generateContent({ contents: [{ role: "user", parts }] }),
  );
  const rawText = result.response.text();
  const meta = result.response.usageMetadata;
  const usage = buildModelUsage({
    provider: "gemini",
    model: modelName,
    inputTokens: meta?.promptTokenCount ?? 0,
    outputTokens: meta?.candidatesTokenCount ?? 0,
  });
  const analysis = parseVlaJson(rawText);
  return { analysis, rawText, usage };
}

/**
 * Analyze video evidence using the same JPEG frame bundle as OpenAI / Anthropic so all
 * providers see identical pixels (avoids full-video Gemini vs frame-sampled peers drifting apart).
 */
export async function analyzeEvidenceWithGeminiFromFrames(
  frames: Buffer[],
  perspective: DashcamPerspective = "insured",
): Promise<{ analysis: VlaAnalysis; rawText: string; usage: ModelUsage }> {
  if (frames.length === 0) {
    throw new Error("analyzeEvidenceWithGeminiFromFrames: no frames");
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const models = getModelFallbacks();
  let lastError: unknown;
  const textHead = buildSequentialFramePreamble(frames.length) + USER_PROMPT;
  const imageParts: ContentPart[] = frames.map((f) => ({
    inlineData: { mimeType: "image/jpeg", data: f.toString("base64") },
  }));

  for (const modelName of models) {
    try {
      if (modelName !== models[0]) {
        console.warn(`[vla-engine] Gemini frames: falling back to ${modelName}`);
      }
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: buildSystemInstruction(perspective),
      });
      const parts: ContentPart[] = [{ text: textHead }, ...imageParts];
      const result = await withRetry(() =>
        model.generateContent({ contents: [{ role: "user", parts }] }),
      );
      const rawText = result.response.text();
      const meta = result.response.usageMetadata;
      const usage = buildModelUsage({
        provider: "gemini",
        model: modelName,
        inputTokens: meta?.promptTokenCount ?? 0,
        outputTokens: meta?.candidatesTokenCount ?? 0,
      });
      const analysis = parseVlaJson(rawText);
      return { analysis, rawText, usage };
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      const isHttpError = /\b(4\d\d|5\d\d)\b/.test(msg);
      const isAuthError = /\b(401|403)\b/.test(msg);
      console.error("[vla-engine] analyzeEvidenceWithGeminiFromFrames failed", {
        model: modelName,
        message: msg,
      });
      if (isAuthError || !isHttpError) break;
    }
  }

  throw lastError;
}
