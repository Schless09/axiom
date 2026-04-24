/**
 * PDF evidence analysis engine.
 *
 * Uses Claude's native `document` content block (no external PDF parser) to
 * extract structured information from police reports, recorded statements,
 * repair estimates, and other document evidence.
 *
 * Falls back to GPT-4o vision (rendered page images) if ANTHROPIC_API_KEY is absent.
 * Returns a PolicyEvidenceAnalysis matching policyEvidenceSchema.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { parsePolicyEvidenceJson, type PolicyEvidenceAnalysis } from "@/lib/ai/vla-schemas";
import { buildModelUsage, type ModelUsage } from "@/lib/ai/pricing";

export type DocumentSourceType =
  | "police_report"
  | "recorded_statement"
  | "witness_statement"
  | "repair_estimate"
  | "medical_record"
  | "other"
  | "unknown";

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
      console.warn(`[pdf-engine] transient error (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

function buildSystemPrompt(sourceType: DocumentSourceType): string {
  const docDescription: Record<DocumentSourceType, string> = {
    police_report: "an official police / traffic crash report",
    recorded_statement: "a recorded statement transcript from a claims interview",
    witness_statement: "a written witness statement",
    repair_estimate: "a vehicle repair estimate or damage appraisal",
    medical_record: "a medical record or injury documentation",
    other: "an insurance claim document",
    unknown: "an insurance claim document (type unknown — determine from content)",
  };

  const documentTypeInstruction = sourceType === "unknown"
    ? `"document_type": <determine from content: "police_report" | "recorded_statement" | "witness_statement" | "repair_estimate" | "medical_record" | "other">,`
    : `"document_type": "${sourceType}",`;

  return `You are a senior insurance claims analyst extracting structured data from ${docDescription[sourceType]}.

Extract every factual detail relevant to liability determination. Use only information explicitly stated in the document — do not infer or embellish. If a field is not present, omit it or use null.

Output a single JSON object (no markdown fences) with this exact shape:
{
  ${documentTypeInstruction}
  "incident_date": "<ISO date string or null>",
  "incident_location": "<street address or intersection or null>",
  "parties": [
    {
      "role": "insured" | "adverse" | "witness" | "officer" | "other",
      "name": "<name or null>",
      "vehicle": "<year make model or null>",
      "injuries_reported": true | false | null,
      "statement_summary": "<1–3 sentences summarizing this party's account or null>"
    }
  ],
  "violations_cited": [
    {
      "party_role": "insured" | "adverse" | "witness" | "other",
      "violation_description": "<plain-English description>",
      "statute_reference": "<code section if present or null>",
      "violation_tag": "<one of: speeding, lane_change, failure_to_yield, improper_turn, following_too_close, running_red_light, running_stop_sign, distracted_driving, reckless_driving, or null>"
    }
  ],
  "officer_narrative": "<verbatim or paraphrased officer narrative section or null>",
  "fault_determination": "<explicit fault assignment from the document or null>",
  "insured_liability_percent": <0–100 if explicitly stated, else null>,
  "repair_total_usd": <numeric dollar amount if present, else null>,
  "summary": "<2–4 sentence executive summary of the document's key liability-relevant facts>",
  "confidence": "high" | "medium" | "low"
}

confidence rules:
- "high": document is clear, complete, and directly addresses liability
- "medium": document is partial, legible but incomplete, or partially relevant
- "low": document is illegible, heavily redacted, or tangentially relevant`;
}

/**
 * Analyze a PDF document using Claude's native document block.
 * Claude sends the PDF to Anthropic's servers for extraction — no local parsing.
 */
export async function analyzeDocumentWithClaude(
  pdfBuffer: Buffer,
  sourceType: DocumentSourceType,
): Promise<{ analysis: PolicyEvidenceAnalysis; rawText: string; usage: ModelUsage }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250929";
  const anthropic = new Anthropic({ apiKey });

  const response = await withRetry(() =>
    anthropic.messages.create({
      model,
      max_tokens: 2048,
      system: buildSystemPrompt(sourceType),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBuffer.toString("base64"),
              },
            } as Anthropic.DocumentBlockParam,
            {
              type: "text",
              text: "Extract the structured JSON as specified. Output only the JSON object.",
            },
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

  const analysis = parsePolicyEvidenceJson(rawText);
  return { analysis, rawText, usage };
}

/**
 * Fallback: analyze a PDF using GPT-4o.
 * GPT-4o does not accept raw PDFs — we send the base64 content as a text
 * extraction prompt. For pilot use this works adequately for typed documents;
 * handwritten reports will have lower quality.
 */
async function analyzeDocumentWithOpenAI(
  pdfBuffer: Buffer,
  sourceType: DocumentSourceType,
): Promise<{ analysis: PolicyEvidenceAnalysis; rawText: string; usage: ModelUsage }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const model = process.env.OPENAI_MODEL ?? "gpt-4o";
  const openai = new OpenAI({ apiKey });

  const base64 = pdfBuffer.toString("base64");

  const response = await withRetry(() =>
    openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: buildSystemPrompt(sourceType) },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `The following is a base64-encoded PDF document. Extract all text content and then produce the structured JSON output as specified.\n\nBase64 PDF (${Math.round(base64.length / 1024)} KB): ${base64.slice(0, 50000)}${base64.length > 50000 ? "\n[truncated — extract from visible content]" : ""}`,
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 2048,
    }),
  );

  const rawText = response.choices[0]?.message?.content ?? "";
  const usage = buildModelUsage({
    provider: "openai",
    model,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  });

  const analysis = parsePolicyEvidenceJson(rawText);
  return { analysis, rawText, usage };
}

/**
 * Main entry point: analyze a PDF document.
 * Prefers Claude (native PDF block), falls back to GPT-4o.
 */
export async function analyzeDocument(
  fileBuffer: Buffer,
  mimeType: string,
  sourceType: DocumentSourceType,
): Promise<{ analysis: PolicyEvidenceAnalysis; rawText: string; usage: ModelUsage; provider: string }> {
  if (!mimeType.includes("pdf") && !mimeType.includes("text")) {
    throw new Error(`analyzeDocument: unsupported MIME type ${mimeType} — expected PDF or text`);
  }

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const result = await analyzeDocumentWithClaude(fileBuffer, sourceType);
      return { ...result, provider: "anthropic" };
    } catch (e) {
      console.warn("[pdf-engine] Claude failed, falling back to OpenAI:", e instanceof Error ? e.message : e);
    }
  }

  if (process.env.OPENAI_API_KEY) {
    const result = await analyzeDocumentWithOpenAI(fileBuffer, sourceType);
    return { ...result, provider: "openai" };
  }

  throw new Error("analyzeDocument: neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is configured");
}
