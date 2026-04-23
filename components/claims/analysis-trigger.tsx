"use client";

import { useEffect, useRef } from "react";

type Props = { claimId: string; status: string };

/**
 * Invisible client component. When a claim is in "pending" status, fires
 * POST /api/claims/analyze and retries on 429 (org concurrency cap hit).
 *
 * Retry schedule (with ±2 s jitter to avoid thundering herd in batch mode):
 *   attempt 1 → fire immediately
 *   attempt 2 → wait ~12 s
 *   attempt 3 → wait ~24 s
 *   attempt 4 → wait ~48 s
 *   (stops after 6 attempts)
 *
 * 409 = already analyzing → stop (no retry needed).
 * 2xx / 5xx → stop (claim status will update via polling).
 */
export function AnalysisTrigger({ claimId, status }: Props) {
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status !== "pending") return;

    let cancelled = false;

    async function fire() {
      if (cancelled) return;
      attemptRef.current += 1;

      try {
        const res = await fetch("/api/claims/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ claimId }),
        });

        if (res.status === 429 && attemptRef.current < 6) {
          // Org concurrency cap hit — back off and retry
          const baseDelay = 10_000 * attemptRef.current;
          const jitter = Math.random() * 4_000;
          timerRef.current = setTimeout(fire, baseDelay + jitter);
        }
        // All other responses (2xx, 409, 5xx) → stop; polling handles status update
      } catch {
        // Network error — polling will show the current status
      }
    }

    fire();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [claimId, status]);

  return null;
}
