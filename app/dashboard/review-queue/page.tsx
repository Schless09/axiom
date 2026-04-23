import Link from "next/link";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Clock,
  Brain,
  ListChecks,
  ChevronRight,
  CheckCircle2,
  ShieldAlert,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgIdForUser } from "@/lib/supabase/org";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const metadata = { title: "Review Queue — Axiom VLA" };

// ── Types ──────────────────────────────────────────────────────────────────
type QueueClaim = {
  id: string;
  claim_number: string;
  state_code: string;
  status: string;
  liability_score: number | null;
  created_at: string;
  summary: string | null;
  synthesis_raw: {
    review_required?: boolean;
    review_reasons?: string[];
    confidence_score?: number;
  } | null;
  evidence_analysis: {
    overall_confidence: string | null;
    model_provider: string;
  }[] | null;
  claim_reviews: {
    status: string;
    adjuster_fault_percent: number | null;
  }[] | null;
};

// ── Priority scoring ───────────────────────────────────────────────────────
type UrgencyLevel = "critical" | "high" | "medium" | "low";

type ReviewItem = {
  claim: QueueClaim;
  urgency: UrgencyLevel;
  urgencyScore: number; // higher = more urgent
  reasons: string[];
};

const URGENCY_CONFIG: Record<UrgencyLevel, { label: string; color: string; dot: string }> = {
  critical: {
    label: "Critical",
    color: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400",
    dot: "bg-red-500",
  },
  high: {
    label: "High",
    color: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-400",
    dot: "bg-orange-500",
  },
  medium: {
    label: "Medium",
    color: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400",
    dot: "bg-amber-400",
  },
  low: {
    label: "Low",
    color: "border-muted bg-muted/30 text-muted-foreground",
    dot: "bg-muted-foreground/40",
  },
};

function scoreAndClassify(claim: QueueClaim): { urgencyScore: number; urgency: UrgencyLevel; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Synthesis explicitly flagged for review
  if (claim.synthesis_raw?.review_required) {
    score += 40;
    const synReasons = claim.synthesis_raw.review_reasons ?? [];
    for (const r of synReasons.slice(0, 2)) reasons.push(r);
  }

  // Low confidence from any model
  const analysisRows = claim.evidence_analysis ?? [];
  const consensusRow = analysisRows.find((r) => r.model_provider === "consensus");
  const hasLowConf = analysisRows.some((r) => r.overall_confidence === "low" && r.model_provider !== "consensus");
  const hasLowConsensus = consensusRow?.overall_confidence === "low";

  if (hasLowConsensus) {
    score += 30;
    reasons.push("Consensus confidence: low");
  } else if (hasLowConf) {
    score += 20;
    reasons.push("One or more models returned low confidence");
  }

  // High liability score (edge cases where adjuster should review)
  if (claim.liability_score != null) {
    if (claim.liability_score >= 75) {
      score += 15;
      reasons.push(`High AI liability score: ${claim.liability_score}%`);
    } else if (claim.liability_score >= 50) {
      score += 8;
    }
  }

  // No liability score yet (completed but not scored — indicates analysis issue)
  if (claim.status === "completed" && claim.liability_score == null) {
    score += 25;
    reasons.push("Analysis completed but no liability score produced");
  }

  // Age: older unreviewed claims get a small nudge
  const ageDays = (Date.now() - new Date(claim.created_at).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays >= 14) {
    score += 10;
    reasons.push(`Claim is ${Math.floor(ageDays)} days old`);
  } else if (ageDays >= 7) {
    score += 5;
  }

  const urgency: UrgencyLevel =
    score >= 55 ? "critical" : score >= 35 ? "high" : score >= 15 ? "medium" : "low";

  if (reasons.length === 0) reasons.push("Awaiting adjuster review");

  return { urgencyScore: score, urgency, reasons };
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtRelativeTime(dateStr: string) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

// ── Page ───────────────────────────────────────────────────────────────────
export default async function ReviewQueuePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <p className="text-muted-foreground">Sign in to view the review queue.</p>
        <Link href="/login" className={cn(buttonVariants(), "mt-4 inline-flex")}>Sign in</Link>
      </div>
    );
  }

  const orgId = await getOrgIdForUser(supabase, user.id);
  if (!orgId) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <p className="text-muted-foreground">No organization context found.</p>
      </div>
    );
  }

  // Fetch completed claims with no submitted adjuster review (org-wide)
  const { data: rawClaims } = await supabase
    .from("claims")
    .select(`
      id, claim_number, state_code, status, liability_score, created_at, summary, synthesis_raw,
      evidence_analysis(overall_confidence, model_provider),
      claim_reviews(status, adjuster_fault_percent)
    `)
    .eq("org_id", orgId)
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  // Supabase can return a single object or an array for nested selects — normalize to arrays
  function toArr<T>(raw: T | T[] | null | undefined): T[] {
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [raw];
  }

  const allCompleted: QueueClaim[] = (rawClaims ?? []).map((c) => ({
    ...(c as QueueClaim),
    claim_reviews: toArr((c as QueueClaim).claim_reviews),
    evidence_analysis: toArr((c as QueueClaim).evidence_analysis),
  }));

  // Only queue claims that don't have a submitted review yet
  const unreviewed = allCompleted.filter((c) => {
    return !c.claim_reviews!.some((r) => r.status === "submitted");
  });

  // Score and sort
  const reviewItems: ReviewItem[] = unreviewed
    .map((claim) => {
      const { urgencyScore, urgency, reasons } = scoreAndClassify(claim);
      return { claim, urgency, urgencyScore, reasons };
    })
    .sort((a, b) => b.urgencyScore - a.urgencyScore);

  // Summary counts
  const criticalCount = reviewItems.filter((r) => r.urgency === "critical").length;
  const highCount = reviewItems.filter((r) => r.urgency === "high").length;
  const totalReviewed = allCompleted.length - unreviewed.length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">

      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ListChecks className="size-5 text-muted-foreground" aria-hidden />
            <h1 className="text-2xl font-semibold tracking-tight">Review Queue</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Completed claims awaiting adjuster review, sorted by urgency.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/analytics" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Analytics
          </Link>
          <Link href="/dashboard/claims" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            All claims
          </Link>
        </div>
      </div>

      {/* Summary bar */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Awaiting review</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{reviewItems.length}</p>
          <p className="text-xs text-muted-foreground">of {allCompleted.length} analyzed</p>
        </div>
        <div className={cn(
          "rounded-xl border px-4 py-3",
          criticalCount > 0 ? "border-red-200 bg-red-50/40 dark:border-red-900/50 dark:bg-red-950/20" : "bg-card",
        )}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Critical</p>
          <p className={cn("mt-1 text-2xl font-semibold tabular-nums", criticalCount > 0 ? "text-red-600 dark:text-red-400" : "")}>
            {criticalCount}
          </p>
          <p className="text-xs text-muted-foreground">Needs immediate review</p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">High priority</p>
          <p className={cn("mt-1 text-2xl font-semibold tabular-nums", highCount > 0 ? "text-orange-600 dark:text-orange-400" : "")}>
            {highCount}
          </p>
          <p className="text-xs text-muted-foreground">Review soon</p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reviewed</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {totalReviewed}
          </p>
          <p className="text-xs text-muted-foreground">
            {allCompleted.length > 0 ? `${Math.round((totalReviewed / allCompleted.length) * 100)}% review rate` : "—"}
          </p>
        </div>
      </div>

      {/* Priority legend */}
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="font-medium">Priority based on:</span>
        <span className="flex items-center gap-1"><ShieldAlert className="size-3" aria-hidden /> synthesis flags</span>
        <span className="flex items-center gap-1"><Brain className="size-3" aria-hidden /> model confidence</span>
        <span className="flex items-center gap-1"><TrendingUp className="size-3" aria-hidden /> liability score</span>
        <span className="flex items-center gap-1"><Clock className="size-3" aria-hidden /> claim age</span>
      </div>

      {/* Queue */}
      {reviewItems.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-16 text-center">
          <CheckCircle2 className="size-10 text-emerald-500" aria-hidden />
          <div>
            <p className="text-lg font-semibold">Queue is clear</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {allCompleted.length === 0
                ? "No analyzed claims yet. Upload evidence to get started."
                : `All ${allCompleted.length} analyzed claims have been reviewed by an adjuster.`}
            </p>
          </div>
          <Link href="/dashboard/new" className={cn(buttonVariants({ variant: "outline" }), "mt-2")}>
            Upload a claim
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground w-6" />
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Claim #</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">State</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">AI Score</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Confidence</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Urgency</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Why</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Age</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground" />
                </tr>
              </thead>
              <tbody>
                {reviewItems.map(({ claim, urgency, reasons }) => {
                  const cfg = URGENCY_CONFIG[urgency];
                  const analysisRows = claim.evidence_analysis ?? [];
                  const consensusConf = analysisRows.find((r) => r.model_provider === "consensus")?.overall_confidence ?? null;
                  const confLabel = consensusConf ?? "—";
                  const confColor =
                    consensusConf === "high"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : consensusConf === "medium"
                        ? "text-amber-600 dark:text-amber-400"
                        : consensusConf === "low"
                          ? "text-red-600 dark:text-red-400"
                          : "text-muted-foreground";

                  return (
                    <tr key={claim.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                      {/* Urgency dot */}
                      <td className="px-4 py-3">
                        <span className={cn("inline-block size-2.5 rounded-full", cfg.dot)} aria-hidden />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-medium">{claim.claim_number}</td>
                      <td className="px-4 py-3 text-muted-foreground">{claim.state_code}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {claim.liability_score != null ? (
                          <span className={cn(
                            "font-medium",
                            claim.liability_score >= 75 ? "text-red-600 dark:text-red-400"
                              : claim.liability_score >= 50 ? "text-amber-600 dark:text-amber-400"
                                : "text-muted-foreground",
                          )}>
                            {claim.liability_score}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className={cn("px-4 py-3 text-xs font-medium capitalize tabular-nums", confColor)}>
                        {confLabel}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
                          cfg.color,
                        )}>
                          {urgency === "critical" || urgency === "high" ? (
                            <AlertTriangle className="size-3" aria-hidden />
                          ) : null}
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[220px]">
                        <p className="truncate text-xs text-muted-foreground" title={reasons.join(" · ")}>
                          {reasons[0]}
                          {reasons.length > 1 ? ` +${reasons.length - 1} more` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {fmtRelativeTime(claim.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/dashboard/claims/${claim.id}`}
                          className={cn(buttonVariants({ size: "sm" }), "gap-1")}
                        >
                          Review
                          <ChevronRight className="size-3.5" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer note */}
          <div className="flex items-center gap-2 border-t bg-muted/20 px-5 py-3 text-xs text-muted-foreground">
            <Zap className="size-3.5 shrink-0" aria-hidden />
            Priority score is computed from synthesis flags, model confidence, liability score, and claim age. Claims with submitted adjuster reviews are removed from this queue automatically.
          </div>
        </div>
      )}
    </div>
  );
}
