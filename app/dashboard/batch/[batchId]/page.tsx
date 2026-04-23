import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgIdForUser } from "@/lib/supabase/org";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AnalysisTrigger } from "@/components/claims/analysis-trigger";
import { BatchLivePanel } from "./batch-live-panel";

type PageProps = { params: Promise<{ batchId: string }> };

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  error: "destructive",
  analyzing: "secondary",
  pending: "outline",
};

const STATUS_LABEL: Record<string, string> = {
  completed: "Done",
  error: "Failed",
  analyzing: "In progress",
  pending: "Queued",
};

export default async function BatchStatusPage({ params }: PageProps) {
  const { batchId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <p className="text-muted-foreground">Sign in to view this batch.</p>
        <Link href="/login" className={cn(buttonVariants(), "mt-4 inline-flex")}>
          Sign in
        </Link>
      </div>
    );
  }

  const orgId = await getOrgIdForUser(supabase, user.id);
  if (!orgId) notFound();

  const { data: claims, error } = await supabase
    .from("claims")
    .select("id, claim_number, state_code, status, liability_score, created_at")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });

  if (error || !claims || claims.length === 0) notFound();

  const total = claims.length;
  const completed = claims.filter((c) => c.status === "completed").length;
  const errored = claims.filter((c) => c.status === "error").length;
  const inProgress = claims.filter(
    (c) => c.status === "analyzing" || c.status === "pending",
  ).length;

  const allDone = inProgress === 0;
  const progressPct = Math.round(((completed + errored) / total) * 100);

  const pendingCount = claims.filter((c) => c.status === "pending").length;
  const analyzingCount = claims.filter((c) => c.status === "analyzing").length;
  const inFlightClaims = [...claims]
    .filter((c) => c.status === "pending" || c.status === "analyzing")
    .sort((a, b) => {
      if (a.status === b.status) return 0;
      return a.status === "analyzing" ? -1 : 1;
    })
    .map((c) => ({
      id: c.id,
      claimNumber: c.claim_number,
      status: c.status as "pending" | "analyzing",
    }));

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-6 p-6">
      {/* Fire analysis for every pending claim in this batch */}
      {claims
        .filter((c) => c.status === "pending")
        .map((c) => (
          <AnalysisTrigger key={c.id} claimId={c.id} status={c.status} />
        ))}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Batch analysis</h1>
          <p className="mt-1 text-sm text-muted-foreground font-mono">{batchId}</p>
          {!allDone && (
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Claims are processed by an automated pipeline: ingest, classification, multi-model review,
              consensus, and statute checks—then results land on each scorecard.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/claims"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            All claims
          </Link>
          <Link
            href="/dashboard/new"
            className={cn(buttonVariants({ size: "sm" }))}
          >
            New batch
          </Link>
        </div>
      </div>

      {!allDone && (
        <BatchLivePanel
          pendingCount={pendingCount}
          analyzingCount={analyzingCount}
          inFlightClaims={inFlightClaims}
        />
      )}

      {/* Progress summary */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-6 text-sm">
            <span>
              <span className="text-2xl font-bold tabular-nums text-foreground">{completed}</span>
              <span className="ml-1.5 text-muted-foreground">completed</span>
            </span>
            {errored > 0 && (
              <span>
                <span className="text-2xl font-bold tabular-nums text-destructive">{errored}</span>
                <span className="ml-1.5 text-muted-foreground">failed</span>
              </span>
            )}
            <span>
              <span className="text-2xl font-bold tabular-nums text-foreground">{inProgress}</span>
              <span className="ml-1.5 text-muted-foreground">remaining</span>
            </span>
            <span>
              <span className="text-2xl font-bold tabular-nums text-foreground">{total}</span>
              <span className="ml-1.5 text-muted-foreground">total</span>
            </span>
          </div>
          <span className="text-sm font-medium text-muted-foreground">{progressPct}%</span>
        </div>

        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              allDone && errored === 0 ? "bg-emerald-500" : "bg-primary",
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {allDone && errored === 0 && (
          <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
            All {total} claims analyzed successfully.
          </p>
        )}
      </div>

      {/* Claims table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">#</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Claim</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">State</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">AI Liability Score</th>
              <th className="w-10 px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {claims.map((claim, i) => (
              <tr key={claim.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{i + 1}</td>
                <td className="px-4 py-3 font-medium">{claim.claim_number}</td>
                <td className="px-4 py-3 text-muted-foreground">{claim.state_code}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {(claim.status === "pending" || claim.status === "analyzing") && (
                      <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
                    )}
                    <Badge variant={STATUS_VARIANT[claim.status] ?? "outline"}>
                      {STATUS_LABEL[claim.status] ?? claim.status}
                    </Badge>
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {claim.liability_score != null ? (
                    <span className="font-medium">{claim.liability_score}%</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  {claim.status === "completed" && (
                    <Link
                      href={`/dashboard/claims/${claim.id}`}
                      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                      title="Open scorecard"
                    >
                      <ExternalLink className="size-3.5" />
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-center text-xs text-muted-foreground/70">
        This analysis is AI-assisted and provided for adjuster review only. Final liability determination
        remains the responsibility of the human adjuster and carrier. Not legal advice.
      </p>
    </div>
  );
}
