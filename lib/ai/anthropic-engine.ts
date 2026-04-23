import Anthropic from "@anthropic-ai/sdk";
import type { Base64ImageSource, ImageBlockParam, TextBlockParam } from "@anthropic-ai/sdk/resources/messages";
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

async function retryAnthropic<T>(
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
      const status = (e as { status?: number }).status;
      const retryable = status != null && RETRYABLE_STATUSES.has(status);
      if (!retryable || attempt === maxAttempts) throw e;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      console.warn(
        `[anthropic-engine] transient error (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms…`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  return new Anthropic({ apiKey });
}

/**
 * Run Claude analysis on a claim's evidence.
 *
 * • Images → sent as a single base64 image block
 * • Videos → frames extracted via ffmpeg, sent as multiple image blocks
 *
 * Returns the parsed VlaAnalysis, raw text, and token usage.
 */
export async function analyzeEvidenceWithAnthropic(
  fileBuffer: Buffer,
  mimeType: string,
  perspective: DashcamPerspective = "insured",
): Promise<{ analysis: VlaAnalysis; rawText: string; usage: ModelUsage }> {
  const anthropic = getClient();
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250929";

  const imageBlocks: ImageBlockParam[] = [];

  if (mimeType.startsWith("video/")) {
    const frames = await extractVideoFrames(fileBuffer, mimeType);
    if (frames.length === 0) {
      throw new Error("Frame extraction produced no output — video may be corrupt or unsupported");
    }
    for (const frame of frames) {
      imageBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: frame.toString("base64"),
        },
      });
    }
  } else {
    const mediaType = (
      mimeType === "image/png" ? "image/png"
      : mimeType === "image/gif" ? "image/gif"
      : mimeType === "image/webp" ? "image/webp"
      : "image/jpeg"
    ) as Base64ImageSource["media_type"];

    imageBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType,
        data: fileBuffer.toString("base64"),
      },
    });
  }

  // When analyzing video frames, prepend context so the model understands
  // the images are sequential dashcam frames — not unrelated photographs.
  const frameContext = mimeType.startsWith("video/") && imageBlocks.length > 0
    ? `You are analyzing ${imageBlocks.length} sequential frames extracted chronologically from a dashcam video recording. Frame 1 is earliest, frame ${imageBlocks.length} is latest. Treat this as a continuous video clip — reason about motion and timing across all frames before concluding.\n\n`
    : "";

  const content: (TextBlockParam | ImageBlockParam)[] = [
    { type: "text", text: frameContext + USER_PROMPT },
    ...imageBlocks,
  ];

  const response = await retryAnthropic(() =>
    anthropic.messages.create({
      model,
      max_tokens: 4096,
      system: buildSystemInstruction(perspective),
      messages: [{ role: "user", content }],
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

  const analysis = parseVlaJson(rawText);
  return { analysis, rawText, usage };
}

/** Same JPEG sequence as Gemini / OpenAI when frames were extracted once from a video. */
export async function analyzeEvidenceWithAnthropicFromFrames(
  frames: Buffer[],
  perspective: DashcamPerspective = "insured",
): Promise<{ analysis: VlaAnalysis; rawText: string; usage: ModelUsage }> {
  if (frames.length === 0) {
    throw new Error("analyzeEvidenceWithAnthropicFromFrames: no frames");
  }
  const anthropic = getClient();
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250929";

  const imageBlocks: ImageBlockParam[] = frames.map((frame) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: "image/jpeg",
      data: frame.toString("base64"),
    },
  }));

  const frameContext = buildSequentialFramePreamble(frames.length);

  const content: (TextBlockParam | ImageBlockParam)[] = [
    { type: "text", text: frameContext + USER_PROMPT },
    ...imageBlocks,
  ];

  const response = await retryAnthropic(() =>
    anthropic.messages.create({
      model,
      max_tokens: 4096,
      system: buildSystemInstruction(perspective),
      messages: [{ role: "user", content }],
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

  const analysis = parseVlaJson(rawText);
  return { analysis, rawText, usage };
}
