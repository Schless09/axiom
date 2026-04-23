"use client";

import { useState, useTransition } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { updateClaimPerspective, type DashcamPerspective } from "@/app/actions/claims";

const PERSPECTIVE_LABELS: Record<DashcamPerspective, string> = {
  insured: "Insured's dashcam",
  witness: "Witness dashcam",
  adverse: "Adverse party's dashcam",
};

const PERSPECTIVE_HINTS: Record<DashcamPerspective, string> = {
  insured: "Recording vehicle is the claimant",
  witness: "Third vehicle recorded the incident",
  adverse: "Opposing driver's camera — insured is the other vehicle",
};

export function PerspectivePicker({
  claimId,
  current,
  disabled,
}: {
  claimId: string;
  current: DashcamPerspective;
  disabled?: boolean;
}) {
  const [value, setValue] = useState<DashcamPerspective>(current);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: DashcamPerspective) {
    if (next === value || isPending) return;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const result = await updateClaimPerspective(claimId, next);
      if (!result.ok) {
        setValue(value); // revert
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground whitespace-nowrap">Dashcam source:</span>
        <div className="relative">
          <select
            value={value}
            onChange={(e) => handleChange(e.target.value as DashcamPerspective)}
            disabled={disabled || isPending}
            className="appearance-none rounded-md border border-border bg-background px-2.5 py-1 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 cursor-pointer"
          >
            {(Object.keys(PERSPECTIVE_LABELS) as DashcamPerspective[]).map((p) => (
              <option key={p} value={p}>
                {PERSPECTIVE_LABELS[p]}
              </option>
            ))}
          </select>
          {isPending ? (
            <RefreshCw className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : (
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          )}
        </div>
        {isPending && (
          <span className="text-xs text-muted-foreground animate-pulse">Re-analyzing…</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground/60 pl-[calc(theme(spacing.2)+8ch)]">
        {PERSPECTIVE_HINTS[value]}
      </p>
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
