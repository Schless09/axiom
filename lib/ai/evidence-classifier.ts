/**
 * Lightweight evidence classification step.
 *
 * Runs BEFORE the full VLA analysis on a single frame (video) or the full
 * image. Returns a source_type + confidence + perspective_hint so the analyze
 * route can:
 *   1. Update evidence.source_type in the DB
 *   2. Auto-correct claims.dashcam_perspective when confidence is high enough
 *
 * Uses gemini-2.5-flash-lite inline (no FileManager) — fast, cheap, ~500 tokens.
 * Any failure is non-fatal; the caller falls back to the stored source_type.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { extractVideoFrames } from "@/lib/video/extract-frames";

export const SOURCE_TYPES = [
  "dashcam_video",
  "surveillance_video",
  "bystander_video",
  "telematics_video",
  "police_report",
  "recorded_statement",
  "witness_statement",
  "scene_diagram",
  "damage_photo",
  "repair_estimate",
  "medical_record",
  "other",
] as const;

export type SourceType = typeof SOURCE_TYPES[number];

export const PERSPECTIVES = ["insured", "adverse", "witness", "officer", "neutral"] as const;
export type PerspectiveHint = typeof PERSPECTIVES[number];

const ClassificationSchema = z.object({
  source_type: z.enum(SOURCE_TYPES),
  confidence: z.number().min(0).max(1),
  perspective_hint: z.enum(PERSPECTIVES).nullable().optional(),
  reasoning: z.string(),
});

export type EvidenceClassification = z.infer<typeof ClassificationSchema>;

/** Always use the fastest/cheapest available model for classification — not configurable. */
const CLASSIFIER_MODEL = "gemini-2.5-flash-lite";

const SYSTEM_PROMPT = `You are an insurance evidence classifier. Given a single image or video frame from an insurance claim, classify the evidence type and camera perspective.

EVIDENCE TYPES:
- dashcam_video      Moving first-person POV; HUD overlay with speed/GPS/timestamp; wide-angle dashcam lens distortion; typical 16:9 landscape orientation
- surveillance_video Fixed-angle security camera; often elevated or fisheye lens; timestamp watermark; no dashcam HUD; lower resolution typical
- bystander_video    Handheld mobile phone; portrait (9:16) or shaky landscape; modern high-res; no HUD; informal framing
- telematics_video   OEM vehicle camera with embedded telemetry data (Tesla Sentry, GM OnStar, etc.); branded UI overlays
- police_report      Official incident report document; officer badge/ID; coded violation fields; agency letterhead
- recorded_statement Transcript document; Q&A interview format between adjuster and party; "Recorded Statement of [name]" header
- witness_statement  Written narrative paragraph from a witness; not in Q&A format
- scene_diagram      Hand-drawn or printed overhead diagram; arrows showing vehicle paths; lane markings; intersection sketch
- damage_photo       Close-up photograph of vehicle damage; stationary vehicle; no road/driving context
- repair_estimate    Line-item document; labor hours; part numbers; shop letterhead; dollar amounts
- medical_record     Medical documentation; ICD codes; provider signature; diagnosis/treatment
- other              Does not fit any above category

CAMERA PERSPECTIVE (only for visual/video evidence — null for documents):
- insured   Recording device is mounted on or operated from the insured/claimant vehicle
- adverse   Recording device belongs to the opposing party in the claim
- witness   A neutral third-party vehicle or bystander recorded the event
- officer   Law enforcement dashcam or body camera
- neutral   Fixed camera with no party affiliation (e.g. traffic light, parking lot CCTV)

Respond with valid JSON only — no markdown, no explanation outside the JSON:
{
  "source_type": "<type>",
  "confidence": <0.0–1.0, e.g. 0.92>,
  "perspective_hint": "<perspective or null>",
  "reasoning": "<one concise sentence>"
}`;

export async function classifyEvidence(
  fileBuffer: Buffer,
  mimeType: string,
  fileName?: string,
): Promise<EvidenceClassification | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    // --- Build the image payload -------------------------------------------
    let imageBase64: string;
    let imageMime: string;

    if (mimeType.startsWith("video/")) {
      // Extract a single frame ~2s in for scene establishment
      const frames = await extractVideoFrames(fileBuffer, mimeType, 1);
      if (frames.length === 0) return null;
      imageBase64 = frames[0].toString("base64");
      imageMime = "image/jpeg";
    } else if (mimeType.startsWith("image/")) {
      imageBase64 = fileBuffer.toString("base64");
      imageMime = mimeType;
    } else {
      // PDFs and other document types — vision classification not yet supported;
      // future: extract first page with pdf2pic or pdfjs before classifying.
      return null;
    }

    // --- Call Gemini --------------------------------------------------------
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: CLASSIFIER_MODEL });

    const nameHint = fileName ? `\nFile name hint: ${fileName}` : "";

    const result = await model.generateContent([
      { text: SYSTEM_PROMPT + nameHint },
      { inlineData: { data: imageBase64, mimeType: imageMime } },
    ]);

    const text = result.response.text().trim();

    // Strip markdown fences if the model wrapped the JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return ClassificationSchema.parse(parsed);
  } catch (e) {
    console.warn(
      "[evidence-classifier] classification failed (non-fatal):",
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}
