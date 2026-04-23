"use client";

import { useRef, useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type EvidenceSpan = {
  start_seconds?: number;
  end_seconds?: number;
};

type TimelineEvent = {
  timestamp_seconds?: number;
  frame_index?: number;
  evidence_span?: EvidenceSpan;
  action?: string;
  suggested_liability_percent?: number;
  adjuster_observation?: string;
  confidence?: "high" | "medium" | "low";
  violation_tags?: string[];
};

type StatuteMatch = {
  action?: string;
  timestamp_seconds?: number;
  frame_index?: number;
  evidence_span?: EvidenceSpan;
  statute?: { statute_code?: string; description?: string } | null;
};

function seekSecondsForEvent(row: TimelineEvent): number | undefined {
  const span = row.evidence_span;
  if (span && typeof span.start_seconds === "number") return span.start_seconds;
  if (typeof row.timestamp_seconds === "number") return row.timestamp_seconds;
  return undefined;
}

function formatTimelineInstant(row: TimelineEvent): string {
  const span = row.evidence_span;
  if (
    span &&
    typeof span.start_seconds === "number" &&
    typeof span.end_seconds === "number" &&
    span.end_seconds !== span.start_seconds
  ) {
    return `${span.start_seconds.toFixed(1)}–${span.end_seconds.toFixed(1)}s`;
  }
  if (span && typeof span.start_seconds === "number") {
    return `${span.start_seconds.toFixed(1)}s`;
  }
  if (typeof row.timestamp_seconds === "number") {
    return `${row.timestamp_seconds.toFixed(1)}s`;
  }
  return "—";
}

type Props = {
  mediaUrl: string | null;
  fileType: string | undefined;
  timeline: TimelineEvent[];
  statuteMatches: StatuteMatch[];
  summary?: string | null;
  claimStatus?: string;
};

const CONFIDENCE_DOT: Record<string, string> = {
  high: "bg-emerald-500",
  medium: "bg-amber-400",
  low: "bg-red-500",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence — review carefully",
};

export function EvidencePlayer({ mediaUrl, fileType, timeline, statuteMatches, summary, claimStatus }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoError, setVideoError] = useState(false);

  const seekTo = useCallback((seconds: number | undefined) => {
    if (videoRef.current && typeof seconds === "number") {
      videoRef.current.currentTime = seconds;
      videoRef.current.play().catch(() => {});
    }
  }, []);

  return (
    <div className="grid flex-1 gap-6 lg:grid-cols-2">
      {/* Evidence media */}
      <Card className="min-h-[320px] overflow-hidden lg:min-h-[480px]">
        <CardHeader>
          <CardTitle className="text-base">Evidence</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {fileType === "video" && mediaUrl ? (
            <div className="relative">
              {!videoError ? (
                <video
                  ref={videoRef}
                  className="aspect-video w-full bg-black"
                  controls
                  preload="metadata"
                  onError={() => setVideoError(true)}
                >
                  <source src={mediaUrl} type="video/mp4" onError={() => setVideoError(true)} />
                  Your browser does not support video playback.
                </video>
              ) : null}
              {videoError ? (
                <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-muted/40 text-center text-sm">
                  <p className="text-muted-foreground">Video failed to load in the browser.</p>
                  <a
                    href={mediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    Open video in new tab ↗
                  </a>
                </div>
              ) : (
                <div className="flex justify-end px-3 py-1.5">
                  <a
                    href={mediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground/60 hover:text-muted-foreground"
                  >
                    Open in new tab ↗
                  </a>
                </div>
              )}
            </div>
          ) : fileType === "image" && mediaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl} alt="Claim evidence" className="max-h-[480px] w-full object-contain" />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">
              Could not create a signed URL for this file. Check Storage policies and the `evidence` bucket.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Notes + timeline */}
      <Card className="flex min-h-[320px] flex-col lg:min-h-[480px]">
        <CardHeader>
          <CardTitle className="text-base">File notes &amp; timeline</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          {claimStatus === "error" ? (
            <p className="text-sm text-muted-foreground">
              See the message above. The narrative below may be empty until analysis succeeds.
            </p>
          ) : summary ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{summary}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {claimStatus === "analyzing"
                ? "Analysis is running — results will appear here shortly."
                : claimStatus === "pending"
                  ? "Waiting for analysis to start."
                  : "No summary yet."}
            </p>
          )}

          <Separator />

          <ScrollArea className="h-[280px] rounded-md border p-3 lg:h-[320px]">
            <ul className="space-y-3 text-sm">
              {timeline.map((row, i) => {
                const seekAt = seekSecondsForEvent(row);
                const isSeekable = fileType === "video" && typeof seekAt === "number";
                return (
                  <li key={i} className="border-b border-border/60 pb-3 last:border-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Confidence dot */}
                      {row.confidence ? (
                        <span
                          className={cn(
                            "inline-block size-2 shrink-0 rounded-full",
                            CONFIDENCE_DOT[row.confidence] ?? "bg-muted-foreground",
                          )}
                          title={CONFIDENCE_LABEL[row.confidence] ?? row.confidence}
                        />
                      ) : null}
                      {/* Timestamp — clickable when video is present */}
                      <button
                        type="button"
                        disabled={!isSeekable}
                        onClick={() => seekTo(seekAt)}
                        className={cn(
                          "font-mono text-xs text-muted-foreground",
                          isSeekable &&
                            "cursor-pointer underline-offset-2 hover:text-foreground hover:underline",
                        )}
                        title={isSeekable ? "Click to seek video" : undefined}
                      >
                        {formatTimelineInstant(row)}
                      </button>
                      {typeof row.frame_index === "number" ? (
                        <span
                          className="rounded border border-border/80 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                          title="1-based frame index in the analyzed sequence"
                        >
                          f{row.frame_index}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 font-medium">{row.action ?? "—"}</p>
                    {row.adjuster_observation ? (
                      <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
                        {row.adjuster_observation}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Suggested fault: {row.suggested_liability_percent ?? "—"}%
                    </p>
                  </li>
                );
              })}
              {!timeline.length ? (
                <li className="text-muted-foreground">No timeline events parsed yet.</li>
              ) : null}
            </ul>
          </ScrollArea>

          {statuteMatches.length ? (
            <>
              <Separator />
              <div>
                <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Statute matches</p>
                <ul className="space-y-2 text-sm">
                  {statuteMatches.map((m, i) => (
                    <li key={i}>
                      <span className="font-medium">{m.action}</span>
                      {m.statute ? (
                        <span className="text-muted-foreground">
                          {" "}
                          — {m.statute.statute_code}: {m.statute.description}
                        </span>
                      ) : (
                        <span className="text-muted-foreground"> — No match</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
