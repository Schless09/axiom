"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 5000;

/**
 * Invisible client component that refreshes the current route every 5 s while
 * a claim is in a transient state ("pending" or "analyzing"). Stops automatically
 * once the status reaches a terminal state.
 */
export function PollingRefresher({ status }: { status: string }) {
  const router = useRouter();

  useEffect(() => {
    if (status === "completed" || status === "error") return;

    const id = setInterval(() => {
      router.refresh();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [status, router]);

  return null;
}
