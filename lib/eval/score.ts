import type { EvalGroundTruth, EvalKeyEvent } from "@/lib/eval/manifest";

export type MatchedStatute = {
  statute_code: string;
  violation_type: string | null;
};

export type VlaTimelineEvent = {
  timestamp_seconds?: number;
  frame_index?: number;
  evidence_span?: { start_seconds: number; end_seconds: number };
  action: string;
  suggested_liability_percent: number;
};

/** Strip `statute_matches` from stored `vla_analysis_raw` JSON into the shape used by `scoreStatutes`. */
export function matchesFromVlaRaw(vla: {
  statute_matches?: Array<{
    statute: { statute_code: string; violation_type: string | null } | null;
  }>;
}): MatchedStatute[] {
  const out: MatchedStatute[] = [];
  for (const m of vla.statute_matches ?? []) {
    if (m.statute) {
      out.push({
        statute_code: m.statute.statute_code,
        violation_type: m.statute.violation_type,
      });
    }
  }
  return out;
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "_");
}

export type ScoreResult = {
  ok: boolean;
  /** Human-readable reasons for pass/fail. */
  reasons: string[];
};

// ── Statute scoring (original, unchanged) ───────────────────────────────────

/**
 * Score whether analysis-linked statutes satisfy the manifest ground truth for one clip.
 * Does not judge timeline quality — only statute / violation alignment.
 */
export function scoreStatutes(
  expected: EvalGroundTruth,
  matches: MatchedStatute[],
): ScoreResult {
  const reasons: string[] = [];
  const codes = new Set(matches.map((m) => m.statute_code.trim()));
  const violations = matches
    .map((m) => m.violation_type)
    .filter((v): v is string => v != null && v.length > 0)
    .map(norm);

  let ok = true;

  if (expected.statute_codes_any?.length) {
    const hit = expected.statute_codes_any.some((c) => codes.has(c.trim()));
    if (!hit) {
      ok = false;
      reasons.push(
        `statute_codes_any: wanted one of [${expected.statute_codes_any.join(", ")}]; got [${[...codes].join(", ")}]`,
      );
    } else {
      reasons.push("statute_codes_any: ✓ satisfied");
    }
  }

  if (expected.violation_types_any?.length) {
    const wanted = expected.violation_types_any.map(norm);
    const hit = wanted.some((w) => violations.includes(w));
    if (!hit) {
      ok = false;
      reasons.push(
        `violation_types_any: wanted one of [${expected.violation_types_any.join(", ")}]; got [${violations.join(", ")}]`,
      );
    } else {
      reasons.push("violation_types_any: ✓ satisfied");
    }
  }

  if (expected.violation_types_all?.length) {
    const wanted = expected.violation_types_all.map(norm);
    const missing = wanted.filter((w) => !violations.includes(w));
    if (missing.length) {
      ok = false;
      reasons.push(`violation_types_all: missing [${missing.join(", ")}]`);
    } else {
      reasons.push("violation_types_all: ✓ satisfied");
    }
  }

  if (
    !expected.statute_codes_any?.length &&
    !expected.violation_types_any?.length &&
    !expected.violation_types_all?.length
  ) {
    reasons.push("no statute criteria — annotate ground_truth when ready");
  }

  return { ok, reasons };
}

/** @deprecated Use scoreStatutes for clarity. */
export const scoreGroundTruth = scoreStatutes;

// ── Liability scoring (new) ──────────────────────────────────────────────────

/**
 * Score whether the consensus liability score falls within the annotated range
 * and matches the expected fault party direction.
 */
export function scoreLiability(
  expected: EvalGroundTruth,
  consensusScore: number,
): ScoreResult {
  const reasons: string[] = [];
  let ok = true;
  let hasCriteria = false;

  if (expected.expected_liability_min != null) {
    hasCriteria = true;
    if (consensusScore < expected.expected_liability_min) {
      ok = false;
      reasons.push(
        `expected_liability_min: score ${consensusScore}% is below floor ${expected.expected_liability_min}%`,
      );
    } else {
      reasons.push(`expected_liability_min: ✓ ${consensusScore}% ≥ ${expected.expected_liability_min}%`);
    }
  }

  if (expected.expected_liability_max != null) {
    hasCriteria = true;
    if (consensusScore > expected.expected_liability_max) {
      ok = false;
      reasons.push(
        `expected_liability_max: score ${consensusScore}% exceeds ceiling ${expected.expected_liability_max}%`,
      );
    } else {
      reasons.push(`expected_liability_max: ✓ ${consensusScore}% ≤ ${expected.expected_liability_max}%`);
    }
  }

  if (expected.fault_party != null) {
    hasCriteria = true;
    const direction = faultDirection(consensusScore);
    const expectedDirection = faultDirection(
      expected.fault_party === "insured" ? 75
      : expected.fault_party === "third_party" ? 10
      : expected.fault_party === "shared" ? 50
      : 0,
    );

    // Directional check: insured-fault means score > 25; no-fault means score <= 25
    const directionOk = faultDirectionMatches(expected.fault_party, consensusScore);
    if (!directionOk) {
      ok = false;
      reasons.push(
        `fault_party: expected ${expected.fault_party} (direction: ${expectedDirection}), got score ${consensusScore}% (direction: ${direction})`,
      );
    } else {
      reasons.push(`fault_party: ✓ ${expected.fault_party} matches score ${consensusScore}%`);
    }
  }

  if (!hasCriteria) {
    reasons.push("no liability criteria — set expected_liability_max / fault_party when ready");
  }

  return { ok, reasons };
}

function faultDirection(score: number): string {
  if (score === 0) return "no_fault";
  if (score <= 25) return "minimal";
  if (score <= 50) return "shared";
  return "insured_fault";
}

function faultDirectionMatches(
  party: NonNullable<EvalGroundTruth["fault_party"]>,
  score: number,
): boolean {
  switch (party) {
    case "none":        return score <= 10;
    case "third_party": return score <= 25;
    case "shared":      return score > 10 && score <= 75;
    case "insured":     return score > 25;
  }
}

// ── Timeline scoring (new) ───────────────────────────────────────────────────

/**
 * Score whether the model's timeline contains all expected key events.
 * Uses case-insensitive substring matching on `action` fields,
 * with optional timestamp window enforcement.
 */
export function scoreTimeline(
  expected: EvalGroundTruth,
  timeline: VlaTimelineEvent[],
): ScoreResult {
  const reasons: string[] = [];
  let ok = true;

  if (!expected.key_events?.length) {
    reasons.push("no key_events criteria — annotate ground_truth when ready");
    return { ok: true, reasons };
  }

  for (const ke of expected.key_events) {
    const match = findKeyEvent(ke, timeline);
    if (!match) {
      ok = false;
      const window =
        ke.timestamp_min != null || ke.timestamp_max != null
          ? ` in window [${ke.timestamp_min ?? 0}s – ${ke.timestamp_max ?? "∞"}s]`
          : "";
      reasons.push(`key_event NOT FOUND: "${ke.action_contains}"${window}`);
    } else {
      const ts = match.timestamp_seconds != null ? ` at t=${match.timestamp_seconds}s` : "";
      reasons.push(`key_event ✓: "${ke.action_contains}" matched "${match.action}"${ts}`);
    }
  }

  return { ok, reasons };
}

function findKeyEvent(
  ke: EvalKeyEvent,
  timeline: VlaTimelineEvent[],
): VlaTimelineEvent | null {
  const needle = ke.action_contains.toLowerCase();
  for (const ev of timeline) {
    if (!ev.action.toLowerCase().includes(needle)) continue;
    const ts = ev.timestamp_seconds ?? 0;
    if (ke.timestamp_min != null && ts < ke.timestamp_min) continue;
    if (ke.timestamp_max != null && ts > ke.timestamp_max) continue;
    return ev;
  }
  return null;
}

// ── Composite scorer ─────────────────────────────────────────────────────────

export type CompositeScore = {
  statutes:  ScoreResult;
  liability: ScoreResult;
  timeline:  ScoreResult;
  /** True only when every dimension that has criteria passes. */
  overall: boolean;
  /** "pass" | "fail" | "partial" | "unannotated" */
  verdict: "pass" | "fail" | "partial" | "unannotated";
};

/**
 * Run all three scorers and return a composite result.
 * `unannotated` is returned when no evaluable criteria exist in any dimension.
 */
export function scoreAll(
  expected: EvalGroundTruth,
  consensusScore: number,
  timeline: VlaTimelineEvent[],
  matches: MatchedStatute[],
): CompositeScore {
  const statutes  = scoreStatutes(expected, matches);
  const liability = scoreLiability(expected, consensusScore);
  const timeline_ = scoreTimeline(expected, timeline);

  const hasCriteria =
    (expected.statute_codes_any?.length ?? 0) > 0 ||
    (expected.violation_types_any?.length ?? 0) > 0 ||
    (expected.violation_types_all?.length ?? 0) > 0 ||
    expected.expected_liability_min != null ||
    expected.expected_liability_max != null ||
    expected.fault_party != null ||
    (expected.key_events?.length ?? 0) > 0;

  if (!hasCriteria) {
    return {
      statutes, liability, timeline: timeline_,
      overall: false,
      verdict: "unannotated",
    };
  }

  const allOk  = statutes.ok && liability.ok && timeline_.ok;
  const anyOk  = statutes.ok || liability.ok || timeline_.ok;
  const verdict = allOk ? "pass" : anyOk ? "partial" : "fail";

  return {
    statutes,
    liability,
    timeline: timeline_,
    overall: allOk,
    verdict,
  };
}
