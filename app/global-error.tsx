"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import "./globals.css";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 py-12 text-foreground">
        <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          An error report may have been sent. Try again from the home page.
        </p>
        <Link href="/" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Home
        </Link>
      </body>
    </html>
  );
}
