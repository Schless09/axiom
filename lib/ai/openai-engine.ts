import OpenAI from "openai";
import type { ChatCompletionContentPartImage } from "openai/resources/chat/completions";
import { parseVlaJson, type VlaAnalysis } from "@/lib/ai/vla-schemas";
import {
  buildSequentialFramePreamble,
  buildSystemInstruction,
  USER_PROMPT,
  type DashcamPerspective,
} from "@/lib/ai/vla-engine";
import { extractVideoFrames } from "@/lib/video/extract-frames";
import { buildModelUsage, type ModelUsage } from "@/lib/ai/pricing";

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

async function retryOpenAI<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelayMs = 2000): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const status = (e as { status?: number }).status;
      const retryable = status != null && RETRYABLE_STATUSES.has(status);
      if (!retryable || attempt === maxAttempts) throw e;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      console.warn(`[openai-engine] transient error (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  return new OpenAI({ apiKey });
}

/**
 * Run GPT-4o analysis on a claim's evidence.
 *
 * • Images → sent as a single base64 image_url part
 * • Videos → frames are extracted via ffmpeg then sent as multiple image_url parts
 *
 * Returns the parsed VlaAnalysis plus the raw JSON string.
 */
export async function analyzeEvidenceWithOpenAI(
  fileBuffer: Buffer,
  mimeType: string,
  perspective: DashcamPerspective = "insured",
): Promise<{ analysis: VlaAnalysis; rawText: string; usage: ModelUsage }> {
  const openai = getClient();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o";

  const imageParts: ChatCompletionContentPartImage[] = [];

  if (mimeType.startsWith("video/")) {
    const frames = await extractVideoFrames(fileBuffer, mimeType);
    if (frames.length === 0) {
      throw new Error("Frame extraction produced no output — video may be corrupt or unsupported");
    }
    for (const frame of frames) {
      imageParts.push({
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${frame.toString("base64")}`,
          detail: "high",
        },
      });
    }
  } else {
    imageParts.push({
      type: "image_url",
      image_url: {
        url: `data:${mimeType};base64,${fileBuffer.toString("base64")}`,
        detail: "high",
      },
    });
  }

  // When analyzing video frames, prepend context so the model understands
  // the images are sequential dashcam frames — not unrelated photographs.
  const frameContext = mimeType.startsWith("video/") && imageParts.length > 0
    ? `You are analyzing ${imageParts.length} sequential frames extracted chronologically from a dashcam video recording. Frame 1 is earliest, frame ${imageParts.length} is latest. Treat this as a continuous video clip — reason about motion and timing across all frames before concluding.\n\n`
    : "";

  const response = await retryOpenAI(() => openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: buildSystemInstruction(perspective) },
      {
        role: "user",
        content: [
          { type: "text", text: frameContext + USER_PROMPT },
          ...imageParts,
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 4096,
  }));

  const rawText = response.choices[0]?.message?.content ?? "";
  const usage = buildModelUsage({
    provider: "openai",
    model,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  });
  const analysis = parseVlaJson(rawText);
  return { analysis, rawText, usage };
}

/** Same JPEG sequence as Gemini / Anthropic when the caller extracted frames once from a video. */
export async function analyzeEvidenceWithOpenAIFromFrames(
  frames: Buffer[],
  perspective: DashcamPerspective = "insured",
): Promise<{ analysis: VlaAnalysis; rawText: string; usage: ModelUsage }> {
  if (frames.length === 0) {
    throw new Error("analyzeEvidenceWithOpenAIFromFrames: no frames");
  }
  const openai = getClient();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o";

  const imageParts: ChatCompletionContentPartImage[] = frames.map((frame) => ({
    type: "image_url",
    image_url: {
      url: `data:image/jpeg;base64,${frame.toString("base64")}`,
      detail: "high",
    },
  }));

  const frameContext = buildSequentialFramePreamble(frames.length);

  const response = await retryOpenAI(() =>
    openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: buildSystemInstruction(perspective) },
        {
          role: "user",
          content: [{ type: "text", text: frameContext + USER_PROMPT }, ...imageParts],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 4096,
    }),
  );

  const rawText = response.choices[0]?.message?.content ?? "";
  const usage = buildModelUsage({
    provider: "openai",
    model,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  });
  const analysis = parseVlaJson(rawText);
  return { analysis, rawText, usage };
}
