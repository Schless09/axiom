import { z } from "zod";

/**
 * Versioned eval manifest: maps clips to expected statute / violation signals for regression and pilot QA.
 * Media files stay out of git — only paths and metadata are committed.
 */

const mediaRefSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("local_relative"),
    /** Relative to repository root (e.g. eval/media/Crash-1500/000001.mp4). */
    path: z.string().min(1),
  }),
  z.object({
    type: z.literal("supabase_evidence"),
    /** When the clip is already loaded as app evidence. */
    claim_id: z.string().uuid(),
    evidence_id: z.string().uuid(),
  }),
]);

/**
 * A key event the model's timeline must contain.
 * `action_contains` is a case-insensitive substring match against the
 * `action` field of each timeline event.
 */
const keyEventSchema = z.object({
  /** Substring that must appear (case-insensitive) in at least one timeline action. */
  action_contains: z.string().min(1),
  /** Optional window — the matching event must fall within [timestamp_min, timestamp_max] seconds. */
  timestamp_min: z.number().optional(),
  timestamp_max: z.number().optional(),
});

const groundTruthSchema = z.object({
  // ── Statute / violation checks (existing) ─────────────────────────────
  /**
   * Soft match: at least one matched statute should have this violation_type
   * (normalized compare in score.ts).
   */
  violation_types_any: z.array(z.string().min(1)).optional(),
  /** At least one match should use this statute_code (exact string after trim). */
  statute_codes_any: z.array(z.string().min(1)).optional(),
  /** Stricter: every listed violation_type should appear among matches (for rich multi-label clips). */
  violation_types_all: z.array(z.string().min(1)).optional(),

  // ── Liability checks (new) ─────────────────────────────────────────────
  /**
   * Who bears primary fault.
   * Used for directional accuracy: did the model assign fault to the right party?
   */
  fault_party: z.enum(["insured", "third_party", "shared", "none"]).optional(),
  /**
   * Consensus liability score must be >= this value (inclusive).
   * Use 0 for "model must not over-score the insured" checks.
   */
  expected_liability_min: z.number().min(0).max(100).optional(),
  /**
   * Consensus liability score must be <= this value (inclusive).
   * Use 0 for clean no-fault clips, 100 for full-fault clips.
   */
  expected_liability_max: z.number().min(0).max(100).optional(),

  // ── Timeline checks (new) ──────────────────────────────────────────────
  /**
   * Events that MUST appear in the model's timeline.
   * All entries must be matched for the timeline check to pass.
   */
  key_events: z.array(keyEventSchema).optional(),

  // ── Metadata ──────────────────────────────────────────────────────────
  /** True when the recording camera is mounted on the insured vehicle. */
  ego_perspective: z.boolean().optional(),
  /** Free-form adjuster / annotator notes (not used in automated scoring). */
  notes: z.string().optional(),
});

export type EvalKeyEvent = z.infer<typeof keyEventSchema>;

const clipSchema = z.object({
  /** Stable id for this row (e.g. ccd-000001). */
  id: z.string().min(1),
  source: z
    .object({
      dataset: z.string().min(1),
      original_id: z.string().optional(),
    })
    .optional(),
  media: mediaRefSchema,
  jurisdiction: z.object({
    state_code: z.string().length(2),
  }),
  ground_truth: groundTruthSchema,
});

export const evalManifestSchema = z.object({
  manifest_version: z.string().min(1),
  dataset_label: z.string().min(1),
  /** ISO date (YYYY-MM-DD) for human traceability. */
  updated_at: z.string().optional(),
  clips: z.array(clipSchema),
});

export type EvalManifest = z.infer<typeof evalManifestSchema>;
export type EvalClip = z.infer<typeof clipSchema>;
export type EvalGroundTruth = z.infer<typeof groundTruthSchema>;

export function parseEvalManifest(raw: unknown): EvalManifest {
  return evalManifestSchema.parse(raw);
}
