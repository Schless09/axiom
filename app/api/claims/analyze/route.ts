import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { getOrgIdForUser } from "@/lib/supabase/org";
import {
  analyzeEvidenceWithGemini,
  analyzeEvidenceWithGeminiFromFrames,
  PROMPT_VERSION,
  type DashcamPerspective,
} from "@/lib/ai/vla-engine";
import { analyzeEvidenceWithOpenAI, analyzeEvidenceWithOpenAIFromFrames } from "@/lib/ai/openai-engine";
import {
  analyzeEvidenceWithAnthropic,
  analyzeEvidenceWithAnthropicFromFrames,
} from "@/lib/ai/anthropic-engine";
import { extractVideoFrames } from "@/lib/video/extract-frames";
import { buildConsensus, type ModelResult } from "@/lib/ai/consensus";
import { matchStatutesForEvents } from "@/lib/ai/statute-matcher";
import { sendAnalysisCompleteEmail } from "@/lib/email/resend";
import { classifyEvidence } from "@/lib/ai/evidence-classifier";
import { analyzeDocument, type DocumentSourceType } from "@/lib/ai/pdf-engine";
import { analyzeAudioEvidence, isAudioMime } from "@/lib/ai/audio-engine";
import { analyzeDamagePhoto } from "@/lib/ai/damage-photo-engine";
import { synthesizeClaim, type EvidenceInput } from "@/lib/ai/synthesis-engine";
import type { VlaAnalysis } from "@/lib/ai/vla-schemas";
import type { ModelUsage } from "@/lib/ai/pricing";

const BUCKET = "evidence";
const DEV = process.env.NODE_ENV === "development";
const dlog = (...args: unknown[]) => { if (DEV) console.log("[analyze:dev]", ...args); };

export const maxDuration = 300;

/** Source types that require full VLA (dashcam / video evidence). */
const VLA_SOURCE_TYPES = new Set([
  "dashcam_video",
  "surveillance_video",
  "bystander_video",
  "telematics_video",
]);

/** Source types for which the PDF engine runs. */
const PDF_SOURCE_TYPES = new Set<string>([
  "police_report",
  "recorded_statement",
  "witness_statement",
  "repair_estimate",
  "medical_record",
]);

type EvidenceRow = {
  id: string;
  file_path: string;
  file_type: string | null;
  source_type: string;
  original_filename: string | null;
  gps_lat: number | null;
  gps_lon: number | null;
  captured_at: string | null;
};

/**
 * Analyze a single VLA evidence item (dashcam/video/image).
 * Returns the full consensus result plus the primary VlaAnalysis for physics checks.
 */
async function analyzeVlaEvidence(
  buf: Buffer,
  mime: string,
  perspective: DashcamPerspective,
  stateCode: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  claimId: string,
  evidenceId: string,
  runId: string,
  sharedFrames: Buffer[] | null,
): Promise<{
  analysis: VlaAnalysis;
  rawText: string;
  vla_analysis_raw: Record<string, unknown>;
  summary: string;
  liability: number | null;
  auditRows: Record<string, unknown>[];
}> {
  const openAiEnabled = !!process.env.OPENAI_API_KEY;
  const anthropicEnabled = !!process.env.ANTHROPIC_API_KEY;

  const [geminiSettled, openaiSettled, anthropicSettled] = await Promise.allSettled([
    sharedFrames
      ? analyzeEvidenceWithGeminiFromFrames(sharedFrames, perspective)
      : analyzeEvidenceWithGemini(buf, mime, perspective),
    openAiEnabled
      ? sharedFrames
        ? analyzeEvidenceWithOpenAIFromFrames(sharedFrames, perspective)
        : analyzeEvidenceWithOpenAI(buf, mime, perspective)
      : Promise.reject(new Error("OPENAI_API_KEY not configured")),
    anthropicEnabled
      ? sharedFrames
        ? analyzeEvidenceWithAnthropicFromFrames(sharedFrames, perspective)
        : analyzeEvidenceWithAnthropic(buf, mime, perspective)
      : Promise.reject(new Error("ANTHROPIC_API_KEY not configured")),
  ]);

  const modelResults: ModelResult[] = [];

  if (geminiSettled.status === "fulfilled") {
    modelResults.push({ provider: "gemini", ...geminiSettled.value });
  } else {
    console.error("[analyze] Gemini failed:", geminiSettled.reason);
    Sentry.captureException(geminiSettled.reason, { tags: { model: "gemini" } });
  }
  if (openaiSettled.status === "fulfilled") {
    modelResults.push({ provider: "openai", ...openaiSettled.value });
  } else if (openAiEnabled) {
    console.error("[analyze] GPT-4o failed:", openaiSettled.reason);
    Sentry.captureException(openaiSettled.reason, { tags: { model: "openai" } });
  }
  if (anthropicSettled.status === "fulfilled") {
    modelResults.push({ provider: "anthropic", ...anthropicSettled.value });
  } else if (anthropicEnabled) {
    console.error("[analyze] Claude failed:", anthropicSettled.reason);
    Sentry.captureException(anthropicSettled.reason, { tags: { model: "anthropic" } });
  }

  if (modelResults.length === 0) {
    throw new Error("All VLA model calls failed");
  }

  const built = await buildConsensus(modelResults);
  const { consensus, raw_by_provider, model_usage, total_cost_usd } = built;
  const analysis = consensus.factual_divergence
    ? { ...built.analysis, recommended_liability_percent: undefined }
    : built.analysis;

  const matches = consensus.factual_divergence
    ? []
    : await matchStatutesForEvents(supabase, stateCode, analysis.timeline);

  const liability =
    consensus.factual_divergence
      ? null
      : (analysis.recommended_liability_percent ??
        (analysis.timeline.length
          ? Math.round(analysis.timeline.reduce((s, e) => s + e.suggested_liability_percent, 0) / analysis.timeline.length)
          : null));

  const rawText =
    modelResults.find((r) => r.provider === "gemini")?.rawText ?? modelResults[0].rawText;

  const narrativeBody = consensus.factual_divergence
    ? [
        "Automated liability scoring withheld due to model factual divergence. Review source file and per-model outputs.",
        analysis.case_file_narrative,
        analysis.narrative_summary,
      ].filter(Boolean).join("\n\n").trim()
    : [analysis.case_file_narrative, analysis.narrative_summary].filter(Boolean).join("\n\n").trim();

  const statuteBlock = matches.length
    ? ["--- Statute alignment ---", ...matches.map((m) =>
        m.statute
          ? `${m.event.action} → ${m.statute.statute_code}: ${m.statute.description}`
          : `${m.event.action} → (no match)`,
      )].join("\n")
    : null;

  const summary = [narrativeBody || null, statuteBlock].filter(Boolean).join("\n\n") || rawText.slice(0, 4000);

  const modelVersionMap: Record<string, string> = {
    gemini: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    openai: process.env.OPENAI_MODEL ?? "gpt-4o",
    anthropic: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250929",
  };

  const vla_analysis_raw = {
    ...analysis,
    consensus,
    model_usage,
    total_cost_usd,
    raw_by_provider,
    statute_matches: matches.map((m) => ({
      timestamp_seconds: m.event.timestamp_seconds,
      action: m.event.action,
      statute: m.statute
        ? { statute_code: m.statute.statute_code, description: m.statute.description, violation_type: m.statute.violation_type }
        : null,
    })),
    raw_model_text: rawText,
  };

  const auditRows = [
    ...modelResults.map((r) => {
      const usage = model_usage.find((u) => u.provider === r.provider);
      return {
        evidence_id: evidenceId,
        claim_id: claimId,
        org_id: orgId,
        run_id: runId,
        model_provider: r.provider,
        model_version: modelVersionMap[r.provider] ?? null,
        prompt_version: PROMPT_VERSION,
        liability_score: r.analysis.recommended_liability_percent ?? null,
        overall_confidence: r.analysis.overall_confidence ?? null,
        analysis_raw: r.analysis as unknown as Record<string, unknown>,
        input_tokens: usage?.input_tokens ?? null,
        output_tokens: usage?.output_tokens ?? null,
        estimated_cost_usd: usage?.estimated_cost_usd ?? null,
      };
    }),
    {
      evidence_id: evidenceId,
      claim_id: claimId,
      org_id: orgId,
      run_id: runId,
      model_provider: "consensus",
      model_version: null,
      prompt_version: PROMPT_VERSION,
      liability_score: analysis.recommended_liability_percent ?? null,
      overall_confidence: analysis.overall_confidence ?? null,
      analysis_raw: { ...analysis, consensus } as unknown as Record<string, unknown>,
      input_tokens: model_usage.reduce((s: number, u: ModelUsage) => s + u.input_tokens, 0),
      output_tokens: model_usage.reduce((s: number, u: ModelUsage) => s + u.output_tokens, 0),
      estimated_cost_usd: total_cost_usd,
    },
  ];

  return { analysis, rawText, vla_analysis_raw, summary, liability, auditRows };
}

/**
 * Perform multi-angle joint VLA analysis when 2+ video evidence items exist.
 * Extracts frames from all items, concatenates them with per-source labels,
 * and sends as one model call so models can reason across angles.
 * Marks all participating evidence rows with analyzed_jointly = true.
 */
async function analyzeMultiAngle(
  videoItems: Array<{ ev: EvidenceRow; buf: Buffer; mime: string }>,
  perspective: DashcamPerspective,
): Promise<Buffer[]> {
  const allFrames: Buffer[] = [];

  for (const { buf, mime } of videoItems) {
    const frames = await extractVideoFrames(buf, mime, 10); // 10 frames per angle
    allFrames.push(...frames);
  }

  dlog(`multi-angle: combined ${allFrames.length} frames from ${videoItems.length} video sources`);
  return allFrames;
}

export async function POST(request: Request) {
  let body: { claimId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const claimId = body.claimId;
  if (!claimId || typeof claimId !== "string") {
    return NextResponse.json({ error: "claimId is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = await getOrgIdForUser(supabase, user.id);
  if (!orgId) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 });
  }

  const { data: claim, error: claimError } = await supabase
    .from("claims")
    .select("id, claim_number, state_code, user_id, status, dashcam_perspective")
    .eq("id", claimId)
    .eq("org_id", orgId)
    .single();

  if (claimError || !claim || claim.user_id !== user.id) {
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }

  if (claim.status === "analyzing") {
    return NextResponse.json({ error: "Analysis already in progress for this claim." }, { status: 409 });
  }

  const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_ANALYSES ?? "5", 10);

  const { count: analyzingCount } = await supabase
    .from("claims")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "analyzing");

  if (typeof analyzingCount === "number" && analyzingCount >= MAX_CONCURRENT) {
    return NextResponse.json(
      { error: `Your organization has too many analyses running (max ${MAX_CONCURRENT} concurrent). Wait for current ones to finish.` },
      { status: 429 },
    );
  }

  // Fetch ALL evidence for this claim — only stable columns (no Phase D migrations required).
  const { data: evidenceList, error: evListError } = await supabase
    .from("evidence")
    .select("id, file_path, file_type, source_type, original_filename, captured_at")
    .eq("claim_id", claimId);

  if (evListError) {
    console.error("[analyze] evidence query failed:", evListError.message);
    return NextResponse.json({ error: `Evidence query failed: ${evListError.message}` }, { status: 400 });
  }
  if (!evidenceList?.length) {
    return NextResponse.json({ error: "No evidence found for this claim. Upload a video or image first." }, { status: 400 });
  }

  // Optionally fetch Phase D GPS columns — gracefully skipped if migration hasn't run.
  let gpsMap: Map<string, { gps_lat: number | null; gps_lon: number | null }> = new Map();
  try {
    const { data: gpsRows } = await supabase
      .from("evidence")
      .select("id, gps_lat, gps_lon")
      .eq("claim_id", claimId);
    if (gpsRows) {
      for (const row of gpsRows) {
        gpsMap.set(row.id, { gps_lat: row.gps_lat ?? null, gps_lon: row.gps_lon ?? null });
      }
    }
  } catch {
    // Phase D migration not yet applied — GPS context will be skipped
  }

  const allEvidence: EvidenceRow[] = evidenceList.map((ev) => ({
    ...(ev as Omit<EvidenceRow, "gps_lat" | "gps_lon">),
    gps_lat: gpsMap.get(ev.id)?.gps_lat ?? null,
    gps_lon: gpsMap.get(ev.id)?.gps_lon ?? null,
  }));

  await supabase.from("claims").update({ status: "analyzing" }).eq("id", claimId).eq("org_id", orgId);

  return await Sentry.startSpan(
    {
      name: "analyze_claim_evidence",
      op: "task",
      attributes: {
        "claim.id": claimId,
        "org.id": orgId,
        "claim.state": String(claim.state_code ?? ""),
        "evidence.count": allEvidence.length,
      },
    },
    async () => {
      const started = Date.now();
      const runId = crypto.randomUUID();

      try {
        dlog(`── starting multi-evidence analysis for claim ${claimId} (${allEvidence.length} items, run ${runId}) ──`);

        let perspective = (claim.dashcam_perspective ?? "insured") as DashcamPerspective;

        // ── Download all files in parallel ────────────────────────────────────
        const fileBuffers = await Promise.all(
          allEvidence.map(async (ev) => {
            const { data: blob, error } = await supabase.storage.from(BUCKET).download(ev.file_path);
            if (error || !blob) throw new Error(`Download failed for ${ev.id}: ${error?.message}`);
            const buf = Buffer.from(await blob.arrayBuffer());
            const mime =
              blob.type ||
              (ev.file_type === "video" ? "video/mp4" : ev.file_type === "image" ? "image/jpeg" : "application/octet-stream");
            return { ev, buf, mime };
          }),
        );

        dlog("all files downloaded:", fileBuffers.map((f) => ({ id: f.ev.id, source: f.ev.source_type, sizeKB: (f.buf.byteLength / 1024).toFixed(1) })));

        // ── Evidence classification (on first VLA item, fast pre-step) ────────
        const firstVlaItem = fileBuffers.find((f) => VLA_SOURCE_TYPES.has(f.ev.source_type) || f.ev.file_type === "video");
        if (firstVlaItem) {
          const classification = await classifyEvidence(firstVlaItem.buf, firstVlaItem.mime, firstVlaItem.ev.original_filename ?? undefined);
          dlog("evidence classification:", classification);

          if (classification) {
            if (classification.confidence >= 0.75 && classification.source_type !== firstVlaItem.ev.source_type) {
              supabase.from("evidence")
                .update({ source_type: classification.source_type })
                .eq("id", firstVlaItem.ev.id)
                .eq("org_id", orgId)
                .then(({ error }) => { if (error) console.warn("[analyze] source_type update failed:", error.message); });
            }

            const hint = classification.perspective_hint;
            const validPerspectives = ["insured", "adverse", "witness"] as const;
            if (
              classification.confidence >= 0.80 &&
              hint &&
              (validPerspectives as readonly string[]).includes(hint) &&
              claim.dashcam_perspective === "insured" &&
              hint !== "insured"
            ) {
              perspective = hint as DashcamPerspective;
              supabase.from("claims")
                .update({ dashcam_perspective: hint })
                .eq("id", claimId)
                .eq("org_id", orgId)
                .then(({ error }) => { if (error) console.warn("[analyze] perspective update failed:", error.message); });
            }
          }
        }

        // ── Separate evidence by analysis type ────────────────────────────────
        const videoItems = fileBuffers.filter((f) =>
          VLA_SOURCE_TYPES.has(f.ev.source_type) || (f.ev.source_type === "other" && f.mime.startsWith("video/")),
        );
        const damagePhotoItems = fileBuffers.filter((f) =>
          f.ev.source_type === "damage_photo" || (f.ev.source_type === "other" && f.mime.startsWith("image/")),
        );
        const documentItems = fileBuffers.filter((f) => PDF_SOURCE_TYPES.has(f.ev.source_type));
        const audioItems = fileBuffers.filter((f) => isAudioMime(f.mime));

        dlog("evidence split:", {
          video: videoItems.length,
          damagePhotos: damagePhotoItems.length,
          documents: documentItems.length,
          audio: audioItems.length,
        });

        // ── Multi-angle detection ─────────────────────────────────────────────
        const useMultiAngle = videoItems.length >= 2;
        let sharedVideoFrames: Buffer[] | null = null;

        if (useMultiAngle) {
          dlog(`multi-angle mode: combining frames from ${videoItems.length} video sources`);
          sharedVideoFrames = await analyzeMultiAngle(videoItems, perspective);

          // Mark all video evidence as jointly analyzed
          await Promise.allSettled(
            videoItems.map((item) =>
              supabase.from("evidence")
                .update({ analyzed_jointly: true })
                .eq("id", item.ev.id)
                .eq("org_id", orgId),
            ),
          );
        }

        const allAuditRows: Record<string, unknown>[] = [];
        const synthesisInputs: EvidenceInput[] = [];
        let primaryVlaAnalysis: VlaAnalysis | null = null;
        let primarySummary: string | null = null;
        let primaryLiability: number | null = null;
        let primaryVlaRaw: Record<string, unknown> | null = null;

        // ── Analyze video items (VLA) ─────────────────────────────────────────
        if (videoItems.length > 0) {
          // In multi-angle mode, run one VLA call with combined frames;
          // in single mode, extract frames per-item.
          const primaryItem = videoItems[0];

          let frames: Buffer[] | null = null;
          if (useMultiAngle && sharedVideoFrames) {
            frames = sharedVideoFrames;
          } else if (primaryItem.mime.startsWith("video/")) {
            frames = await extractVideoFrames(primaryItem.buf, primaryItem.mime);
            if (frames.length === 0) {
              throw new Error("Frame extraction produced no output — video may be corrupt or unsupported");
            }
          }

          const vla = await analyzeVlaEvidence(
            primaryItem.buf,
            primaryItem.mime,
            perspective,
            claim.state_code as string,
            supabase,
            orgId,
            claimId,
            primaryItem.ev.id,
            runId,
            frames,
          );

          primaryVlaAnalysis = vla.analysis;
          primarySummary = vla.summary;
          primaryLiability = vla.liability;
          primaryVlaRaw = vla.vla_analysis_raw;
          allAuditRows.push(...vla.auditRows);

          synthesisInputs.push({
            evidence_id: primaryItem.ev.id,
            source_type: primaryItem.ev.source_type,
            analysis_raw: vla.vla_analysis_raw,
            gps_lat: primaryItem.ev.gps_lat,
            gps_lon: primaryItem.ev.gps_lon,
            captured_at: primaryItem.ev.captured_at,
          });

          // Persist VLA raw to primary evidence row
          supabase.from("evidence")
            .update({ vla_analysis_raw: vla.vla_analysis_raw })
            .eq("id", primaryItem.ev.id)
            .eq("org_id", orgId)
            .then(({ error }) => { if (error) console.warn("[analyze] vla_analysis_raw update failed:", error.message); });

          // If multi-angle, record synthesis input for secondary video items too
          if (useMultiAngle) {
            for (const item of videoItems.slice(1)) {
              synthesisInputs.push({
                evidence_id: item.ev.id,
                source_type: item.ev.source_type,
                analysis_raw: vla.vla_analysis_raw,
                gps_lat: item.ev.gps_lat,
                gps_lon: item.ev.gps_lon,
                captured_at: item.ev.captured_at,
              });
            }
          } else {
            // Analyze remaining video items independently
            for (const item of videoItems.slice(1)) {
              try {
                let itemFrames: Buffer[] | null = null;
                if (item.mime.startsWith("video/")) {
                  itemFrames = await extractVideoFrames(item.buf, item.mime);
                }
                const subVla = await analyzeVlaEvidence(
                  item.buf,
                  item.mime,
                  perspective,
                  claim.state_code as string,
                  supabase,
                  orgId,
                  claimId,
                  item.ev.id,
                  runId,
                  itemFrames,
                );
                allAuditRows.push(...subVla.auditRows);
                synthesisInputs.push({
                  evidence_id: item.ev.id,
                  source_type: item.ev.source_type,
                  analysis_raw: subVla.vla_analysis_raw,
                  gps_lat: item.ev.gps_lat,
                  gps_lon: item.ev.gps_lon,
                  captured_at: item.ev.captured_at,
                });
                supabase.from("evidence")
                  .update({ vla_analysis_raw: subVla.vla_analysis_raw })
                  .eq("id", item.ev.id)
                  .eq("org_id", orgId)
                  .then(({ error }) => { if (error) console.warn("[analyze] vla_analysis_raw update failed:", error.message); });
              } catch (e) {
                console.error(`[analyze] VLA failed for secondary video ${item.ev.id}:`, e);
                Sentry.captureException(e, { tags: { phase: "secondary-vla" } });
              }
            }
          }
        }

        // ── Analyze damage photos ─────────────────────────────────────────────
        for (const item of damagePhotoItems) {
          try {
            const { analysis, perProvider, totalCostUsd } = await analyzeDamagePhoto(item.buf, item.mime);
            dlog("damage photo analysis:", { id: item.ev.id, severity: analysis.estimated_severity });

            const damageRaw = { ...analysis, per_provider: perProvider.map((p) => ({ provider: p.provider, analysis: p.analysis })) };

            allAuditRows.push({
              evidence_id: item.ev.id,
              claim_id: claimId,
              org_id: orgId,
              run_id: runId,
              model_provider: "damage_consensus",
              model_version: null,
              prompt_version: PROMPT_VERSION,
              liability_score: null,
              overall_confidence: analysis.confidence,
              analysis_raw: damageRaw as unknown as Record<string, unknown>,
              input_tokens: perProvider.reduce((s, p) => s + p.usage.input_tokens, 0),
              output_tokens: perProvider.reduce((s, p) => s + p.usage.output_tokens, 0),
              estimated_cost_usd: totalCostUsd,
            });

            synthesisInputs.push({
              evidence_id: item.ev.id,
              source_type: item.ev.source_type,
              analysis_raw: damageRaw as unknown as Record<string, unknown>,
              gps_lat: item.ev.gps_lat,
              gps_lon: item.ev.gps_lon,
              captured_at: item.ev.captured_at,
            });

            supabase.from("evidence")
              .update({ vla_analysis_raw: damageRaw })
              .eq("id", item.ev.id)
              .eq("org_id", orgId)
              .then(({ error }) => { if (error) console.warn("[analyze] damage vla_analysis_raw update failed:", error.message); });
          } catch (e) {
            console.error(`[analyze] damage photo analysis failed for ${item.ev.id}:`, e);
            Sentry.captureException(e, { tags: { phase: "damage-photo" } });
          }
        }

        // ── Analyze documents (police reports, statements, estimates) ─────────
        for (const item of documentItems) {
          try {
            const sourceType = item.ev.source_type as DocumentSourceType;
            const { analysis, rawText, usage, provider } = await analyzeDocument(item.buf, item.mime, sourceType);
            dlog("document analysis:", { id: item.ev.id, source: sourceType, provider });

            const docRaw = analysis as unknown as Record<string, unknown>;

            allAuditRows.push({
              evidence_id: item.ev.id,
              claim_id: claimId,
              org_id: orgId,
              run_id: runId,
              model_provider: provider,
              model_version: provider === "anthropic"
                ? (process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250929")
                : (process.env.OPENAI_MODEL ?? "gpt-4o"),
              prompt_version: PROMPT_VERSION,
              liability_score: analysis.insured_liability_percent ?? null,
              overall_confidence: analysis.confidence,
              analysis_raw: docRaw,
              input_tokens: usage.input_tokens,
              output_tokens: usage.output_tokens,
              estimated_cost_usd: usage.estimated_cost_usd,
            });

            synthesisInputs.push({
              evidence_id: item.ev.id,
              source_type: item.ev.source_type,
              analysis_raw: docRaw,
              gps_lat: item.ev.gps_lat,
              gps_lon: item.ev.gps_lon,
              captured_at: item.ev.captured_at,
            });

            supabase.from("evidence")
              .update({ vla_analysis_raw: docRaw })
              .eq("id", item.ev.id)
              .eq("org_id", orgId)
              .then(({ error }) => { if (error) console.warn("[analyze] doc vla_analysis_raw update failed:", error.message); });

            void rawText;
          } catch (e) {
            console.error(`[analyze] document analysis failed for ${item.ev.id}:`, e);
            Sentry.captureException(e, { tags: { phase: "document" } });
          }
        }

        // ── Analyze audio (recorded statements) ───────────────────────────────
        for (const item of audioItems) {
          try {
            const { analysis, usage } = await analyzeAudioEvidence(item.buf, item.mime);
            dlog("audio analysis:", { id: item.ev.id });

            const audioRaw = analysis as unknown as Record<string, unknown>;

            allAuditRows.push({
              evidence_id: item.ev.id,
              claim_id: claimId,
              org_id: orgId,
              run_id: runId,
              model_provider: "openai",
              model_version: process.env.OPENAI_MODEL ?? "gpt-4o",
              prompt_version: PROMPT_VERSION,
              liability_score: analysis.insured_liability_percent ?? null,
              overall_confidence: analysis.confidence,
              analysis_raw: audioRaw,
              input_tokens: usage.input_tokens,
              output_tokens: usage.output_tokens,
              estimated_cost_usd: usage.estimated_cost_usd,
            });

            synthesisInputs.push({
              evidence_id: item.ev.id,
              source_type: item.ev.source_type,
              analysis_raw: audioRaw,
              gps_lat: item.ev.gps_lat,
              gps_lon: item.ev.gps_lon,
              captured_at: item.ev.captured_at,
            });

            supabase.from("evidence")
              .update({ vla_analysis_raw: audioRaw })
              .eq("id", item.ev.id)
              .eq("org_id", orgId)
              .then(({ error }) => { if (error) console.warn("[analyze] audio vla_analysis_raw update failed:", error.message); });
          } catch (e) {
            console.error(`[analyze] audio analysis failed for ${item.ev.id}:`, e);
            Sentry.captureException(e, { tags: { phase: "audio" } });
          }
        }

        if (synthesisInputs.length === 0) {
          throw new Error("No evidence items were successfully analyzed");
        }

        // ── Write evidence_analysis audit rows ────────────────────────────────
        supabase.from("evidence_analysis").insert(allAuditRows).then(({ error }) => {
          if (error) console.warn("[analyze] evidence_analysis write failed (non-fatal):", error.message);
          else dlog(`evidence_analysis: wrote ${allAuditRows.length} rows for run ${runId}`);
        });

        // ── Synthesis ─────────────────────────────────────────────────────────
        const synthesis = await synthesizeClaim(synthesisInputs, primaryVlaAnalysis);
        dlog("synthesis result:", synthesis);

        Sentry.setMeasurement("synthesis.evidence_count", synthesisInputs.length, "none");
        Sentry.setMeasurement("synthesis.final_liability", synthesis.final_liability_percent ?? -1, "none");
        Sentry.setMeasurement("synthesis.review_required", synthesis.review_required ? 1 : 0, "none");

        // Final liability: prefer synthesis when multiple evidence items; otherwise use primary VLA
        const finalLiability =
          synthesisInputs.length > 1
            ? (synthesis.final_liability_percent ?? primaryLiability)
            : primaryLiability;

        // Build the claim summary — synthesis narrative + VLA summary
        const claimSummary = [
          synthesisInputs.length > 1 ? synthesis.synthesis_narrative : null,
          primarySummary,
        ].filter(Boolean).join("\n\n");

        // ── Persist ───────────────────────────────────────────────────────────
        if (primaryVlaRaw) {
          const { error: evUpdateError } = await supabase
            .from("evidence")
            .update({ vla_analysis_raw: primaryVlaRaw })
            .eq("id", videoItems[0]?.ev.id ?? allEvidence[0].id)
            .eq("org_id", orgId);

          if (evUpdateError) console.warn("[analyze] primary evidence update failed:", evUpdateError.message);
        }

        // Write final claim status. Try with synthesis_raw first; fall back without it
        // if the Phase D migration hasn't been run yet.
        let { error: claimUpdateError } = await supabase
          .from("claims")
          .update({
            status: "completed",
            liability_score: finalLiability,
            summary: claimSummary || primarySummary,
            synthesis_raw: synthesis as unknown as Record<string, unknown>,
          })
          .eq("id", claimId)
          .eq("org_id", orgId);

        if (claimUpdateError) {
          dlog("synthesis_raw write failed (migration not run?), retrying without it:", claimUpdateError.message);
          const { error: fallbackError } = await supabase
            .from("claims")
            .update({
              status: "completed",
              liability_score: finalLiability,
              summary: claimSummary || primarySummary,
            })
            .eq("id", claimId)
            .eq("org_id", orgId);
          if (fallbackError) throw new Error(fallbackError.message);
        }

        const durationMs = Date.now() - started;
        dlog(`── analysis complete in ${durationMs}ms, liability: ${finalLiability}% ──`);
        Sentry.setMeasurement("analyze.duration_ms", durationMs, "millisecond");

        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        sendAnalysisCompleteEmail({
          to: user.email ?? "",
          claimNumber: claim.claim_number ?? claimId,
          liabilityScore: finalLiability ?? null,
          scorecardUrl: `${appUrl}/dashboard/claims/${claimId}`,
        }).catch(() => {});

        return NextResponse.json({
          ok: true,
          claimId,
          liability_score: finalLiability,
          evidence_count: synthesisInputs.length,
          synthesis_review_required: synthesis.review_required,
          synthesis_confidence: synthesis.confidence,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Analysis failed";
        console.error("[api/claims/analyze] failed", { claimId, orgId, message });
        if (e instanceof Error && e.stack) console.error(e.stack);
        Sentry.captureException(e);
        await supabase
          .from("claims")
          .update({ status: "error", summary: message })
          .eq("id", claimId)
          .eq("org_id", orgId);
        return NextResponse.json({ error: message }, { status: 500 });
      }
    },
  );
}
