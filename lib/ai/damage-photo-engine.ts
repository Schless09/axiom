/**
 * Damage photo analysis engine.
 *
 * Runs vision analysis (Gemini + GPT-4o + Claude in parallel) on still
 * photographs of vehicle damage with a specialized prompt focused on:
 *   - Damage location and severity
 *   - Primary impact point
 *   - Structural damage / airbag deployment
 *   - Consistency with the described collision mechanism
 *
 * Uses the same multi-model parallel approach as the VLA engine but with a
 * damage-specific schema rather than a timeline.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { parseDamagePhotoJson, type DamagePhotoAnalysis } from "@/lib/ai/vla-schemas";
import { buildModelUsage, type ModelUsage } from "@/lib/ai/pricing";

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelayMs = 2000): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const status = (e as { status?: number }).status;
      if (status == null || !RETRYABLE_STATUSES.has(status) || attempt === maxAttempts) throw e;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      console.warn(`[damage-photo-engine] transient error (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

const SYSTEM_PROMPT = `You are a senior vehicle damage appraiser and insurance adjuster with 20+ years of experience evaluating collision and physical damage claims.

Analyze the provided photograph(s) of vehicle damage and produce a structured assessment. Base your findings only on what is directly visible — do not speculate beyond what the image shows.

Output a single JSON object (no markdown fences):
{
  "vehicle_identified": true | false,
  "damage_areas": [
    {
      "location": "<specific location: front bumper, driver door, rear quarter panel, etc.>",
      "severity": "minor" | "moderate" | "severe" | "total_loss",
      "description": "<1–2 sentences describing the visible damage>"
    }
  ],
  "primary_impact_point": "<most heavily damaged area or null if unclear>",
  "estimated_severity": "minor" | "moderate" | "severe" | "total_loss",
  "consistent_with_described_mechanism": "yes" | "no" | "uncertain",
  "airbag_deployment_visible": true | false | null,
  "structural_damage": true | false | null,
  "adjuster_note": "<2–4 sentences in professional adjuster voice describing damage findings, location, and any reserve or total-loss considerations>",
  "confidence": "high" | "medium" | "low"
}

Severity definitions:
- minor: cosmetic only (scratches, scuffs, minor dents) — repair < $2,500
- moderate: significant body damage, panel replacement likely — $2,500–$10,000
- severe: airbag deployment, frame damage likely — $10,000–total loss threshold
- total_loss: vehicle likely exceeds threshold (typically 70–80% ACV)

consistent_with_described_mechanism: use "uncertain" unless the image clearly confirms or contradicts the stated mechanism.`;

/** Gemini damage photo analysis (single image, inline). */
async function analyzeDamageWithGemini(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<{ analysis: DamagePhotoAnalysis; rawText: string; usage: ModelUsage }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const modelName = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: SYSTEM_PROMPT });

  const result = await withRetry(() =>
    model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: "Analyze this vehicle damage photograph and produce the structured JSON assessment." },
            { inlineData: { mimeType, data: imageBuffer.toString("base64") } },
          ],
        },
      ],
    }),
  );

  const rawText = result.response.text();
  const meta = result.response.usageMetadata;
  const usage = buildModelUsage({
    provider: "gemini",
    model: modelName,
    inputTokens: meta?.promptTokenCount ?? 0,
    outputTokens: meta?.candidatesTokenCount ?? 0,
  });

  return { analysis: parseDamagePhotoJson(rawText), rawText, usage };
}

/** GPT-4o damage photo analysis. */
async function analyzeDamageWithOpenAI(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<{ analysis: DamagePhotoAnalysis; rawText: string; usage: ModelUsage }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const model = process.env.OPENAI_MODEL ?? "gpt-4o";
  const openai = new OpenAI({ apiKey });

  const response = await withRetry(() =>
    openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this vehicle damage photograph and produce the structured JSON assessment." },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBuffer.toString("base64")}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1024,
    }),
  );

  const rawText = response.choices[0]?.message?.content ?? "";
  const usage = buildModelUsage({
    provider: "openai",
    model,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  });

  return { analysis: parseDamagePhotoJson(rawText), rawText, usage };
}

/** Claude damage photo analysis. */
async function analyzeDamageWithAnthropic(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<{ analysis: DamagePhotoAnalysis; rawText: string; usage: ModelUsage }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250929";
  const anthropic = new Anthropic({ apiKey });

  type ClaudeImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  const mediaType: ClaudeImageMediaType =
    mimeType === "image/png" ? "image/png"
    : mimeType === "image/gif" ? "image/gif"
    : mimeType === "image/webp" ? "image/webp"
    : "image/jpeg";

  const response = await withRetry(() =>
    anthropic.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this vehicle damage photograph and produce the structured JSON assessment." },
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBuffer.toString("base64") } },
          ],
        },
      ],
    }),
  );

  const rawText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const usage = buildModelUsage({
    provider: "anthropic",
    model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });

  return { analysis: parseDamagePhotoJson(rawText), rawText, usage };
}

/**
 * Merge multiple damage analyses (from different models) into a single result.
 * Takes the median severity, union of damage areas, and the primary model's adjuster note.
 */
function mergeDamageAnalyses(
  results: Array<{ analysis: DamagePhotoAnalysis; provider: string }>,
): DamagePhotoAnalysis {
  if (results.length === 1) return results[0].analysis;

  const SEVERITY_ORDER = ["minor", "moderate", "severe", "total_loss"] as const;
  type Severity = typeof SEVERITY_ORDER[number];

  const severities = results
    .map((r) => r.analysis.estimated_severity)
    .filter((s): s is Severity => s != null);

  const medianSeverity =
    severities.length > 0
      ? SEVERITY_ORDER[
          Math.round(
            severities.map((s) => SEVERITY_ORDER.indexOf(s)).reduce((a, b) => a + b, 0) /
              severities.length,
          )
        ]
      : undefined;

  // Union damage areas from all models
  const allAreas = results.flatMap((r) => r.analysis.damage_areas);

  // Primary = Gemini > Anthropic > OpenAI
  const primary =
    results.find((r) => r.provider === "gemini") ??
    results.find((r) => r.provider === "anthropic") ??
    results[0];

  const confidences = results.map((r) => r.analysis.confidence);
  const confidence =
    confidences.every((c) => c === "high")
      ? "high"
      : confidences.some((c) => c === "low")
        ? "low"
        : "medium";

  return {
    ...primary.analysis,
    damage_areas: allAreas,
    estimated_severity: medianSeverity,
    confidence,
  };
}

export type DamageAnalysisResult = {
  analysis: DamagePhotoAnalysis;
  provider: string;
  rawText: string;
  usage: ModelUsage;
};

/**
 * Main entry point: analyze a damage photo with all configured vision providers.
 * Returns the merged consensus analysis plus per-provider results.
 */
export async function analyzeDamagePhoto(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<{
  analysis: DamagePhotoAnalysis;
  perProvider: DamageAnalysisResult[];
  totalCostUsd: number;
}> {
  const [geminiSettled, openaiSettled, anthropicSettled] = await Promise.allSettled([
    process.env.GEMINI_API_KEY
      ? analyzeDamageWithGemini(imageBuffer, mimeType).then((r) => ({ ...r, provider: "gemini" }))
      : Promise.reject(new Error("GEMINI_API_KEY not set")),
    process.env.OPENAI_API_KEY
      ? analyzeDamageWithOpenAI(imageBuffer, mimeType).then((r) => ({ ...r, provider: "openai" }))
      : Promise.reject(new Error("OPENAI_API_KEY not set")),
    process.env.ANTHROPIC_API_KEY
      ? analyzeDamageWithAnthropic(imageBuffer, mimeType).then((r) => ({ ...r, provider: "anthropic" }))
      : Promise.reject(new Error("ANTHROPIC_API_KEY not set")),
  ]);

  const perProvider: DamageAnalysisResult[] = [];

  for (const settled of [geminiSettled, openaiSettled, anthropicSettled]) {
    if (settled.status === "fulfilled") {
      perProvider.push(settled.value);
    } else {
      console.warn("[damage-photo-engine] provider failed:", settled.reason instanceof Error ? settled.reason.message : settled.reason);
    }
  }

  if (perProvider.length === 0) {
    throw new Error("All damage photo analysis providers failed");
  }

  const totalCostUsd = perProvider.reduce((sum, r) => sum + r.usage.estimated_cost_usd, 0);
  const analysis = mergeDamageAnalyses(perProvider);

  return { analysis, perProvider, totalCostUsd };
}
