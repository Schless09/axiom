/**
 * Audio evidence analysis engine.
 *
 * Step 1 — Transcription: OpenAI Whisper (`whisper-1`) converts the audio
 *           file (MP3, WAV, M4A, OGG, FLAC) to text.
 * Step 2 — Structured extraction: GPT-4o reads the transcript and produces a
 *           PolicyEvidenceAnalysis matching policyEvidenceSchema.
 *
 * Gated on OPENAI_API_KEY — returns null if key is absent.
 */

import OpenAI from "openai";
import { parsePolicyEvidenceJson, type PolicyEvidenceAnalysis } from "@/lib/ai/vla-schemas";
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
      console.warn(`[audio-engine] transient error (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured — audio analysis unavailable");
  return new OpenAI({ apiKey });
}

/**
 * Map common audio MIME types to file extensions Whisper accepts.
 * Whisper accepts: flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm
 */
function mimeToExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
    "audio/webm": "webm",
    "video/webm": "webm",
  };
  return map[mimeType] ?? "mp3";
}

const EXTRACTION_SYSTEM_PROMPT = `You are a senior insurance claims analyst. You have been given a verbatim transcript of a recorded statement or interview. Extract structured liability-relevant information.

Output a single JSON object (no markdown fences):
{
  "document_type": "recorded_statement",
  "incident_date": "<ISO date string if mentioned, else null>",
  "incident_location": "<street / intersection if mentioned, else null>",
  "parties": [
    {
      "role": "insured" | "adverse" | "witness" | "officer" | "other",
      "name": "<name if stated, else null>",
      "vehicle": "<vehicle description if stated, else null>",
      "injuries_reported": true | false | null,
      "statement_summary": "<1–3 sentences summarizing this person's account>"
    }
  ],
  "violations_cited": [
    {
      "party_role": "insured" | "adverse" | "witness" | "other",
      "violation_description": "<plain-English description>",
      "statute_reference": null,
      "violation_tag": "<one of: speeding, lane_change, failure_to_yield, improper_turn, following_too_close, running_red_light, running_stop_sign, distracted_driving, reckless_driving, or null>"
    }
  ],
  "officer_narrative": null,
  "fault_determination": "<any explicit fault statements made, else null>",
  "insured_liability_percent": <0–100 if explicitly stated, else null>,
  "repair_total_usd": null,
  "summary": "<2–4 sentence summary of the key liability-relevant facts from this statement>",
  "confidence": "high" | "medium" | "low"
}`;

/**
 * Transcribe audio using Whisper, then extract structured evidence using GPT-4o.
 * Returns the PolicyEvidenceAnalysis plus the raw transcript text.
 */
export async function analyzeAudioEvidence(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<{
  analysis: PolicyEvidenceAnalysis;
  transcript: string;
  rawText: string;
  usage: ModelUsage;
}> {
  const openai = getClient();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o";
  const ext = mimeToExtension(mimeType);

  // ── Step 1: Whisper transcription ─────────────────────────────────────────
  // Whisper requires a File-like object. In Node.js we use a Blob + filename hack.
  // Slice to get a plain ArrayBuffer (avoids SharedArrayBuffer TS constraint)
  const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength) as ArrayBuffer;
  const audioBlob = new Blob([arrayBuffer], { type: mimeType });
  const audioFile = new File([audioBlob], `audio.${ext}`, { type: mimeType });

  const transcriptionResponse = await withRetry(() =>
    openai.audio.transcriptions.create({
      model: "whisper-1",
      file: audioFile,
      response_format: "text",
    }),
  );

  const transcript =
    typeof transcriptionResponse === "string"
      ? transcriptionResponse
      : (transcriptionResponse as { text?: string }).text ?? "";

  if (!transcript.trim()) {
    throw new Error("Whisper returned an empty transcript — audio may be silent or corrupt");
  }

  // ── Step 2: GPT-4o structured extraction ─────────────────────────────────
  const extractionResponse = await withRetry(() =>
    openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Here is the full transcript:\n\n---\n${transcript}\n---\n\nExtract the structured JSON as specified.`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 2048,
    }),
  );

  const rawText = extractionResponse.choices[0]?.message?.content ?? "";
  const usage = buildModelUsage({
    provider: "openai",
    model,
    inputTokens: extractionResponse.usage?.prompt_tokens ?? 0,
    outputTokens: extractionResponse.usage?.completion_tokens ?? 0,
  });

  const analysis = parsePolicyEvidenceJson(rawText);
  return { analysis, transcript, rawText, usage };
}

/** Supported audio MIME types for the upload form validator. */
export const SUPPORTED_AUDIO_MIMES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/flac",
  "audio/webm",
] as const;

export function isAudioMime(mimeType: string): boolean {
  return mimeType.startsWith("audio/") || SUPPORTED_AUDIO_MIMES.includes(mimeType as typeof SUPPORTED_AUDIO_MIMES[number]);
}
