"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { saveClaimReview, submitClaimReview, type EventOverride } from "@/app/actions/claim-review";

type TimelineEvent = {
  timestamp_seconds?: number;
  frame_index?: number;
  evidence_span?: { start_seconds?: number; end_seconds?: number };
  action?: string;
  suggested_liability_percent?: number;
};

type ExistingReview = {
  status: string;
  adjuster_fault_percent: number | null;
  adjuster_notes: string | null;
  event_overrides: EventOverride[];
  reserve_amount: number | null;
};

type Props = {
  claimId: string;
  aiLiabilityScore: number | null;
  timeline: TimelineEvent[];
  existingReview: ExistingReview | null;
};

function buildInitialOverrides(
  timeline: TimelineEvent[],
  existing: EventOverride[],
): Record<number, EventOverride> {
  const map: Record<number, EventOverride> = {};
  for (const ev of existing) {
    map[ev.timestamp_seconds] = ev;
  }
  return map;
}

export function AdjusterReviewForm({ claimId, aiLiabilityScore, timeline, existingReview }: Props) {
  const [expanded, setExpanded] = useState(!existingReview);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const isSubmitted = existingReview?.status === "submitted";

  const [faultPercent, setFaultPercent] = useState<string>(
    existingReview?.adjuster_fault_percent?.toString() ?? "",
  );
  const [notes, setNotes] = useState(existingReview?.adjuster_notes ?? "");
  const [reserveAmount, setReserveAmount] = useState<string>(
    existingReview?.reserve_amount?.toString() ?? "",
  );
  const [overrides, setOverrides] = useState<Record<number, EventOverride>>(
    () => buildInitialOverrides(timeline, existingReview?.event_overrides ?? []),
  );

  const delta =
    aiLiabilityScore != null && faultPercent.trim() !== ""
      ? parseInt(faultPercent, 10) - aiLiabilityScore
      : null;

  function toggleEvent(event: TimelineEvent, agreed: boolean) {
    const ts = event.timestamp_seconds ?? -1;
    setOverrides((prev) => ({
      ...prev,
      [ts]: {
        timestamp_seconds: ts,
        agreed,
        note: prev[ts]?.note ?? "",
        fault_override: prev[ts]?.fault_override,
      },
    }));
  }

  function setEventNote(event: TimelineEvent, note: string) {
    const ts = event.timestamp_seconds ?? -1;
    setOverrides((prev) => ({
      ...prev,
      [ts]: { ...(prev[ts] ?? { timestamp_seconds: ts, agreed: true }), note },
    }));
  }

  function buildPayload() {
    return {
      adjuster_fault_percent: faultPercent.trim() !== "" ? parseInt(faultPercent, 10) : null,
      adjuster_notes: notes,
      event_overrides: Object.values(overrides),
      reserve_amount: reserveAmount.trim() !== "" ? parseFloat(reserveAmount) : null,
    };
  }

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveClaimReview(claimId, buildPayload());
      if (!result.ok) { setError(result.error); return; }
      setSaved(true);
    });
  }

  function handleSubmit() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await submitClaimReview(claimId, buildPayload());
      if (!result.ok) { setError(result.error); return; }
      setSaved(true);
    });
  }

  return (
    <div className="rounded-lg border bg-card">
      {/* Header */}
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Adjuster Review</span>
          {isSubmitted ? (
            <Badge variant="default" className="text-xs">Submitted</Badge>
          ) : existingReview ? (
            <Badge variant="secondary" className="text-xs">Draft saved</Badge>
          ) : null}
          {delta !== null && !isNaN(delta) ? (
            <span
              className={cn(
                "text-xs font-mono tabular-nums",
                delta > 0 ? "text-red-500" : delta < 0 ? "text-emerald-600" : "text-muted-foreground",
              )}
            >
              {delta > 0 ? `+${delta}` : delta}% vs AI
            </span>
          ) : null}
        </div>
        {expanded ? (
          <ChevronUp className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" />
        )}
      </button>

      {expanded ? (
        <div className="border-t px-4 pb-4 pt-4 space-y-5">
          {/* Per-event overrides */}
          {timeline.length > 0 ? (
            <div>
              <p className="mb-3 text-xs font-medium uppercase text-muted-foreground">Event review</p>
              <ul className="space-y-3">
                {timeline.map((ev, i) => {
                  const ts = ev.timestamp_seconds ?? -1;
                  const ov = overrides[ts];
                  return (
                    <li key={i} className="rounded-md border bg-muted/20 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono text-muted-foreground">
                            {typeof ev.timestamp_seconds === "number"
                              ? `${ev.timestamp_seconds.toFixed(1)}s`
                              : "—"}
                          </p>
                          <p className="text-sm font-medium truncate">{ev.action ?? "—"}</p>
                        </div>
                        {!isSubmitted ? (
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={() => toggleEvent(ev, true)}
                              title="Agree"
                              className={cn(
                                "rounded-md px-2 py-1 flex items-center gap-1 text-xs font-medium transition-all",
                                ov?.agreed === true
                                  ? "bg-emerald-600 text-white shadow-sm"
                                  : "text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40",
                              )}
                            >
                              <CheckCircle2 className="size-4" />
                              <span>Agree</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleEvent(ev, false)}
                              title="Dispute"
                              className={cn(
                                "rounded-md px-2 py-1 flex items-center gap-1 text-xs font-medium transition-all",
                                ov?.agreed === false
                                  ? "bg-red-500 text-white shadow-sm"
                                  : "text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40",
                              )}
                            >
                              <XCircle className="size-4" />
                              <span>Dispute</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {ov?.agreed === true ? "Agreed" : ov?.agreed === false ? "Disputed" : "—"}
                          </span>
                        )}
                      </div>
                      {!isSubmitted ? (
                        <input
                          type="text"
                          placeholder="Adjuster note (optional)"
                          value={ov?.note ?? ""}
                          onChange={(e) => setEventNote(ev, e.target.value)}
                          className="mt-2 w-full rounded border bg-background px-2 py-1 text-xs text-muted-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      ) : ov?.note ? (
                        <p className="mt-1 text-xs text-muted-foreground">{ov.note}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <Separator />

          {/* Overall determination */}
          <div className="space-y-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Overall determination</p>

            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="adjuster-fault" className="text-xs">
                  Adjuster fault estimate (%)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="adjuster-fault"
                    type="number"
                    min={0}
                    max={100}
                    placeholder="0–100"
                    value={faultPercent}
                    onChange={(e) => setFaultPercent(e.target.value)}
                    disabled={isSubmitted}
                    className="w-24"
                  />
                  {aiLiabilityScore != null ? (
                    <span className="text-xs text-muted-foreground">AI Liability Score: {aiLiabilityScore}%</span>
                  ) : null}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reserve-amount" className="text-xs">
                  Reserve amount (USD, optional)
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    id="reserve-amount"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="e.g. 50000"
                    value={reserveAmount}
                    onChange={(e) => setReserveAmount(e.target.value)}
                    disabled={isSubmitted}
                    className="w-32"
                  />
                </div>
                <p className="text-xs text-muted-foreground/60">Used for leakage analytics</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adjuster-notes" className="text-xs">
                Adjuster notes
              </Label>
              <textarea
                id="adjuster-notes"
                rows={3}
                placeholder="File notes, caveats, or override rationale…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isSubmitted}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60 resize-none"
              />
            </div>
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          {saved && !error ? (
            <p className="text-xs text-emerald-600">
              {isSubmitted ? "Review submitted." : "Draft saved."}
            </p>
          ) : null}

          {!isSubmitted ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSave}
                disabled={pending}
              >
                {pending ? "Saving…" : "Save draft"}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSubmit}
                disabled={pending}
              >
                {pending ? "Submitting…" : "Submit review"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
