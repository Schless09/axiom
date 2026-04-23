/**
 * Axiom VLA — Eval Runner
 *
 * Reads eval/manifest.v1.json (or a path supplied as the first CLI arg),
 * runs VLA analysis on every clip that has a local media file,
 * scores each result against ground truth, and writes a JSON report to
 * eval/results/run-<timestamp>.json.
 *
 * Usage:
 *   npx tsx --env-file .env scripts/run-eval.ts
 *   npx tsx --env-file .env scripts/run-eval.ts eval/manifest.v1.json
 *   npx tsx --env-file .env scripts/run-eval.ts --gemini-only    # skip OpenAI + Anthropic
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, extname } from "node:path";
import { parseEvalManifest, type EvalClip } from "../lib/eval/manifest";
import {
  scoreAll,
  matchesFromVlaRaw,
  type CompositeScore,
  type VlaTimelineEvent,
} from "../lib/eval/score";
import {
  analyzeEvidenceWithGemini,
  analyzeEvidenceWithGeminiFromFrames,
} from "../lib/ai/vla-engine";
import {
  analyzeEvidenceWithOpenAI,
  analyzeEvidenceWithOpenAIFromFrames,
} from "../lib/ai/openai-engine";
import {
  analyzeEvidenceWithAnthropic,
  analyzeEvidenceWithAnthropicFromFrames,
} from "../lib/ai/anthropic-engine";
import { extractVideoFrames } from "../lib/video/extract-frames";
import { buildConsensus, type ModelResult } from "../lib/ai/consensus";

// ── CLI flags ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const geminiOnly = args.includes("--gemini-only");
const manifestPath = args.find((a) => !a.startsWith("--")) ?? "eval/manifest.v1.json";

// ── Helpers ──────────────────────────────────────────────────────────────────

function mimeFromExt(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
  };
  return map[ext] ?? "application/octet-stream";
}

const VERDICT_ICON: Record<string, string> = {
  pass:        "✅ PASS",
  fail:        "❌ FAIL",
  partial:     "⚠️  PARTIAL",
  unannotated: "⬜ UNANNOTATED",
};

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function hr(char = "─", width = 64): string {
  return char.repeat(width);
}

// ── Per-clip result type (saved to JSON report) ───────────────────────────────

type ClipRunResult = {
  clip_id:          string;
  state_code:       string;
  skipped:          boolean;
  skip_reason?:     string;
  consensus_score?: number;
  liability_delta?: number | null;
  agreement_level?: string;
  factual_divergence?: boolean;
  total_cost_usd?:  number;
  score?:           CompositeScore;
  per_model?:       Record<string, number | null>;
  elapsed_ms?:      number;
  error?:           string;
};

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const absManifest = resolve(process.cwd(), manifestPath);
  const raw: unknown = JSON.parse(readFileSync(absManifest, "utf8"));
  const manifest = parseEvalManifest(raw);

  console.log(hr("═"));
  console.log(`  Axiom VLA — Eval Runner`);
  console.log(`  Manifest : ${manifest.dataset_label} (${manifest.clips.length} clips)`);
  console.log(`  Mode     : ${geminiOnly ? "Gemini only" : "All 3 models"}`);
  console.log(`  Date     : ${new Date().toISOString()}`);
  console.log(hr("═"));
  console.log();

  const results: ClipRunResult[] = [];
  let totalCost = 0;
  let ran = 0;
  let skipped = 0;

  for (let i = 0; i < manifest.clips.length; i++) {
    const clip = manifest.clips[i];
    const prefix = `[${String(i + 1).padStart(2)}/${manifest.clips.length}] ${clip.id} (${clip.jurisdiction.state_code})`;

    // ── Skip clips without local media ───────────────────────────────────
    if (clip.media.type !== "local_relative") {
      console.log(`${prefix} — SKIP (non-local media type: ${clip.media.type})`);
      results.push({ clip_id: clip.id, state_code: clip.jurisdiction.state_code, skipped: true, skip_reason: "non-local media" });
      skipped++;
      continue;
    }

    const mediaPath = resolve(process.cwd(), clip.media.path);
    if (!existsSync(mediaPath)) {
      console.log(`${prefix} — SKIP (no media file at ${clip.media.path})`);
      results.push({ clip_id: clip.id, state_code: clip.jurisdiction.state_code, skipped: true, skip_reason: "file not found" });
      skipped++;
      continue;
    }

    console.log(`${prefix} — running…`);
    const t0 = Date.now();

    try {
      const buf = readFileSync(mediaPath);
      const mime = mimeFromExt(mediaPath);
      const perspective = clip.ground_truth.ego_perspective === false ? "adverse" : "insured";

      const sharedFrames = mime.startsWith("video/")
        ? await extractVideoFrames(buf, mime)
        : null;
      if (mime.startsWith("video/") && (!sharedFrames || sharedFrames.length === 0)) {
        throw new Error("No frames extracted from video");
      }

      // ── Run models (same JPEG bundle for video = identical visual input) ───
      const modelPromises: Promise<ModelResult>[] = [
        (sharedFrames
          ? analyzeEvidenceWithGeminiFromFrames(sharedFrames, perspective)
          : analyzeEvidenceWithGemini(buf, mime, perspective)
        ).then((r) => ({
          provider: "gemini" as const,
          ...r,
        })),
      ];

      if (!geminiOnly) {
        modelPromises.push(
          (sharedFrames
            ? analyzeEvidenceWithOpenAIFromFrames(sharedFrames, perspective)
            : analyzeEvidenceWithOpenAI(buf, mime, perspective)
          ).then((r) => ({
            provider: "openai" as const,
            ...r,
          })),
          (sharedFrames
            ? analyzeEvidenceWithAnthropicFromFrames(sharedFrames, perspective)
            : analyzeEvidenceWithAnthropic(buf, mime, perspective)
          ).then((r) => ({
            provider: "anthropic" as const,
            ...r,
          })),
        );
      }

      const settled = await Promise.allSettled(modelPromises);
      const modelResults: ModelResult[] = [];
      for (const s of settled) {
        if (s.status === "fulfilled") {
          modelResults.push(s.value);
        } else {
          console.warn(`    ⚠ model failed: ${s.reason}`);
        }
      }

      if (modelResults.length === 0) {
        throw new Error("All models failed");
      }

      const consensus = await buildConsensus(modelResults);
      const elapsed = Date.now() - t0;
      totalCost += consensus.total_cost_usd;
      ran++;

      // ── Print model outputs ────────────────────────────────────────────
      for (const r of modelResults) {
        const score = r.analysis.recommended_liability_percent ?? "?";
        const conf  = r.analysis.overall_confidence;
        console.log(`    ${r.provider.padEnd(12)} ${String(score).padStart(3)}% fault  (${conf})`);
      }

      const cs = consensus.analysis.recommended_liability_percent ?? 0;
      const divNote = consensus.consensus.factual_divergence ? " · FACT-DIV" : "";
      console.log(
        `    ${"consensus".padEnd(12)} ${String(cs).padStart(3)}%  (${consensus.consensus.agreement_level}, Δ${consensus.consensus.liability_delta ?? 0}pp)${divNote}  $${fmt(consensus.total_cost_usd)}`,
      );
      if (consensus.consensus.factual_divergence) {
        console.log(`      reasons: ${consensus.consensus.factual_divergence_reasons.join("; ")}`);
      }

      // ── Score against ground truth ─────────────────────────────────────
      const timeline = consensus.analysis.timeline as VlaTimelineEvent[];
      const statutes = matchesFromVlaRaw(consensus.analysis as Parameters<typeof matchesFromVlaRaw>[0]);
      const composite = scoreAll(clip.ground_truth, cs, timeline, statutes);

      // Print scoring details
      console.log(`    Statute:  ${composite.statutes.ok ? "✓" : "✗"}  ${composite.statutes.reasons.join(" | ")}`);
      console.log(`    Liability:${composite.liability.ok ? "✓" : "✗"}  ${composite.liability.reasons.join(" | ")}`);
      console.log(`    Timeline: ${composite.timeline.ok ? "✓" : "✗"}  ${composite.timeline.reasons.slice(0, 3).join(" | ")}${composite.timeline.reasons.length > 3 ? " …" : ""}`);
      console.log(`    ${VERDICT_ICON[composite.verdict]}  (${elapsed}ms)`);
      console.log();

      results.push({
        clip_id:         clip.id,
        state_code:      clip.jurisdiction.state_code,
        skipped:         false,
        consensus_score: cs,
        liability_delta: consensus.consensus.liability_delta,
        agreement_level: consensus.consensus.agreement_level,
        factual_divergence: consensus.consensus.factual_divergence,
        total_cost_usd:  consensus.total_cost_usd,
        per_model:       consensus.consensus.per_model,
        score:           composite,
        elapsed_ms:      elapsed,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`    ❌ ERROR: ${msg}`);
      console.log();
      results.push({
        clip_id:     clip.id,
        state_code:  clip.jurisdiction.state_code,
        skipped:     false,
        error:       msg,
        score:       undefined,
      });
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  const ran_results     = results.filter((r) => !r.skipped && !r.error && r.score);
  const pass            = ran_results.filter((r) => r.score?.verdict === "pass").length;
  const fail            = ran_results.filter((r) => r.score?.verdict === "fail").length;
  const partial         = ran_results.filter((r) => r.score?.verdict === "partial").length;
  const unannotated     = ran_results.filter((r) => r.score?.verdict === "unannotated").length;
  const errors          = results.filter((r) => r.error).length;

  const statutePass  = ran_results.filter((r) => r.score?.statutes.ok).length;
  const liabilityPass = ran_results.filter((r) => r.score?.liability.ok).length;
  const timelinePass  = ran_results.filter((r) => r.score?.timeline.ok).length;

  console.log(hr());
  console.log("  SUMMARY");
  console.log(hr());
  console.log(`  Clips ran:       ${ran}  (${skipped} skipped, ${errors} errored)`);
  console.log(`  Results:         ${pass} pass  ${fail} fail  ${partial} partial  ${unannotated} unannotated`);
  console.log();

  if (ran_results.length > 0) {
    const pct = (n: number) => `${Math.round((n / ran_results.length) * 100)}%`;
    console.log(`  Statute score:   ${statutePass}/${ran_results.length} (${pct(statutePass)})`);
    console.log(`  Liability score: ${liabilityPass}/${ran_results.length} (${pct(liabilityPass)})`);
    console.log(`  Timeline score:  ${timelinePass}/${ran_results.length} (${pct(timelinePass)})`);
    console.log();
  }

  console.log(`  Total cost:      $${fmt(totalCost)}`);

  // ── Write report ──────────────────────────────────────────────────────────

  const resultsDir = resolve(process.cwd(), "eval/results");
  mkdirSync(resultsDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = resolve(resultsDir, `run-${ts}.json`);

  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        run_at:           new Date().toISOString(),
        manifest_label:   manifest.dataset_label,
        mode:             geminiOnly ? "gemini_only" : "all_models",
        clips_ran:        ran,
        clips_skipped:    skipped,
        total_cost_usd:   totalCost,
        summary: {
          pass, fail, partial, unannotated, errors,
          statute_pass_rate:   ran_results.length ? statutePass  / ran_results.length : null,
          liability_pass_rate: ran_results.length ? liabilityPass / ran_results.length : null,
          timeline_pass_rate:  ran_results.length ? timelinePass  / ran_results.length : null,
        },
        clips: results,
      },
      null,
      2,
    ),
  );

  console.log(`  Report:          ${reportPath}`);
  console.log(hr());
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
