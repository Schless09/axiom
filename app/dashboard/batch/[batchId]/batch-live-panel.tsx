"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Download,
  FileCheck,
  GitMerge,
  Scale,
  ScanSearch,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SYNC_INTERVAL_MS = 5000;

type InFlightClaim = { id: string; claimNumber: string; status: "pending" | "analyzing" };

const PIPELINE = [
  {
    title: "Secure ingest",
    detail: "Evidence is pulled from storage and prepared for vision models.",
    icon: Download,
  },
  {
    title: "Evidence classification",
    detail: "A fast vision pass labels the file type and suggests camera perspective.",
    icon: ScanSearch,
  },
  {
    title: "Parallel VLA passes",
    detail: "Gemini, OpenAI, and Claude each read the media independently (whichever keys are configured).",
    icon: Bot,
  },
  {
    title: "Consensus merge",
    detail: "Outputs are reconciled into one structured timeline and liability view.",
    icon: GitMerge,
  },
  {
    title: "Statute alignment",
    detail: "Timeline events are matched against your organization’s statute reference set.",
    icon: Scale,
  },
  {
    title: "Scorecard write-back",
    detail: "Narrative, scores, and audit rows are saved for adjuster review.",
    icon: FileCheck,
  },
] as const;

type Props = {
  pendingCount: number;
  analyzingCount: number;
  inFlightClaims: InFlightClaim[];
};

export function BatchLivePanel({ pendingCount, analyzingCount, inFlightClaims }: Props) {
  const router = useRouter();
  const [secondsUntilSync, setSecondsUntilSync] = useState(
    Math.ceil(SYNC_INTERVAL_MS / 1000),
  );

  useEffect(() => {
    let remaining = Math.ceil(SYNC_INTERVAL_MS / 1000);

    const tick = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        router.refresh();
        remaining = Math.ceil(SYNC_INTERVAL_MS / 1000);
      }
      setSecondsUntilSync(remaining);
    }, 1000);

    return () => clearInterval(tick);
  }, [router]);

  const hasActive = analyzingCount > 0;
  const onlyQueued = !hasActive && pendingCount > 0;

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm">
      {hasActive && (
        <div
          className="pointer-events-none absolute inset-0 opacity-100"
          style={{
            background:
              "linear-gradient(110deg, transparent 35%, color-mix(in oklch, var(--primary) 8%, transparent) 50%, transparent 65%)",
            animation: "batch-live-shimmer 3.5s ease-in-out infinite",
          }}
        />
      )}

      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">What the analysis agent is doing</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Each claim moves through the pipeline below.             Your org runs analyses in parallel; extras stay queued
            until a slot opens.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium tabular-nums text-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/40 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Live · next sync in {secondsUntilSync}s
          </span>
          <span className="text-[11px] text-muted-foreground">
            {analyzingCount} running · {pendingCount} queued
          </span>
        </div>
      </div>

      <div className="relative mt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Per-claim pipeline
        </p>
        <ol className="relative mt-3 list-none space-y-0 pl-2">
          {PIPELINE.map((step, i) => {
            const Icon = step.icon;
            const isLast = i === PIPELINE.length - 1;
            const showQueuedHere = onlyQueued && i === 0;
            const showActiveHere = hasActive;

            return (
              <li
                key={step.title}
                className={cn(
                  "relative flex gap-3 pb-5",
                  isLast && "pb-0",
                )}
              >
                {!isLast && (
                  <span
                    className="absolute left-[1.125rem] top-9 bottom-0 z-0 w-px -translate-x-1/2 bg-border"
                    aria-hidden
                  />
                )}
                <div
                  className={cn(
                    "relative z-[1] flex size-9 shrink-0 items-center justify-center rounded-full border bg-background",
                    showActiveHere && "border-primary/35 text-primary ring-1 ring-primary/15",
                    showQueuedHere && "border-amber-500/45 text-amber-600 dark:text-amber-400",
                    !showActiveHere && !showQueuedHere && "border-border text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </div>
                <div
                  className={cn(
                    "min-w-0 flex-1 rounded-lg py-0.5",
                    showActiveHere && "bg-primary/5",
                    showQueuedHere && !showActiveHere && "bg-amber-500/10",
                  )}
                >
                  <p className="text-xs font-medium text-muted-foreground tabular-nums">Step {i + 1}</p>
                  <p className="font-medium leading-snug">{step.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
        {hasActive && (
          <p className="mt-2 text-xs text-muted-foreground">
            Stages run in order for each claim; total time depends on file size and how many models are enabled.
          </p>
        )}
      </div>

      {inFlightClaims.length > 0 && (
        <div className="relative mt-5 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Activity in this batch
          </p>
          <ul className="mt-2 space-y-2">
            {inFlightClaims.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-1 rounded-md bg-muted/30 px-3 py-2 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-3"
              >
                <span className="shrink-0 font-medium tabular-nums">{c.claimNumber}</span>
                <div className="text-left sm:text-right">
                  {c.status === "pending" ? (
                    <>
                      <span className="font-medium text-amber-600 dark:text-amber-400">Queued</span>
                      <p className="text-xs text-muted-foreground">
                        Waiting for a free slot (max 5 concurrent analyses per org).
                      </p>
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-primary">Running pipeline</span>
                      <p className="text-xs text-muted-foreground">
                        Models and statute matcher are working; video can take a few minutes.
                      </p>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
