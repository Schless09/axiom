import type { SupabaseClient } from "@supabase/supabase-js";
import type { VlaTimelineEvent } from "@/lib/ai/vla-schemas";

export type StatuteRow = {
  id: string;
  state_code: string;
  statute_code: string;
  description: string;
  violation_type: string | null;
};

export type MatchedStatute = {
  event: VlaTimelineEvent;
  statute: StatuteRow | null;
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Token-overlap fallback scorer (used when no violation_tag matches).
 * Compares the free-text action against violation_type and description.
 */
function scoreTokenOverlap(actionNorm: string, violation: string | null, desc: string): number {
  let score = 0;
  if (violation) {
    const v = normalize(violation);
    if (actionNorm.includes(v) || v.includes(actionNorm.split(" ")[0] ?? "")) score += 3;
    if (actionNorm.split(" ").some((w) => w.length > 3 && v.includes(w))) score += 2;
  }
  const d = normalize(desc);
  const words = actionNorm.split(" ").filter((w) => w.length > 4);
  for (const w of words) {
    if (d.includes(w)) score += 1;
  }
  return score;
}

/**
 * Match AI timeline events to rows in the `statutes` table for the claim's state.
 *
 * Strategy (in priority order):
 *  1. If the event carries `violation_tags`, try exact `violation_type` match for each tag.
 *     The first statute whose `violation_type` matches any tag wins (score = 10).
 *  2. Fall back to token-overlap scoring against `action` free text.
 *  3. Return null if best score < 1.
 */
export async function matchStatutesForEvents(
  supabase: SupabaseClient,
  stateCode: string,
  events: VlaTimelineEvent[],
): Promise<MatchedStatute[]> {
  const upper = stateCode.toUpperCase();
  const { data: rows, error } = await supabase
    .from("statutes")
    .select("id, state_code, statute_code, description, violation_type")
    .eq("state_code", upper);

  if (error) throw new Error(error.message);
  const statutes = (rows ?? []) as StatuteRow[];

  return events.map((event) => {
    // Skip events that show no fault and carry no violation tags — these are
    // descriptive observations, not violations, and should not be statute-matched.
    const hasViolationTags = event.violation_tags && event.violation_tags.length > 0;
    const hasFault = (event.suggested_liability_percent ?? 0) > 0;
    if (!hasViolationTags && !hasFault) {
      return { event, statute: null };
    }

    // --- Pass 1: exact violation_tag matching ---
    if (hasViolationTags) {
      for (const tag of event.violation_tags!) {
        const tagNorm = normalize(tag);
        const exactMatch = statutes.find(
          (s) => s.violation_type && normalize(s.violation_type) === tagNorm,
        );
        if (exactMatch) return { event, statute: exactMatch };
      }
    }

    // --- Pass 2: token-overlap fallback (only for events with actual fault) ---
    const actionNorm = normalize(event.action);
    let best: StatuteRow | null = null;
    let bestScore = 0;
    for (const s of statutes) {
      const sc = scoreTokenOverlap(actionNorm, s.violation_type, s.description);
      if (sc > bestScore) {
        bestScore = sc;
        best = s;
      }
    }
    // Require a minimum score of 2 to avoid spurious matches on common words
    if (bestScore < 2) best = null;
    return { event, statute: best };
  });
}
