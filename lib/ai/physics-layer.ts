/**
 * Physics sanity layer — rule-based bounds checks on VLA output.
 *
 * These are coarse heuristics, not physics simulations. The goal is to flag
 * clearly implausible claims in the model output so adjusters know to look
 * more carefully. All thresholds are conservative; false positives are
 * preferable to silent acceptance of hallucinated values.
 *
 * Checks performed:
 *   1. deceleration_plausible   — claimed impact speed vs timeline gap
 *   2. reaction_time_plausible  — gap between first hazard event and evasive action
 *   3. timeline_consistent      — events are in chronological order with no gaps > 5 min
 *   4. liability_range_valid    — recommended_liability_percent is 0–100
 *   5. event_count_reasonable   — timeline has ≥1 and ≤50 events
 */

import type { VlaAnalysis } from "@/lib/ai/vla-schemas";
import type { PhysicsFlags, PhysicsCheck } from "@/lib/ai/vla-schemas";

/** Typical emergency braking deceleration range (m/s²). */
const MIN_DECEL_G = 0.3; // 0.3g — wet road, cautious stop
const MAX_DECEL_G = 1.1; // 1.1g — dry road, ABS hard stop

const G = 9.81; // m/s²

/** Typical human perception + reaction time range (seconds). */
const MIN_REACTION_S = 0.5;
const MAX_REACTION_S = 3.0; // upper bound before it's "no reaction"

/** Maximum plausible gap between consecutive timeline events in a single clip (seconds). */
const MAX_EVENT_GAP_S = 300; // 5 minutes

/**
 * Extract a numeric speed value from free-text descriptions like
 * "45 mph", "45mph", "60 km/h", "30 kph". Returns km/h.
 */
function extractSpeedKph(text: string): number | null {
  const mphMatch = text.match(/(\d+(?:\.\d+)?)\s*mph/i);
  if (mphMatch) return parseFloat(mphMatch[1]) * 1.60934;

  const kphMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:km\/h|kph)/i);
  if (kphMatch) return parseFloat(kphMatch[1]);

  return null;
}

/**
 * Check 1: Deceleration plausibility.
 *
 * If the timeline mentions a speed AND an event gap during which a stop must
 * have occurred, verify the implied deceleration is within human/vehicle bounds.
 *
 * We look for consecutive events where the action text mentions "stop", "brake",
 * or "collision" and extract the speed from the preceding event.
 */
function checkDeceleration(analysis: VlaAnalysis): PhysicsCheck {
  const events = analysis.timeline;
  if (events.length < 2) {
    return { check: "deceleration_plausible", result: "skipped", detail: "Fewer than 2 timeline events" };
  }

  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const curr = events[i];

    const isStopEvent = /stop|brake|collision|impact|crash|skid/i.test(curr.action);
    if (!isStopEvent) continue;

    const speedKph = extractSpeedKph(prev.action) ?? extractSpeedKph(prev.adjuster_observation ?? "");
    if (!speedKph) continue;

    const timeDeltaS =
      (curr.timestamp_seconds ?? 0) - (prev.timestamp_seconds ?? 0);
    if (timeDeltaS <= 0) continue;

    const speedMps = speedKph / 3.6;
    const impliedDecelG = speedMps / timeDeltaS / G;

    if (impliedDecelG < MIN_DECEL_G) {
      return {
        check: "deceleration_plausible",
        result: "warn",
        detail: `Implied deceleration ${impliedDecelG.toFixed(2)}g from ${speedKph.toFixed(0)} km/h over ${timeDeltaS.toFixed(1)}s is lower than expected (min ${MIN_DECEL_G}g). Clip may not capture full stop.`,
      };
    }

    if (impliedDecelG > MAX_DECEL_G) {
      return {
        check: "deceleration_plausible",
        result: "warn",
        detail: `Implied deceleration ${impliedDecelG.toFixed(2)}g from ${speedKph.toFixed(0)} km/h over ${timeDeltaS.toFixed(1)}s exceeds maximum expected (${MAX_DECEL_G}g). Speed or timing may be misread.`,
      };
    }

    return {
      check: "deceleration_plausible",
      result: "pass",
      detail: `Implied deceleration ${impliedDecelG.toFixed(2)}g within expected bounds.`,
    };
  }

  return {
    check: "deceleration_plausible",
    result: "skipped",
    detail: "No speed + stop event pair found in timeline",
  };
}

/**
 * Check 2: Reaction time plausibility.
 *
 * Look for a hazard event (lane change, red light, stop sign) followed by an
 * evasive action (brake, swerve). The gap should be within human reaction bounds.
 */
function checkReactionTime(analysis: VlaAnalysis): PhysicsCheck {
  const events = analysis.timeline;
  if (events.length < 2) {
    return { check: "reaction_time_plausible", result: "skipped", detail: "Fewer than 2 timeline events" };
  }

  const hazardKeywords = /lane change|red light|stop sign|cut off|merge|pedestrian|bicycle/i;
  const evasiveKeywords = /brake|swerve|steer|horn|evade|avoid|reaction/i;

  for (let i = 0; i < events.length - 1; i++) {
    const hazard = events[i];
    const response = events[i + 1];

    const isHazard = hazardKeywords.test(hazard.action) || hazardKeywords.test(hazard.adjuster_observation ?? "");
    const isEvasive = evasiveKeywords.test(response.action) || evasiveKeywords.test(response.adjuster_observation ?? "");

    if (!isHazard || !isEvasive) continue;

    const gapS = (response.timestamp_seconds ?? 0) - (hazard.timestamp_seconds ?? 0);
    if (gapS < 0) continue;

    if (gapS < MIN_REACTION_S) {
      return {
        check: "reaction_time_plausible",
        result: "warn",
        detail: `Reaction gap of ${gapS.toFixed(1)}s between hazard and evasion is unusually short (< ${MIN_REACTION_S}s). Timestamps may be imprecise.`,
      };
    }

    if (gapS > MAX_REACTION_S) {
      return {
        check: "reaction_time_plausible",
        result: "warn",
        detail: `Reaction gap of ${gapS.toFixed(1)}s between hazard and evasion exceeds expected range (> ${MAX_REACTION_S}s). Consider whether insured had adequate warning.`,
      };
    }

    return {
      check: "reaction_time_plausible",
      result: "pass",
      detail: `Reaction time ${gapS.toFixed(1)}s within expected range.`,
    };
  }

  return {
    check: "reaction_time_plausible",
    result: "skipped",
    detail: "No hazard + evasion pair identified in timeline",
  };
}

/**
 * Check 3: Timeline chronological consistency.
 *
 * Events must be in non-decreasing timestamp order, and gaps must not exceed
 * MAX_EVENT_GAP_S (which would suggest the model invented events outside the clip).
 */
function checkTimelineConsistency(analysis: VlaAnalysis): PhysicsCheck {
  const events = analysis.timeline;
  if (events.length < 2) {
    return { check: "timeline_consistent", result: "skipped", detail: "Fewer than 2 timeline events" };
  }

  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const curr = events[i];
    const prevTs = prev.timestamp_seconds ?? 0;
    const currTs = curr.timestamp_seconds ?? 0;

    if (currTs < prevTs) {
      return {
        check: "timeline_consistent",
        result: "fail",
        detail: `Event at index ${i} (${currTs}s) occurs before previous event (${prevTs}s) — timeline is not chronological.`,
      };
    }

    const gap = currTs - prevTs;
    if (gap > MAX_EVENT_GAP_S) {
      return {
        check: "timeline_consistent",
        result: "warn",
        detail: `Gap of ${gap.toFixed(0)}s between events at ${prevTs}s and ${currTs}s exceeds expected clip length. Model may have invented a distant timestamp.`,
      };
    }
  }

  return { check: "timeline_consistent", result: "pass" };
}

/**
 * Check 4: Liability percent is in valid range.
 */
function checkLiabilityRange(analysis: VlaAnalysis): PhysicsCheck {
  const pct = analysis.recommended_liability_percent;
  if (pct == null) {
    return { check: "liability_range_valid", result: "skipped", detail: "No recommended_liability_percent" };
  }
  if (pct < 0 || pct > 100) {
    return {
      check: "liability_range_valid",
      result: "fail",
      detail: `recommended_liability_percent ${pct} is outside 0–100 range.`,
    };
  }
  return { check: "liability_range_valid", result: "pass" };
}

/**
 * Check 5: Timeline has a reasonable number of events.
 */
function checkEventCount(analysis: VlaAnalysis): PhysicsCheck {
  const count = analysis.timeline.length;
  if (count === 0) {
    return {
      check: "event_count_reasonable",
      result: "warn",
      detail: "Timeline contains no events — model may have failed to identify any activity.",
    };
  }
  if (count > 50) {
    return {
      check: "event_count_reasonable",
      result: "warn",
      detail: `Timeline contains ${count} events, which is unusually high. Some may be hallucinated.`,
    };
  }
  return { check: "event_count_reasonable", result: "pass", detail: `${count} events` };
}

/**
 * Run all physics checks on a VLA analysis result.
 * Returns a PhysicsFlags object with per-check results and an overall verdict.
 */
export function runPhysicsChecks(analysis: VlaAnalysis): PhysicsFlags {
  const checks: PhysicsCheck[] = [
    checkDeceleration(analysis),
    checkReactionTime(analysis),
    checkTimelineConsistency(analysis),
    checkLiabilityRange(analysis),
    checkEventCount(analysis),
  ];

  const resultValues = checks.map((c) => c.result);
  const overall =
    resultValues.includes("fail")
      ? "fail"
      : resultValues.includes("warn")
        ? "warn"
        : "pass";

  return { checks, overall };
}
