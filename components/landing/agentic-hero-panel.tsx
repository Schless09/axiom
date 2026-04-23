"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, FileVideo, Loader2 } from "lucide-react";

const STEPS = [
  { at: 500,  id: 1 },  // evidence received
  { at: 1300, id: 2 },  // reviewing footage bar
  { at: 2400, id: 3 },  // finding 1
  { at: 3200, id: 4 },  // finding 2
  { at: 3900, id: 5 },  // finding 3 + statute
  { at: 4800, id: 6 },  // score
  { at: 5500, id: 7 },  // ready for review
];

const FINDINGS = [
  { time: "0:00", text: "Insured traveling at safe following distance", insuredShare: 0 },
  { time: "0:04", text: "Third party initiated abrupt lane change into insured's lane", insuredShare: 0 },
  { time: "0:08", text: "Insured braked and maintained lane — no evasive fault", insuredShare: 0 },
];

export function AgenticHeroPanel() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timers = STEPS.map(({ at, id }) => setTimeout(() => setStep(id), at));
    return () => timers.forEach(clearTimeout);
  }, []);

  const show = (min: number) => step >= min;
  const analyzing = step >= 2 && step < 6;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-3.5">
        <div>
          <p className="text-sm font-semibold">CLM-2A4F9B</p>
          <p className="text-xs text-muted-foreground">Illinois · Feb 22, 2024</p>
        </div>
        <span className={cn(
          "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-500",
          step >= 7
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : analyzing
            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
            : "bg-muted text-muted-foreground"
        )}>
          <span className={cn(
            "size-1.5 rounded-full",
            step >= 7 ? "bg-emerald-500" : analyzing ? "bg-amber-500 animate-pulse" : "bg-muted-foreground/50"
          )} />
          {step >= 7 ? "Ready for review" : analyzing ? "Analyzing" : "Pending"}
        </span>
      </div>

      <div className="divide-y divide-border/60">

        {/* ── Step 1: Evidence received ───────────────────────── */}
        <div className={cn(
          "grid transition-all duration-500 ease-out",
          show(1) ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}>
          <div className="overflow-hidden">
            <div className="flex items-start gap-3 px-5 py-4">
              <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                <FileVideo className="size-3.5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Evidence received</p>
                <p className="text-xs text-muted-foreground">dashcam_il_2024_02_22.mp4 · Insured vehicle</p>
              </div>
              <CheckCircle2 className="ml-auto mt-0.5 size-4 shrink-0 text-emerald-500" />
            </div>
          </div>
        </div>

        {/* ── Step 2: Reviewing footage ───────────────────────── */}
        <div className={cn(
          "grid transition-all duration-500 ease-out",
          show(2) ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}>
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
        <div className={cn(
          "grid transition-all duration-500 ease-out",
          show(3) ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}>
          <div className="overflow-hidden">
            <div className="px-5 py-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Incident findings
              </p>
              <p className="mb-2 text-[10px] text-muted-foreground/90">
                Indicative insured share per segment (not a final fault call)
              </p>
              <ul className="space-y-2">
                {FINDINGS.map((f, i) => (
                  <li
                    key={f.time}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-xs transition-all duration-500",
                      show(3 + i)
                        ? "bg-muted/60 opacity-100"
                        : "bg-muted/20 opacity-0"
                    )}
                  >
                    <Clock className="size-3 shrink-0 text-muted-foreground" />
                    <span className="w-8 shrink-0 font-mono text-muted-foreground">{f.time}</span>
                    <span className="flex-1">{f.text}</span>
                    <span className="shrink-0 text-right text-[10px] text-muted-foreground" title="Modeled range for this segment">
                      <span className="block font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{f.insuredShare}%</span>
                      <span className="font-normal">insured</span>
                    </span>
                  </li>
                ))}
              </ul>

              {/* Statute */}
              <div className={cn(
                "mt-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 transition-all duration-500",
                show(5) ? "opacity-100" : "opacity-0"
              )}>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Rule reference (supporting):</span>{" "}
                  <span className="font-mono">625 ILCS 5/11-709</span>
                  {" "}— right-of-way / lane change (for context; adjuster applies facts)
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Step 6: Score ──────────────────────────────────── */}
        <div className={cn(
          "grid transition-all duration-700 ease-out",
          show(6) ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}>
          <div className="overflow-hidden">
            <div className="px-5 py-4">
              <div className="flex items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-emerald-500 bg-white dark:bg-emerald-950">
                  <span className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">0%</span>
                </div>
                <div>
                  <p className="font-semibold">Comparative fault (modeled range)</p>
                  <p className="text-sm text-muted-foreground">~0% insured — models agree; not a determination</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Step 7: CTA ────────────────────────────────────── */}
        <div className={cn(
          "grid transition-all duration-500 ease-out",
          show(7) ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}>
          <div className="overflow-hidden">
            <div className="flex items-center justify-between bg-muted/20 px-5 py-3.5">
              <p className="text-xs text-muted-foreground">Completed in 1m 38s</p>
              <button className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                Open review package →
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
