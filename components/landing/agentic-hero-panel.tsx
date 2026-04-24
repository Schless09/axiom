"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, FileVideo, Loader2 } from "lucide-react";

const STEPS = [
  { at: 500, id: 1 }, // evidence received
  { at: 1300, id: 2 }, // reviewing footage bar
  { at: 2400, id: 3 }, // finding 1
  { at: 3200, id: 4 }, // finding 2
  { at: 3900, id: 5 }, // finding 3 + statute
  { at: 4800, id: 6 }, // score
  { at: 5500, id: 7 }, // ready for review
];

type HeroFinding = { time: string; text: string; insuredShare: number };

type ScoreTone = "favorable" | "adverse" | "mixed";

export type HeroDemoScenario = {
  claimId: string;
  claimMeta: string;
  fileLine: string;
  findings: HeroFinding[];
  statuteCitation: string;
  statuteContext: string;
  scorePercent: number;
  scoreSubtext: string;
  scoreTone: ScoreTone;
  completedIn: string;
};

/** Marketing hero rotates client-side on each page load — see `AgenticHeroPanel`. */
export const HERO_DEMO_SCENARIOS: readonly HeroDemoScenario[] = [
  {
    claimId: "CLM-2A4F9B",
    claimMeta: "Illinois · Feb 22, 2024",
    fileLine: "dashcam_il_2024_02_22.mp4 · Insured vehicle",
    findings: [
      { time: "0:00", text: "Insured traveling at safe following distance", insuredShare: 0 },
      { time: "0:04", text: "Third party initiated abrupt lane change into insured's lane", insuredShare: 0 },
      { time: "0:08", text: "Insured braked and maintained lane — no evasive fault", insuredShare: 0 },
    ],
    statuteCitation: "625 ILCS 5/11-709",
    statuteContext:
      "— right-of-way / lane change (for context; adjuster applies facts)",
    scorePercent: 0,
    scoreSubtext: "~0% insured — models agree; not a determination",
    scoreTone: "favorable",
    completedIn: "Completed in 1m 38s",
  },
  {
    claimId: "CLM-8K3M21",
    claimMeta: "Arizona · Jan 14, 2025",
    fileLine: "rear_cam_az_2025_01_14.mp4 · Insured vehicle",
    findings: [
      { time: "0:00", text: "Insured closes distance in stop-and-go traffic", insuredShare: 35 },
      { time: "0:05", text: "Traffic ahead slows; insured brakes late — following too close", insuredShare: 75 },
      { time: "0:07", text: "Rear-end impact; no sudden maneuver by lead vehicle visible", insuredShare: 85 },
    ],
    statuteCitation: "ARS 28-730",
    statuteContext:
      "— reasonable and prudent speed / following distance (for context; adjuster applies facts)",
    scorePercent: 78,
    scoreSubtext: "~75–85% insured — rear-end prima facie; not a determination",
    scoreTone: "adverse",
    completedIn: "Completed in 1m 52s",
  },
  {
    claimId: "CLM-5P9Q88",
    claimMeta: "California · Nov 2, 2024",
    fileLine: "side_dash_ca_2024_11_02.mp4 · Insured vehicle",
    findings: [
      { time: "0:00", text: "Parallel lanes; both vehicles signal toward the same gap", insuredShare: 15 },
      { time: "0:06", text: "Insured merges with marginal clearance — shared uncertainty", insuredShare: 45 },
      { time: "0:09", text: "Sideswipe contact; each party claims the other encroached", insuredShare: 50 },
    ],
    statuteCitation: "CVC 21658",
    statuteContext: "— unsafe lane change (for context; adjuster applies facts)",
    scorePercent: 45,
    scoreSubtext: "~40–55% insured — mixed maneuvers; reserve judgment",
    scoreTone: "mixed",
    completedIn: "Completed in 2m 04s",
  },
] as const;

export const HERO_DEMO_SCENARIO_COUNT = HERO_DEMO_SCENARIOS.length;

function insuredShareClass(share: number): string {
  if (share <= 0) return "text-emerald-600 dark:text-emerald-400";
  if (share < 50) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

const SCORE_TONE_STYLES: Record<
  ScoreTone,
  { wrap: string; ring: string; value: string }
> = {
  favorable: {
    wrap: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30",
    ring: "border-emerald-500 bg-white dark:bg-emerald-950",
    value: "text-emerald-600 dark:text-emerald-400",
  },
  adverse: {
    wrap: "border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/30",
    ring: "border-rose-500 bg-white dark:bg-rose-950",
    value: "text-rose-600 dark:text-rose-400",
  },
  mixed: {
    wrap: "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30",
    ring: "border-amber-500 bg-white dark:bg-amber-950",
    value: "text-amber-700 dark:text-amber-400",
  },
};

function pickScenario(variantIndex: number | undefined): HeroDemoScenario {
  const list = HERO_DEMO_SCENARIOS;
  const n = list.length;
  if (n === 0) {
    throw new Error("HERO_DEMO_SCENARIOS must not be empty");
  }
  const v = Number(variantIndex);
  // `undefined % n` is NaN; `array[NaN]` is undefined — guard for missing/invalid props.
  const idx =
    Number.isFinite(v) ? ((Math.trunc(v) % n) + n) % n : 0;
  return list[idx] ?? list[0];
}

/**
 * Hero demo scenario is chosen in the browser on each full page load so localhost
 * and CDN caches don’t freeze one variant. Brief pulse placeholder avoids SSR/hydration mismatch.
 */
export function AgenticHeroPanel() {
  const [scenarioIdx, setScenarioIdx] = useState<number | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setScenarioIdx(Math.floor(Math.random() * HERO_DEMO_SCENARIO_COUNT));
  }, []);

  useEffect(() => {
    if (scenarioIdx === null) return;
    setStep(0);
    const timers = STEPS.map(({ at, id }) => setTimeout(() => setStep(id), at));
    return () => timers.forEach(clearTimeout);
  }, [scenarioIdx]);

  if (scenarioIdx === null) {
    return (
      <div
        className="min-h-[520px] animate-pulse overflow-hidden rounded-2xl border border-border/80 bg-muted/40 shadow-2xl"
        aria-hidden
      />
    );
  }

  const scenario = pickScenario(scenarioIdx);
  const tone = SCORE_TONE_STYLES[scenario.scoreTone];

  const show = (min: number) => step >= min;
  const analyzing = step >= 2 && step < 6;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-3.5">
        <div>
          <p className="text-sm font-semibold">{scenario.claimId}</p>
          <p className="text-xs text-muted-foreground">{scenario.claimMeta}</p>
        </div>
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-500",
            step >= 7
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : analyzing
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "bg-muted text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              step >= 7
                ? "bg-emerald-500"
                : analyzing
                  ? "bg-amber-500 animate-pulse"
                  : "bg-muted-foreground/50",
            )}
          />
          {step >= 7 ? "Ready for review" : analyzing ? "Analyzing" : "Pending"}
        </span>
      </div>

      <div className="divide-y divide-border/60">
        {/* ── Step 1: Evidence received ───────────────────────── */}
        <div
          className={cn(
            "grid transition-all duration-500 ease-out",
            show(1) ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="flex items-start gap-3 px-5 py-4">
              <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                <FileVideo className="size-3.5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Evidence received</p>
                <p className="text-xs text-muted-foreground">{scenario.fileLine}</p>
              </div>
              <CheckCircle2 className="ml-auto mt-0.5 size-4 shrink-0 text-emerald-500" />
            </div>
          </div>
        </div>

        {/* ── Step 2: Reviewing footage ───────────────────────── */}
        <div
          className={cn(
            "grid transition-all duration-500 ease-out",
            show(2) ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="px-5 py-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Reviewing footage</p>
                {step < 6 ? (
                  <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <Loader2 className="size-3 animate-spin" />
                    In progress
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3" />
                    Complete
                  </span>
                )}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-[2000ms] ease-out"
                  style={{ width: step >= 6 ? "100%" : step >= 2 ? "65%" : "0%" }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Steps 3–5: Findings ────────────────────────────── */}
        <div
          className={cn(
            "grid transition-all duration-500 ease-out",
            show(3) ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="px-5 py-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Incident findings
              </p>
              <p className="mb-2 text-[10px] text-muted-foreground/90">
                Indicative insured share per segment (not a final fault call)
              </p>
              <ul className="space-y-2">
                {scenario.findings.map((f, i) => (
                  <li
                    key={`${scenario.claimId}-${f.time}-${i}`}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-xs transition-all duration-500",
                      show(3 + i) ? "bg-muted/60 opacity-100" : "bg-muted/20 opacity-0",
                    )}
                  >
                    <Clock className="size-3 shrink-0 text-muted-foreground" />
                    <span className="w-8 shrink-0 font-mono text-muted-foreground">{f.time}</span>
                    <span className="flex-1">{f.text}</span>
                    <span
                      className="shrink-0 text-right text-[10px] text-muted-foreground"
                      title="Modeled range for this segment"
                    >
                      <span
                        className={cn(
                          "block font-semibold tabular-nums",
                          insuredShareClass(f.insuredShare),
                        )}
                      >
                        {f.insuredShare}%
                      </span>
                      <span className="font-normal">insured</span>
                    </span>
                  </li>
                ))}
              </ul>

              {/* Statute */}
              <div
                className={cn(
                  "mt-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 transition-all duration-500",
                  show(5) ? "opacity-100" : "opacity-0",
                )}
              >
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Rule reference (supporting):</span>{" "}
                  <span className="font-mono">{scenario.statuteCitation}</span> {scenario.statuteContext}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Step 6: Score ──────────────────────────────────── */}
        <div
          className={cn(
            "grid transition-all duration-700 ease-out",
            show(6) ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="px-5 py-4">
              <div
                className={cn(
                  "flex items-center gap-4 rounded-xl border px-4 py-4",
                  tone.wrap,
                )}
              >
                <div
                  className={cn(
                    "flex size-14 shrink-0 items-center justify-center rounded-full border-2",
                    tone.ring,
                  )}
                >
                  <span className={cn("text-2xl font-bold tabular-nums", tone.value)}>
                    {scenario.scorePercent}%
                  </span>
                </div>
                <div>
                  <p className="font-semibold">Comparative fault (modeled range)</p>
                  <p className="text-sm text-muted-foreground">{scenario.scoreSubtext}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Step 7: CTA ────────────────────────────────────── */}
        <div
          className={cn(
            "grid transition-all duration-500 ease-out",
            show(7) ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="flex items-center justify-between bg-muted/20 px-5 py-3.5">
              <p className="text-xs text-muted-foreground">{scenario.completedIn}</p>
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
              >
                Open review package →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
