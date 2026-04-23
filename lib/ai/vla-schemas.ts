import { z } from "zod";

/** Controlled violation vocabulary — aligns with `statutes.violation_type` column. */
export const VIOLATION_TAGS = [
  "speeding",
  "lane_change",
  "failure_to_yield",
  "improper_turn",
  "following_too_close",
  "running_red_light",
  "running_stop_sign",
  "distracted_driving",
  "reckless_driving",
] as const;

export type ViolationTag = (typeof VIOLATION_TAGS)[number];

/**
 * Expected JSON from VLA — structured for statute matching + human-readable for TPAs / shadow audits.
 * `action` stays machine-oriented for matching; adjuster fields read like file notes.
 */
/** Ternary answers for cross-model factual alignment checks. */
export const materialFactTernary = z.enum(["yes", "no", "uncertain"]);

/**
 * Minimal structured facts every model must output so we can detect incompatible
 * interpretations of the same pixels (e.g. one model sees a left-hook, another sees routine driving).
 */
/**
 * Wall-clock span in the source media where the observation is grounded.
 * `end_seconds` may equal `start_seconds` for a point event.
 */
export const vlaEvidenceSpanSchema = z
  .object({
    start_seconds: z.number().nonnegative(),
    end_seconds: z.number().nonnegative(),
  })
  .transform((s) => ({
    start_seconds: s.start_seconds,
    end_seconds: Math.max(s.start_seconds, s.end_seconds),
  }));

export type VlaEvidenceSpan = z.infer<typeof vlaEvidenceSpanSchema>;

export const materialFactsSchema = z.object({
  /**
   * Another road user's vehicle is clearly visible in motion (not just distant parked cars),
   * such that it could interact with the insured vehicle in this clip.
   */
  another_vehicle_present: materialFactTernary,
  /**
   * Contact, visible collision, clear imminent crash, or an evasive maneuver in direct response
   * to another road user encroaching on the insured's path.
   */
  conflict_or_contact: materialFactTernary,
});

function nullToUndef<T>(v: T | null | undefined): T | undefined {
  return v === null ? undefined : v;
}

export const vlaTimelineEventSchema = z.object({
  timestamp_seconds: z.number().nonnegative(),
  /**
   * When evidence is sequential frames (video → JPEGs), 1-based index of the frame that
   * best supports this event (Frame 1 = earliest). Omit for single-image evidence if N/A.
   */
  frame_index: z.preprocess(nullToUndef, z.number().int().positive().optional()),
  /** Continuous time range in the source clip where this observation is visible / grounded. */
  evidence_span: z.preprocess(nullToUndef, vlaEvidenceSpanSchema.optional()),
  /** Short label for matching (e.g. "improper lane change", "failure to yield"). */
  action: z.string().min(1),
  suggested_liability_percent: z.number().min(0).max(100),
  /** 1–3 sentences in professional adjuster voice (past tense, specific, no "AI" meta-talk). */
  adjuster_observation: z.string().optional(),
  /**
   * One or more controlled vocabulary tags from the VIOLATION_TAGS list.
   * Used for deterministic statute matching — preferred over token-overlap scoring.
   */
  violation_tags: z.array(z.string()).default([]),
  /** Model self-assessed confidence in this specific event observation. */
  confidence: z.enum(["high", "medium", "low"]).optional(),
});

export const vlaAnalysisSchema = z.object({
  /** Required on new prompts — optional in schema for backward compatibility with older stored JSON. */
  material_facts: materialFactsSchema.optional(),
  timeline: z.array(vlaTimelineEventSchema).default([]),
  recommended_liability_percent: z.number().min(0).max(100).optional(),
  /** Brief executive line for dashboards (optional). */
  narrative_summary: z.string().optional(),
  /**
   * Full case-note style narrative: reads like a senior adjuster's file memo (several short paragraphs).
   * Used for pilot readouts and Delta reports — not for statute quoting (that comes from your DB).
   */
  case_file_narrative: z.string().optional(),
  /** Overall confidence level across the full analysis. */
  overall_confidence: z.enum(["high", "medium", "low"]).optional(),
});

export type VlaAnalysis = z.infer<typeof vlaAnalysisSchema>;
export type VlaTimelineEvent = z.infer<typeof vlaTimelineEventSchema>;

export function parseVlaJson(raw: string): VlaAnalysis {
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const parsed: unknown = JSON.parse(cleaned);
  return vlaAnalysisSchema.parse(parsed);
}

// ─────────────────────────────────────────────────────────────────────────────
// Policy document evidence (police reports, recorded statements, repair estimates)
// ─────────────────────────────────────────────────────────────────────────────

export const partySchema = z.object({
  role: z.enum(["insured", "adverse", "witness", "officer", "other"]),
  name: z.string().optional(),
  vehicle: z.string().optional(),
  injuries_reported: z.boolean().optional(),
  statement_summary: z.string().optional(),
});

export const citedViolationSchema = z.object({
  party_role: z.enum(["insured", "adverse", "witness", "other"]),
  violation_description: z.string(),
  statute_reference: z.string().optional(),
  violation_tag: z.string().optional(),
});

export const policyEvidenceSchema = z.object({
  document_type: z.enum([
    "police_report",
    "recorded_statement",
    "witness_statement",
    "repair_estimate",
    "medical_record",
    "other",
  ]),
  incident_date: z.string().optional(),
  incident_location: z.string().optional(),
  parties: z.array(partySchema).default([]),
  violations_cited: z.array(citedViolationSchema).default([]),
  officer_narrative: z.string().optional(),
  fault_determination: z.string().optional(),
  insured_liability_percent: z.number().min(0).max(100).optional(),
  repair_total_usd: z.number().optional(),
  summary: z.string(),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
});

export type PolicyEvidenceAnalysis = z.infer<typeof policyEvidenceSchema>;
export type Party = z.infer<typeof partySchema>;
export type CitedViolation = z.infer<typeof citedViolationSchema>;

export function parsePolicyEvidenceJson(raw: string): PolicyEvidenceAnalysis {
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const parsed: unknown = JSON.parse(cleaned);
  return policyEvidenceSchema.parse(parsed);
}

// ─────────────────────────────────────────────────────────────────────────────
// Damage photo analysis
// ─────────────────────────────────────────────────────────────────────────────

export const damageAreaSchema = z.object({
  location: z.string(),
  severity: z.enum(["minor", "moderate", "severe", "total_loss"]),
  description: z.string(),
});

export const damagePhotoAnalysisSchema = z.object({
  vehicle_identified: z.boolean(),
  damage_areas: z.array(damageAreaSchema).default([]),
  primary_impact_point: z.string().optional(),
  estimated_severity: z.enum(["minor", "moderate", "severe", "total_loss"]).optional(),
  consistent_with_described_mechanism: z
    .enum(["yes", "no", "uncertain"])
    .default("uncertain"),
  airbag_deployment_visible: z.boolean().optional(),
  structural_damage: z.boolean().optional(),
  adjuster_note: z.string(),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
});

export type DamagePhotoAnalysis = z.infer<typeof damagePhotoAnalysisSchema>;

export function parseDamagePhotoJson(raw: string): DamagePhotoAnalysis {
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const parsed: unknown = JSON.parse(cleaned);
  return damagePhotoAnalysisSchema.parse(parsed);
}

// ─────────────────────────────────────────────────────────────────────────────
// Physics sanity flags
// ─────────────────────────────────────────────────────────────────────────────

export const physicsCheckSchema = z.object({
  check: z.string(),
  result: z.enum(["pass", "warn", "fail", "skipped"]),
  detail: z.string().optional(),
});

export const physicsFlagsSchema = z.object({
  checks: z.array(physicsCheckSchema),
  overall: z.enum(["pass", "warn", "fail"]),
});

export type PhysicsCheck = z.infer<typeof physicsCheckSchema>;
export type PhysicsFlags = z.infer<typeof physicsFlagsSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Weather context
// ─────────────────────────────────────────────────────────────────────────────

export const weatherContextSchema = z.object({
  timestamp: z.string(),
  lat: z.number(),
  lon: z.number(),
  description: z.string(),
  temp_c: z.number().optional(),
  visibility_m: z.number().optional(),
  wind_speed_mps: z.number().optional(),
  precipitation_mm: z.number().optional(),
  conditions: z.array(z.string()).default([]),
});

export type WeatherContext = z.infer<typeof weatherContextSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Per-evidence synthesis input
// ─────────────────────────────────────────────────────────────────────────────

export const evidenceSummarySchema = z.object({
  evidence_id: z.string(),
  source_type: z.string(),
  weight: z.number(),
  liability_percent: z.number().min(0).max(100).optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  key_findings: z.array(z.string()).default([]),
});

export type EvidenceSummary = z.infer<typeof evidenceSummarySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Final synthesis result
// ─────────────────────────────────────────────────────────────────────────────

export const consistencyCheckSchema = z.object({
  aspect: z.string(),
  result: z.enum(["consistent", "inconsistent", "inconclusive"]),
  detail: z.string().optional(),
});

export const synthesisResultSchema = z.object({
  final_liability_percent: z.number().min(0).max(100).optional(),
  confidence: z.enum(["high", "medium", "low"]),
  evidence_count: z.number(),
  evidence_summaries: z.array(evidenceSummarySchema),
  consistency_checks: z.array(consistencyCheckSchema).default([]),
  physics_flags: physicsFlagsSchema.optional(),
  weather_context: weatherContextSchema.optional(),
  synthesis_narrative: z.string(),
  review_required: z.boolean(),
  review_reasons: z.array(z.string()).default([]),
  sources_used: z.array(z.string()).default([]),
});

export type SynthesisResult = z.infer<typeof synthesisResultSchema>;
export type ConsistencyCheck = z.infer<typeof consistencyCheckSchema>;
