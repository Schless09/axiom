"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reanalyzeClaim } from "@/app/actions/claims";

export function ReAnalyzeButton({ claimId }: { claimId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleReanalyze() {
    if (
      !window.confirm(
        "Re-run analysis on this claim? The previous results will be replaced when the new analysis completes.",
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = await reanalyzeClaim(claimId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={handleReanalyze} disabled={pending}>
        <RefreshCw className={`mr-1.5 size-4 ${pending ? "animate-spin" : ""}`} aria-hidden />
        {pending ? "Queuing…" : "Re-analyze"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
