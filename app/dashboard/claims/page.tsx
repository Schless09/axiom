import Link from "next/link";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgIdForUser } from "@/lib/supabase/org";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

type Claim = {
  id: string;
  claim_number: string;
  state_code: string;
  status: string;
  liability_score: number | null;
  created_at: string;
  claim_reviews: { adjuster_fault_percent: number | null; status: string }[] | null;
};

function LeakageDelta({
  aiScore,
  review,
}: {
  aiScore: number | null;
  review: { adjuster_fault_percent: number | null; status: string } | null | undefined;
}) {
  if (!review || review.status !== "submitted" || review.adjuster_fault_percent == null || aiScore == null) {
    return <span className="text-muted-foreground">—</span>;
  }
  const delta = review.adjuster_fault_percent - aiScore;
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
        <Minus className="size-3" aria-hidden />
        0 pp
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium",
          Math.abs(delta) >= 15 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400",
        )}
        title="Adjuster fault > AI — potential over-settlement"
      >
        <TrendingUp className="size-3" aria-hidden />
        +{delta} pp
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        Math.abs(delta) >= 15 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
      )}
      title="Adjuster fault < AI — potential under-reservation"
    >
      <TrendingDown className="size-3" aria-hidden />
      {delta} pp
    </span>
  );
}

type SearchParams = Promise<{
  q?: string;
  status?: string;
  state?: string;
}>;

export const metadata = { title: "My Claims — Axiom VLA" };

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

const STATUSES = ["pending", "analyzing", "completed", "error"];

export default async function ClaimsListPage({ searchParams }: { searchParams: SearchParams }) {
  const { q, status, state } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const orgId = await getOrgIdForUser(supabase, user.id);
  if (!orgId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-muted-foreground">
          Your account has no organization. Contact support or try signing out and back in.
        </p>
      </div>
    );
  }

  // Auto-recover stale "analyzing" claims (older than 15 min)
  const staleThreshold = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await supabase
    .from("claims")
    .update({ status: "error", summary: "Analysis timed out — use Re-analyze on the scorecard to retry." })
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .eq("status", "analyzing")
    .lt("created_at", staleThreshold);

  let query = supabase
    .from("claims")
    .select(
      "id, claim_number, state_code, status, liability_score, created_at, claim_reviews(adjuster_fault_percent, status)",
    )
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (q?.trim()) {
    query = query.ilike("claim_number", `%${q.trim()}%`);
  }
  if (status && STATUSES.includes(status)) {
    query = query.eq("status", status);
  }
  if (state && state.length === 2) {
    query = query.eq("state_code", state.toUpperCase());
  }

  const { data: claims } = await query;

  const hasFilters = Boolean(q || status || state);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Claims</h1>
          <p className="mt-1 text-sm text-muted-foreground">All evidence submissions for your account</p>
        </div>
        <Link href="/dashboard/new" className={cn(buttonVariants(), "gap-2")}>
          <Plus className="size-4" aria-hidden />
          New claim
        </Link>
      </div>

      {/* Filter bar — plain HTML form, no JS required */}
      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="q" className="text-xs font-medium text-muted-foreground">
            Claim #
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q ?? ""}
            placeholder="Search…"
            className="h-9 w-40 rounded-md border bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-xs font-medium text-muted-foreground">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ""}
            className="h-9 rounded-md border bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="state" className="text-xs font-medium text-muted-foreground">
            State
          </label>
          <select
            id="state"
            name="state"
            defaultValue={state ?? ""}
            className="h-9 rounded-md border bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "self-end")}
        >
          Filter
        </button>
        {hasFilters ? (
          <Link
            href="/dashboard/claims"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "self-end")}
          >
            Clear
          </Link>
        ) : null}
      </form>

      {!claims?.length ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            {hasFilters ? "No claims match those filters." : "No claims yet."}
          </p>
          {!hasFilters ? (
            <Link
              href="/dashboard/new"
              className={cn(buttonVariants({ variant: "outline" }), "mt-4 inline-flex")}
            >
              Upload your first evidence
            </Link>
          ) : (
            <Link
              href="/dashboard/claims"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mt-3 inline-flex")}
            >
              Clear filters
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Claim #</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">State</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">AI Liability Score</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Adjuster</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground" title="Adjuster minus AI Liability Score — leakage signal">Delta</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground" />
              </tr>
            </thead>
            <tbody>
              {(claims as Claim[]).map((claim) => (
                <tr key={claim.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs font-medium">{claim.claim_number}</td>
                  <td className="px-4 py-3 text-muted-foreground">{claim.state_code}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        claim.status === "completed"
                          ? "default"
                          : claim.status === "error"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {claim.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {claim.liability_score != null ? `${claim.liability_score}%` : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {(() => {
                      const review = claim.claim_reviews?.[0];
                      if (!review) return "—";
                      const pct = review.adjuster_fault_percent;
                      if (pct == null) return <span className="text-xs italic">draft</span>;
                      return (
                        <span className={review.status === "submitted" ? "font-medium text-foreground" : ""}>
                          {pct}%{review.status === "submitted" ? "" : " (draft)"}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <LeakageDelta
                      aiScore={claim.liability_score}
                      review={claim.claim_reviews?.[0]}
                    />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(claim.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/claims/${claim.id}`}
                      className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
