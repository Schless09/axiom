import * as Sentry from "@sentry/nextjs";

/**
 * Shared Sentry init for client, Node server, and Edge.
 * No-op when `NEXT_PUBLIC_SENTRY_DSN` is unset (local dev without Sentry).
 */
export function initSentry(): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1 : 0.1,
  });
}
