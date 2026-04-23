import Link from "next/link";
import {
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  BarChart3,
  CheckCircle2,
  Brain,
  DollarSign,
  Zap,
  Activity,
  MapPin,
  Clock,
  ListChecks,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgIdForUser } from "@/lib/supabase/org";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ShadowAuditExport } from "@/components/analytics/shadow-audit-export";

export const metadata = { title: "Analytics — Axiom VLA" };

// ── Types ──────────────────────────────────────────────────────────────────
type ClaimRow = {
  id: string;
  claim_number: string;
  state_code: string;
  status: string;
  liability_score: number | null;
  created_at: string;
  user_id: string;
  claim_reviews: {
    adjuster_fault_percent: number | null;
    status: string;
    reserve_amount: number | null;
    created_at: string;
  }[] | null;
};

type EvidenceAnalysisRow = {
  model_provider: string;
  model_version: string | null;
  liability_score: number | null;
  overall_confidence: string | null;
  estimated_cost_usd: number | null;
  run_id: string;
  analyzed_at: string;
};

type LeakageClaim = {
  id: string;
  claim_number: string;
  state_code: string;
  ai_fault: number;
  adj_fault: number;
  delta: number;
  reserve_amount: number | null;
  direction: "over-settlement" | "under-reservation";
  reviewed_at: string;
};

type TrendPoint = {
  month: string; // "YYYY-MM"
  label: string; // "Jan 25"
  leakageClaims: number;
  reviewedClaims: number;
  avgAbsDelta: number | null;
};

type StateBreakdown = {
  state_code: string;
  total: number;
  reviewed: number;
  leakage: number;
  avgDelta: number | null;
  exposureUsd: number;
};

const HIGH_VARIANCE_THRESHOLD = 15;
const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Gemini",
  openai: "GPT-4o",
  anthropic: "Claude",
  consensus: "Consensus",
};

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtUsd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtPct(n: number | null) {
  return n != null ? `${n.toFixed(1)}%` : "—";
}
function toMonthKey(dateStr: string) {
  return dateStr.slice(0, 7); // "YYYY-MM"
}
function monthLabel(key: string) {
  const [y, m] = key.split("-");
  const date = new Date(parseInt(y), parseInt(m) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

// ── Sub-components ─────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ElementType;
  highlight?: "red" | "amber" | "green" | "neutral";
}) {
  const valueClass =
    highlight === "red"
      ? "text-red-600 dark:text-red-400"
      : highlight === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : highlight === "green"
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-foreground";

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card px-5 py-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon ? <Icon className="size-4 text-muted-foreground/50" aria-hidden /> : null}
      </div>
      <p className={cn("text-2xl font-semibold tabular-nums", valueClass)}>{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function LiabilityBucket({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{count}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ConfidenceBar({ high, medium, low, total }: { high: number; medium: number; low: number; total: number }) {
  if (total === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const hp = (high / total) * 100;
  const mp = (medium / total) * 100;
  const lp = (low / total) * 100;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full">
      <div className="bg-emerald-500 transition-all" style={{ width: `${hp}%` }} title={`High: ${high}`} />
      <div className="bg-amber-400 transition-all" style={{ width: `${mp}%` }} title={`Medium: ${medium}`} />
      <div className="bg-red-500 transition-all" style={{ width: `${lp}%` }} title={`Low: ${low}`} />
    </div>
  );
}

function DeltaBar({ delta, max }: { delta: number; max: number }) {
  const width = max > 0 ? Math.min(100, (Math.abs(delta) / max) * 100) : 0;
  const color = delta > 0 ? "bg-red-500" : delta < 0 ? "bg-amber-400" : "bg-muted-foreground/30";
  return (
    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${width}%` }} />
    </div>
  );
}

/** Inline mini spark bar for trend — purely CSS, no external chart lib. */
function SparkBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex h-8 items-end">
      <div
        className={cn("w-5 rounded-t transition-all", color)}
        style={{ height: `${Math.max(4, pct)}%` }}
        title={String(value)}
      />
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default async function AnalyticsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <p className="text-muted-foreground">Sign in to view analytics.</p>
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

  // ── Data fetching (org-wide, not user-scoped) ──────────────────────────
  const [{ data: rawClaims }, { data: rawAnalysis }] = await Promise.all([
    supabase
      .from("claims")
      .select("id, claim_number, state_code, status, liability_score, created_at, user_id, claim_reviews(adjuster_fault_percent, status, reserve_amount, created_at)")
      .eq("org_id", orgId)            // org-wide — no user_id filter
      .order("created_at", { ascending: false }),
    supabase
      .from("evidence_analysis")
      .select("model_provider, model_version, liability_score, overall_confidence, estimated_cost_usd, run_id, analyzed_at")
      .eq("org_id", orgId)
      .order("analyzed_at", { ascending: false }),
  ]);

  const claims: ClaimRow[] = (rawClaims ?? []) as ClaimRow[];
  const analysisRows: EvidenceAnalysisRow[] = (rawAnalysis ?? []) as EvidenceAnalysisRow[];

  // ── Claim metrics ──────────────────────────────────────────────────────
  const totalClaims = claims.length;
  const completedClaims = claims.filter((c) => c.status === "completed");
  const analyzingClaims = claims.filter((c) => c.status === "analyzing" || c.status === "pending");
  const reviewedClaims = completedClaims.filter((c) => c.claim_reviews?.[0]?.status === "submitted");
  const withBothScores = reviewedClaims.filter(
    (c) => c.liability_score != null && c.claim_reviews?.[0]?.adjuster_fault_percent != null,
  );

  const avgAiFault =
    completedClaims.filter((c) => c.liability_score != null).length > 0
      ? completedClaims.reduce((s, c) => s + (c.liability_score ?? 0), 0) /
        completedClaims.filter((c) => c.liability_score != null).length
      : null;

  const avgAdjFault =
    withBothScores.length > 0
      ? withBothScores.reduce((s, c) => s + (c.claim_reviews![0].adjuster_fault_percent ?? 0), 0) / withBothScores.length
      : null;

  const deltas = withBothScores.map((c) => c.claim_reviews![0].adjuster_fault_percent! - c.liability_score!);
  const avgAbsDelta = deltas.length > 0 ? deltas.reduce((s, d) => s + Math.abs(d), 0) / deltas.length : null;
  const reviewRate = completedClaims.length > 0 ? (reviewedClaims.length / completedClaims.length) * 100 : null;

  // ── Liability distribution ─────────────────────────────────────────────
  const scoredClaims = completedClaims.filter((c) => c.liability_score != null);
  const liabilityBuckets = {
    none: scoredClaims.filter((c) => c.liability_score! === 0).length,
    low: scoredClaims.filter((c) => c.liability_score! > 0 && c.liability_score! <= 25).length,
    moderate: scoredClaims.filter((c) => c.liability_score! > 25 && c.liability_score! <= 50).length,
    high: scoredClaims.filter((c) => c.liability_score! > 50 && c.liability_score! <= 75).length,
    full: scoredClaims.filter((c) => c.liability_score! > 75).length,
  };

  // ── Model / AI metrics ─────────────────────────────────────────────────
  const consensusRows = analysisRows.filter((r) => r.model_provider === "consensus");
  const modelRows = analysisRows.filter((r) => r.model_provider !== "consensus");
  const totalSpend = consensusRows.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0);
  const totalRuns = new Set(consensusRows.map((r) => r.run_id)).size;

  const providerStats = ["gemini", "openai", "anthropic"].map((provider) => {
    const rows = modelRows.filter((r) => r.model_provider === provider);
    const highConf = rows.filter((r) => r.overall_confidence === "high").length;
    const medConf = rows.filter((r) => r.overall_confidence === "medium").length;
    const lowConf = rows.filter((r) => r.overall_confidence === "low").length;
    const latestVersion = rows[0]?.model_version ?? null;
    return { provider, successRuns: new Set(rows.map((r) => r.run_id)).size, highConf, medConf, lowConf, total: rows.length, latestVersion };
  });

  // ── Leakage ────────────────────────────────────────────────────────────
  const leakageClaims: LeakageClaim[] = withBothScores
    .map((c) => {
      const adj = c.claim_reviews![0].adjuster_fault_percent!;
      const ai = c.liability_score!;
      const delta = adj - ai;
      return {
        id: c.id,
        claim_number: c.claim_number,
        state_code: c.state_code,
        ai_fault: ai,
        adj_fault: adj,
        delta,
        reserve_amount: c.claim_reviews![0].reserve_amount,
        direction: (delta > 0 ? "over-settlement" : "under-reservation") as "over-settlement" | "under-reservation",
        reviewed_at: c.claim_reviews![0].created_at ?? c.created_at,
      };
    })
    .filter((c) => Math.abs(c.delta) >= HIGH_VARIANCE_THRESHOLD)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const maxDelta = leakageClaims.length > 0 ? Math.max(...leakageClaims.map((c) => Math.abs(c.delta))) : 0;
  const totalReserveInLeakage = leakageClaims.reduce((s, c) => s + (c.reserve_amount ?? 0), 0);
  const estimatedLeakageExposure = leakageClaims.reduce((c, lc) => {
    if (lc.reserve_amount == null) return c;
    return c + lc.reserve_amount * (Math.abs(lc.delta) / 100);
  }, 0);
  const overSettlementCount = leakageClaims.filter((c) => c.direction === "over-settlement").length;
  const underReservationCount = leakageClaims.filter((c) => c.direction === "under-reservation").length;

  // ── Trend data (last 6 months) ─────────────────────────────────────────
  const now = new Date();
  const trendMonths: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    trendMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const trendPoints: TrendPoint[] = trendMonths.map((month) => {
    const reviewedInMonth = withBothScores.filter((c) => {
      const reviewDate = c.claim_reviews![0].created_at;
      return reviewDate && toMonthKey(reviewDate) === month;
    });
    const leakageInMonth = reviewedInMonth.filter((c) => {
      const delta = Math.abs(c.claim_reviews![0].adjuster_fault_percent! - c.liability_score!);
      return delta >= HIGH_VARIANCE_THRESHOLD;
    });
    const monthDeltas = reviewedInMonth.map((c) =>
      Math.abs(c.claim_reviews![0].adjuster_fault_percent! - c.liability_score!),
    );
    const avgDelta = monthDeltas.length > 0
      ? monthDeltas.reduce((a, b) => a + b, 0) / monthDeltas.length
      : null;

    return {
      month,
      label: monthLabel(month),
      leakageClaims: leakageInMonth.length,
      reviewedClaims: reviewedInMonth.length,
      avgAbsDelta: avgDelta,
    };
  });

  const maxTrendLeakage = Math.max(...trendPoints.map((t) => t.leakageClaims), 1);
  const maxTrendReviewed = Math.max(...trendPoints.map((t) => t.reviewedClaims), 1);

  // Trend direction: compare avg delta of last 2 months vs 2 months before that
  const recentDeltas = trendPoints.slice(4).map((t) => t.avgAbsDelta).filter((d): d is number => d != null);
  const priorDeltas = trendPoints.slice(2, 4).map((t) => t.avgAbsDelta).filter((d): d is number => d != null);
  const recentAvg = recentDeltas.length > 0 ? recentDeltas.reduce((a, b) => a + b, 0) / recentDeltas.length : null;
  const priorAvg = priorDeltas.length > 0 ? priorDeltas.reduce((a, b) => a + b, 0) / priorDeltas.length : null;
  const trendDirection =
    recentAvg == null || priorAvg == null
      ? "neutral"
      : recentAvg < priorAvg - 1
        ? "improving"
        : recentAvg > priorAvg + 1
          ? "worsening"
          : "stable";

  // ── Jurisdiction breakdown ─────────────────────────────────────────────
  const stateMap = new Map<string, StateBreakdown>();
  for (const c of completedClaims) {
    const code = c.state_code;
    if (!stateMap.has(code)) {
      stateMap.set(code, { state_code: code, total: 0, reviewed: 0, leakage: 0, avgDelta: null, exposureUsd: 0 });
    }
    const entry = stateMap.get(code)!;
    entry.total++;
    const review = c.claim_reviews?.[0];
    if (review?.status === "submitted" && c.liability_score != null && review.adjuster_fault_percent != null) {
      entry.reviewed++;
      const delta = Math.abs(review.adjuster_fault_percent - c.liability_score);
      if (delta >= HIGH_VARIANCE_THRESHOLD) {
        entry.leakage++;
        if (review.reserve_amount != null) {
          entry.exposureUsd += review.reserve_amount * (delta / 100);
        }
      }
    }
  }
  // Compute avg delta per state
  for (const [code, entry] of stateMap) {
    const stateClaims = withBothScores.filter((c) => c.state_code === code);
    if (stateClaims.length > 0) {
      const ds = stateClaims.map((c) => Math.abs(c.claim_reviews![0].adjuster_fault_percent! - c.liability_score!));
      entry.avgDelta = ds.reduce((a, b) => a + b, 0) / ds.length;
    }
    void code; // suppress unused var lint
  }
  const stateBreakdown = Array.from(stateMap.values())
    .filter((s) => s.reviewed > 0)
    .sort((a, b) => b.leakage - a.leakage || b.total - a.total);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">

      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="size-5 text-muted-foreground" aria-hidden />
            <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Org-wide analysis performance, model health, and loss leakage signals.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/review-queue"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
          >
            <ListChecks className="size-4" aria-hidden />
            Review queue
          </Link>
          <ShadowAuditExport
            leakageClaims={leakageClaims}
            allClaimsCount={totalClaims}
            reviewedCount={reviewedClaims.length}
            avgAbsDelta={avgAbsDelta}
            totalExposure={estimatedLeakageExposure}
            generatedAt={new Date().toISOString()}
          />
          <Link href="/dashboard/import" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Import claims
          </Link>
        </div>
      </div>

      {/* ── Section: Claims overview ─────────────────────────────────────── */}
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Claims overview
      </h2>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Total claims"
          value={totalClaims.toString()}
          sub={`${completedClaims.length} analyzed · ${analyzingClaims.length} in progress`}
          icon={Activity}
        />
        <KpiCard
          label="Review rate"
          value={reviewRate != null ? `${reviewRate.toFixed(0)}%` : "—"}
          sub={`${reviewedClaims.length} of ${completedClaims.length} reviewed`}
          icon={CheckCircle2}
          highlight={reviewRate == null ? "neutral" : reviewRate < 30 ? "amber" : reviewRate >= 70 ? "green" : "neutral"}
        />
        <KpiCard
          label="Avg AI liability"
          value={fmtPct(avgAiFault ?? null)}
          sub="Across analyzed claims"
          icon={Brain}
        />
        <KpiCard
          label="Avg adjuster delta"
          value={avgAbsDelta != null ? `${avgAbsDelta.toFixed(1)} pp` : "—"}
          sub="Abs. variance vs AI (reviewed only)"
          icon={Zap}
          highlight={
            avgAbsDelta == null ? "neutral" : avgAbsDelta >= 20 ? "red" : avgAbsDelta >= 10 ? "amber" : "green"
          }
        />
      </div>

      {/* ── Section: Leakage trend ────────────────────────────────────────── */}
      {withBothScores.length > 0 ? (
        <div className="mb-8 rounded-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
            <div>
              <h2 className="font-semibold">Leakage Trend</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Monthly high-variance claims (≥{HIGH_VARIANCE_THRESHOLD} pp delta) over the last 6 months.
              </p>
            </div>
            <div className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              trendDirection === "improving"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                : trendDirection === "worsening"
                  ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                  : "bg-muted text-muted-foreground",
            )}>
              {trendDirection === "improving" ? <TrendingDown className="size-3" aria-hidden /> : trendDirection === "worsening" ? <TrendingUp className="size-3" aria-hidden /> : <Activity className="size-3" aria-hidden />}
              {trendDirection === "improving" ? "Leakage improving" : trendDirection === "worsening" ? "Leakage worsening" : "Leakage stable"}
            </div>
          </div>
          <div className="px-5 py-5">
            <div className="flex items-end gap-3">
              {trendPoints.map((t) => (
                <div key={t.month} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-16 items-end gap-0.5">
                    {/* Reviewed claims bar */}
                    <div className="w-3 rounded-t bg-blue-200 dark:bg-blue-900/60 transition-all"
                      style={{ height: `${Math.max(4, maxTrendReviewed > 0 ? (t.reviewedClaims / maxTrendReviewed) * 100 : 0)}%` }}
                      title={`${t.reviewedClaims} reviewed`}
                    />
                    {/* Leakage claims bar */}
                    <div className={cn("w-3 rounded-t transition-all", t.leakageClaims > 0 ? "bg-red-500" : "bg-muted")}
                      style={{ height: `${Math.max(t.leakageClaims > 0 ? 8 : 4, maxTrendLeakage > 0 ? (t.leakageClaims / maxTrendLeakage) * 100 : 0)}%` }}
                      title={`${t.leakageClaims} high-variance`}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{t.label}</span>
                  {t.avgAbsDelta != null ? (
                    <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
                      {t.avgAbsDelta.toFixed(0)}pp
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/40">—</span>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-sm bg-blue-200 dark:bg-blue-900/60" aria-hidden />
                Reviewed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-sm bg-red-500" aria-hidden />
                High-variance (≥{HIGH_VARIANCE_THRESHOLD} pp)
              </span>
              <span className="ml-auto">Avg delta (pp) shown below bars</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Section: Liability distribution ──────────────────────────────── */}
      {scoredClaims.length > 0 ? (
        <div className="mb-8 rounded-xl border bg-card">
          <div className="border-b px-5 py-4">
            <h2 className="font-semibold">Liability Distribution</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              How AI liability scores are spread across your {scoredClaims.length} analyzed {scoredClaims.length === 1 ? "claim" : "claims"}.
            </p>
          </div>
          <div className="grid gap-5 px-5 py-5 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: "No fault (0%)", count: liabilityBuckets.none, color: "bg-emerald-500" },
              { label: "Low (1–25%)", count: liabilityBuckets.low, color: "bg-teal-400" },
              { label: "Moderate (26–50%)", count: liabilityBuckets.moderate, color: "bg-amber-400" },
              { label: "High (51–75%)", count: liabilityBuckets.high, color: "bg-orange-500" },
              { label: "Majority (76–100%)", count: liabilityBuckets.full, color: "bg-red-500" },
            ].map((b) => (
              <div key={b.label} className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4">
                <div className={cn("size-3 rounded-full", b.color)} aria-hidden />
                <p className="text-2xl font-semibold tabular-nums">{b.count}</p>
                <p className="text-xs text-muted-foreground">{b.label}</p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", b.color)}
                    style={{ width: scoredClaims.length > 0 ? `${(b.count / scoredClaims.length) * 100}%` : "0%" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Section: Model performance ────────────────────────────────────── */}
      {analysisRows.length > 0 ? (
        <div className="mb-8 rounded-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
            <div>
              <h2 className="font-semibold">AI Model Performance</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {totalRuns} analysis {totalRuns === 1 ? "run" : "runs"} · {fmtUsd(totalSpend)} total AI spend
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-500 inline-block" />High</span>
              <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-amber-400 inline-block" />Medium</span>
              <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-red-500 inline-block" />Low</span>
            </div>
          </div>
          <div className="divide-y">
            {providerStats.filter((p) => p.total > 0).map((p) => (
              <div key={p.provider} className="flex flex-wrap items-center gap-4 px-5 py-4 text-sm">
                <div className="w-20">
                  <p className="font-medium">{PROVIDER_LABELS[p.provider] ?? p.provider}</p>
                  {p.latestVersion ? (
                    <p className="text-xs text-muted-foreground truncate max-w-[80px]" title={p.latestVersion}>
                      {p.latestVersion}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col gap-1.5 min-w-[120px]">
                  <ConfidenceBar high={p.highConf} medium={p.medConf} low={p.lowConf} total={p.total} />
                  <p className="text-xs text-muted-foreground">
                    {p.highConf}h · {p.medConf}m · {p.lowConf}l across {p.total} {p.total === 1 ? "run" : "runs"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium tabular-nums">
                    {p.total > 0 ? `${Math.round((p.highConf / p.total) * 100)}%` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">high confidence</p>
                </div>
              </div>
            ))}
            {providerStats.every((p) => p.total === 0) && (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                No model data yet. Run your first analysis to see results here.
              </div>
            )}
          </div>
          {totalSpend > 0 ? (
            <div className="flex items-center gap-2 border-t bg-muted/20 px-5 py-3 text-xs text-muted-foreground">
              <DollarSign className="size-3.5 shrink-0" aria-hidden />
              Avg {fmtUsd(totalRuns > 0 ? totalSpend / totalRuns : 0)} per claim · {fmtUsd(totalSpend)} total
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Section: Loss leakage ─────────────────────────────────────────── */}
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Loss leakage signal
      </h2>
      <div className="mb-6 rounded-xl border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
          <div>
            <p className="font-semibold">AI vs. Adjuster Variance</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Claims where AI and adjuster diverged by ≥{HIGH_VARIANCE_THRESHOLD} percentage points.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="flex items-center gap-1.5 rounded-full border border-red-300 bg-red-50 px-2.5 py-1 dark:border-red-800 dark:bg-red-950/30">
              <TrendingUp className="size-3 text-red-500" aria-hidden />
              <span className="text-red-700 dark:text-red-400">
                {overSettlementCount} over-settlement {overSettlementCount === 1 ? "risk" : "risks"}
              </span>
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 dark:border-amber-800 dark:bg-amber-950/30">
              <TrendingDown className="size-3 text-amber-500" aria-hidden />
              <span className="text-amber-700 dark:text-amber-400">
                {underReservationCount} under-reservation {underReservationCount === 1 ? "risk" : "risks"}
              </span>
            </span>
          </div>
        </div>

        {leakageClaims.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
            <CheckCircle2 className="size-8 text-emerald-500" aria-hidden />
            <p className="font-medium">No high-variance claims</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {withBothScores.length === 0
                ? "Submit adjuster reviews on completed claims to begin leakage analysis."
                : `All ${withBothScores.length} reviewed claims are within the ${HIGH_VARIANCE_THRESHOLD}pp variance threshold.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Claim #</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">State</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">AI Score</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Adjuster</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Delta</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Variance</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Reserve</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Signal</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground" />
                </tr>
              </thead>
              <tbody>
                {leakageClaims.map((c) => {
                  const isOver = c.direction === "over-settlement";
                  return (
                    <tr key={c.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs font-medium">{c.claim_number}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.state_code}</td>
                      <td className="px-4 py-3 tabular-nums">{c.ai_fault}%</td>
                      <td className="px-4 py-3 tabular-nums font-medium">{c.adj_fault}%</td>
                      <td className={cn("px-4 py-3 font-mono tabular-nums font-semibold", isOver ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400")}>
                        {c.delta > 0 ? `+${c.delta}` : c.delta} pp
                      </td>
                      <td className="px-4 py-3">
                        <DeltaBar delta={c.delta} max={maxDelta} />
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {c.reserve_amount != null ? fmtUsd(c.reserve_amount) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {isOver ? (
                          <Badge variant="destructive" className="gap-1 text-xs">
                            <TrendingUp className="size-3" aria-hidden />
                            Over-settlement
                          </Badge>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                            <TrendingDown className="size-3" aria-hidden />
                            Under-reservation
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/dashboard/claims/${c.id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                          Review
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Exposure summary */}
      {leakageClaims.some((c) => c.reserve_amount != null) ? (
        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-card px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Claims in leakage window</p>
            <p className="mt-1 text-2xl font-semibold">{leakageClaims.length}</p>
            <p className="text-xs text-muted-foreground">of {withBothScores.length} reviewed</p>
          </div>
          <div className="rounded-xl border bg-card px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total reserve (leakage claims)</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {totalReserveInLeakage > 0 ? fmtUsd(totalReserveInLeakage) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Sum where variance ≥{HIGH_VARIANCE_THRESHOLD}pp</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50/40 px-5 py-4 dark:border-red-900/50 dark:bg-red-950/20">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Estimated leakage exposure</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-red-600 dark:text-red-400">
              {estimatedLeakageExposure > 0 ? fmtUsd(estimatedLeakageExposure) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Reserve × |delta| for high-variance claims</p>
          </div>
        </div>
      ) : leakageClaims.length > 0 ? (
        <div className="mb-8 rounded-xl border border-dashed px-5 py-4 text-center">
          <AlertTriangle className="mx-auto mb-2 size-5 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">Reserve amounts not yet entered</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add reserve amounts in the adjuster review form to unlock dollar-value leakage estimates.
          </p>
        </div>
      ) : null}

      {/* ── Section: Jurisdiction breakdown ──────────────────────────────── */}
      {stateBreakdown.length > 0 ? (
        <div className="mb-8 rounded-xl border bg-card">
          <div className="flex items-center gap-2 border-b px-5 py-4">
            <MapPin className="size-4 text-muted-foreground" aria-hidden />
            <div>
              <h2 className="font-semibold">Jurisdiction Breakdown</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Leakage rate and average delta by state. Sorted by high-variance claim count.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">State</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Analyzed</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Reviewed</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">High-variance</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Leakage rate</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Avg delta</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Est. exposure</th>
                </tr>
              </thead>
              <tbody>
                {stateBreakdown.map((s) => {
                  const leakageRate = s.reviewed > 0 ? (s.leakage / s.reviewed) * 100 : 0;
                  return (
                    <tr key={s.state_code} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold">{s.state_code}</td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{s.total}</td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{s.reviewed}</td>
                      <td className="px-4 py-3">
                        {s.leakage > 0 ? (
                          <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium tabular-nums">
                            <TrendingUp className="size-3" aria-hidden />
                            {s.leakage}
                          </span>
                        ) : (
                          <span className="text-muted-foreground tabular-nums">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        <span className={cn(
                          "font-medium",
                          leakageRate >= 40 ? "text-red-600 dark:text-red-400" : leakageRate >= 20 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                        )}>
                          {leakageRate.toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {s.avgDelta != null ? (
                          <span className={cn(
                            "font-medium",
                            s.avgDelta >= 20 ? "text-red-600 dark:text-red-400" : s.avgDelta >= 10 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                          )}>
                            {s.avgDelta.toFixed(1)} pp
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {s.exposureUsd > 0 ? fmtUsd(s.exposureUsd) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <p className="mt-4 text-center text-xs text-muted-foreground/60">
        Leakage estimates are informational only. Actual exposure depends on coverage terms, jurisdiction, and final settlement. Not legal advice.
      </p>
    </div>
  );
}
