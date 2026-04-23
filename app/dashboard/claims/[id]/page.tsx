import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, GitCompare, FileText, Mic, Camera, Video, Shield, ChevronDown, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrgIdForUser } from "@/lib/supabase/org";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PollingRefresher } from "./polling-refresher";
import { AnalysisTrigger } from "@/components/claims/analysis-trigger";
import { DeleteClaimButton } from "@/components/claims/delete-claim-button";
import { ReAnalyzeButton } from "@/components/claims/re-analyze-button";
import { EvidencePlayer } from "@/components/claims/evidence-player";
import { AdjusterReviewForm } from "@/components/claims/adjuster-review-form";
import { PerspectivePicker } from "@/components/claims/perspective-picker";
import { MultiEvidenceUpload } from "@/components/claims/multi-evidence-upload";
import type { ConsensusMetadata } from "@/lib/ai/consensus";
import type { ModelUsage } from "@/lib/ai/pricing";
import type { DashcamPerspective } from "@/app/actions/claims";
import type { SynthesisResult } from "@/lib/ai/vla-schemas";

type PageProps = { params: Promise<{ id: string }> };

function ModelCostPanel({
  usage,
  totalCostUsd,
}: {
  usage: ModelUsage[];
  totalCostUsd: number | null;
}) {
  const fmt = (n: number) =>
    n < 0.000001 ? "<$0.000001" : `$${n.toFixed(6)}`;

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/60">
        <span className="font-medium text-foreground">
          {totalCostUsd != null ? fmt(totalCostUsd) : "—"}
        </span>
        <span>est. cost</span>
        <span className="ml-1 text-muted-foreground/60 group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="mt-1 rounded-md border border-border bg-card p-3 text-xs shadow-sm">
        <table className="w-full text-left">
          <thead>
            <tr className="text-muted-foreground">
              <th className="pb-1 pr-4 font-medium">Model</th>
              <th className="pb-1 pr-4 font-medium tabular-nums">In</th>
              <th className="pb-1 pr-4 font-medium tabular-nums">Out</th>
              <th className="pb-1 font-medium tabular-nums">Cost (est.)</th>
            </tr>
          </thead>
          <tbody>
            {usage.map((u) => (
              <tr key={u.provider} className="border-t border-border/50">
                <td className="py-1 pr-4 capitalize">{u.provider} / {u.model}</td>
                <td className="py-1 pr-4 tabular-nums">{u.input_tokens.toLocaleString()}</td>
                <td className="py-1 pr-4 tabular-nums">{u.output_tokens.toLocaleString()}</td>
                <td className="py-1 tabular-nums">{fmt(u.estimated_cost_usd)}</td>
              </tr>
            ))}
            {usage.length > 1 ? (
              <tr className="border-t border-border font-medium">
                <td className="pt-1.5 pr-4">Total</td>
                <td className="pt-1.5 pr-4 tabular-nums">
                  {usage.reduce((s, u) => s + u.input_tokens, 0).toLocaleString()}
                </td>
                <td className="pt-1.5 pr-4 tabular-nums">
                  {usage.reduce((s, u) => s + u.output_tokens, 0).toLocaleString()}
                </td>
                <td className="pt-1.5 tabular-nums">
                  {totalCostUsd != null ? fmt(totalCostUsd) : "—"}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <p className="mt-2 text-muted-foreground/60">
          Estimates based on list pricing. Actual billing may differ (caching, tiers, etc.).
        </p>
      </div>
    </details>
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Gemini",
  openai: "GPT-4o",
  anthropic: "Claude",
};

const CONFIDENCE_COLOR: Record<string, string> = {
  high: "text-emerald-600 dark:text-emerald-400",
  medium: "text-amber-600 dark:text-amber-400",
  low: "text-red-600 dark:text-red-400",
};

function ModelBreakdownPanel({
  rawByProvider,
}: {
  rawByProvider: Partial<Record<string, unknown>>;
}) {
  const providers = Object.keys(rawByProvider);
  if (providers.length === 0) return null;

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/60">
        <span className="font-medium text-foreground">Per-model breakdown</span>
        <span className="ml-1 text-muted-foreground/60 group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="mt-2 space-y-3">
        {providers.map((provider) => {
          const data = rawByProvider[provider] as {
            recommended_liability_percent?: number;
            overall_confidence?: string;
            narrative_summary?: string;
            case_file_narrative?: string;
            timeline?: {
              timestamp_seconds?: number;
              action?: string;
              suggested_liability_percent?: number;
              adjuster_observation?: string;
              confidence?: string;
              violation_tags?: string[];
            }[];
          } | null;
          if (!data) return null;
          const label = PROVIDER_LABELS[provider] ?? provider;
          const confColor = data.overall_confidence ? (CONFIDENCE_COLOR[data.overall_confidence] ?? "") : "";
          return (
            <div key={provider} className="rounded-md border border-border bg-card p-4 text-sm shadow-sm">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span className="font-semibold capitalize">{label}</span>
                {data.recommended_liability_percent != null ? (
                  <span className="tabular-nums font-medium">
                    Liability: {data.recommended_liability_percent}%
                  </span>
                ) : null}
                {data.overall_confidence ? (
                  <span className={cn("text-xs font-medium", confColor)}>
                    Confidence: {data.overall_confidence}
                  </span>
                ) : null}
              </div>

              {data.narrative_summary ? (
                <p className="mb-3 text-sm text-muted-foreground italic">{data.narrative_summary}</p>
              ) : null}

              {data.case_file_narrative ? (
                <p className="mb-3 text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                  {data.case_file_narrative}
                </p>
              ) : null}

              {Array.isArray(data.timeline) && data.timeline.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Timeline events</p>
                  <ul className="space-y-2">
                    {data.timeline.map((ev, i) => (
                      <li key={i} className="rounded border border-border/60 bg-muted/20 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {typeof ev.timestamp_seconds === "number" ? (
                            <span className="font-mono text-muted-foreground">
                              {ev.timestamp_seconds.toFixed(1)}s
                            </span>
                          ) : null}
                          <span className="font-medium">{ev.action ?? "—"}</span>
                          {ev.suggested_liability_percent != null ? (
                            <span className="tabular-nums text-muted-foreground">
                              {ev.suggested_liability_percent}% fault
                            </span>
                          ) : null}
                          {ev.confidence ? (
                            <span className={cn("text-xs", CONFIDENCE_COLOR[ev.confidence] ?? "")}>
                              {ev.confidence}
                            </span>
                          ) : null}
                          {ev.violation_tags?.length ? (
                            <span className="text-xs text-muted-foreground/70">
                              [{ev.violation_tags.join(", ")}]
                            </span>
                          ) : null}
                        </div>
                        {ev.adjuster_observation ? (
                          <p className="mt-1 text-xs text-muted-foreground">{ev.adjuster_observation}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </details>
  );
}

const SOURCE_TYPE_ICONS: Record<string, React.ReactNode> = {
  dashcam_video: <Video className="size-3.5" aria-hidden />,
  surveillance_video: <Video className="size-3.5" aria-hidden />,
  bystander_video: <Video className="size-3.5" aria-hidden />,
  telematics_video: <Video className="size-3.5" aria-hidden />,
  police_report: <Shield className="size-3.5" aria-hidden />,
  recorded_statement: <Mic className="size-3.5" aria-hidden />,
  witness_statement: <FileText className="size-3.5" aria-hidden />,
  damage_photo: <Camera className="size-3.5" aria-hidden />,
  repair_estimate: <FileText className="size-3.5" aria-hidden />,
  scene_diagram: <FileText className="size-3.5" aria-hidden />,
  medical_record: <FileText className="size-3.5" aria-hidden />,
  other: <FileText className="size-3.5" aria-hidden />,
};

function EvidenceListPanel({
  items,
}: {
  items: Array<{
    id: string;
    source_type: string;
    original_filename: string | null;
    analyzed_jointly: boolean | null;
    vla_analysis_raw: Record<string, unknown> | null;
  }>;
}) {
  if (items.length <= 1) return null;

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/60">
        <span className="font-medium text-foreground">{items.length} evidence items</span>
        <ChevronDown className="ml-1 size-3 text-muted-foreground/60 group-open:rotate-180 transition-transform" aria-hidden />
      </summary>
      <div className="mt-2 divide-y divide-border rounded-md border border-border bg-card shadow-sm">
        {items.map((item) => {
          const raw = item.vla_analysis_raw;
          const liability =
            typeof raw?.recommended_liability_percent === "number"
              ? raw.recommended_liability_percent
              : typeof raw?.insured_liability_percent === "number"
                ? raw.insured_liability_percent
                : null;
          const confidence = typeof raw?.overall_confidence === "string"
            ? raw.overall_confidence
            : typeof raw?.confidence === "string"
              ? raw.confidence
              : null;
          const summary = typeof raw?.narrative_summary === "string"
            ? raw.narrative_summary
            : typeof raw?.summary === "string"
              ? raw.summary
              : null;

          return (
            <div key={item.id} className="flex flex-wrap items-start gap-3 px-3 py-2.5 text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                {SOURCE_TYPE_ICONS[item.source_type] ?? <FileText className="size-3.5" />}
                <span className="font-medium text-foreground capitalize">
                  {item.source_type.replace(/_/g, " ")}
                </span>
                {item.analyzed_jointly ? (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0">joint</Badge>
                ) : null}
              </div>
              {item.original_filename ? (
                <span className="text-muted-foreground/60 truncate max-w-xs" title={item.original_filename}>
                  {item.original_filename}
                </span>
              ) : null}
              {liability != null ? (
                <span className="tabular-nums font-medium">
                  {liability}% fault
                </span>
              ) : raw ? (
                <span className="text-muted-foreground/60">analyzed</span>
              ) : (
                <span className="text-muted-foreground/40">pending</span>
              )}
              {confidence ? (
                <span className={cn("font-medium", CONFIDENCE_COLOR[confidence] ?? "")}>
                  {confidence} confidence
                </span>
              ) : null}
              {summary ? (
                <p className="w-full text-muted-foreground mt-0.5 leading-relaxed">
                  {summary.slice(0, 160)}{summary.length > 160 ? "…" : ""}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </details>
  );
}

function SynthesisPanel({ synthesis }: { synthesis: SynthesisResult }) {
  const confidenceColor = CONFIDENCE_COLOR[synthesis.confidence] ?? "";

  const resultColor =
    synthesis.consistency_checks.some((c) => c.result === "inconsistent")
      ? "text-red-600 dark:text-red-400"
      : synthesis.review_required
        ? "text-amber-600 dark:text-amber-400"
        : "text-green-600 dark:text-green-400";

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Multi-evidence synthesis</span>
          <Badge variant="secondary" className="text-xs">
            {synthesis.evidence_count} item{synthesis.evidence_count !== 1 ? "s" : ""}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {synthesis.final_liability_percent != null ? (
            <span className="font-medium tabular-nums">
              Synthesized: {synthesis.final_liability_percent}% fault
            </span>
          ) : null}
          <span className={cn("font-medium", confidenceColor)}>
            {synthesis.confidence} confidence
          </span>
          {synthesis.review_required ? (
            <span className={cn("font-medium", resultColor)}>
              Review required
            </span>
          ) : null}
        </div>
      </div>

      <div className="px-4 py-3 space-y-4">
        {/* Synthesis narrative */}
        <p className="text-sm text-foreground/80 leading-relaxed">
          {synthesis.synthesis_narrative}
        </p>

        {/* Evidence weights table */}
        {synthesis.evidence_summaries.length > 0 ? (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <span className="font-medium">Evidence weights</span>
              <ChevronDown className="size-3 group-open:rotate-180 transition-transform" aria-hidden />
            </summary>
            <div className="mt-2 rounded-md border border-border bg-muted/20 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium tabular-nums">Weight</th>
                    <th className="px-3 py-2 font-medium tabular-nums">Liability</th>
                    <th className="px-3 py-2 font-medium">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {synthesis.evidence_summaries.map((e) => (
                    <tr key={e.evidence_id} className="border-t border-border/50">
                      <td className="px-3 py-2 capitalize">{e.source_type.replace(/_/g, " ")}</td>
                      <td className="px-3 py-2 tabular-nums">{(e.weight * 100).toFixed(0)}%</td>
                      <td className="px-3 py-2 tabular-nums">
                        {e.liability_percent != null ? `${e.liability_percent}%` : "—"}
                      </td>
                      <td className={cn("px-3 py-2", CONFIDENCE_COLOR[e.confidence ?? ""] ?? "text-muted-foreground")}>
                        {e.confidence ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}

        {/* Consistency checks */}
        {synthesis.consistency_checks.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Consistency checks</p>
            <div className="space-y-1">
              {synthesis.consistency_checks.map((check, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className={cn(
                    "shrink-0 mt-0.5 rounded-full px-1.5 py-0.5 font-medium",
                    check.result === "consistent"
                      ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                      : check.result === "inconsistent"
                        ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
                  )}>
                    {check.result}
                  </span>
                  <span className="text-muted-foreground">{check.detail ?? check.aspect}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Physics flags */}
        {synthesis.physics_flags && synthesis.physics_flags.overall !== "pass" ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Physics checks</p>
            <div className="space-y-1">
              {synthesis.physics_flags.checks
                .filter((c) => c.result === "warn" || c.result === "fail")
                .map((check, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className={cn(
                      "shrink-0 mt-0.5 rounded-full px-1.5 py-0.5 font-medium",
                      check.result === "fail"
                        ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
                    )}>
                      {check.result}
                    </span>
                    <span className="text-muted-foreground">{check.detail ?? check.check}</span>
                  </div>
                ))}
            </div>
          </div>
        ) : null}

        {/* Weather context */}
        {synthesis.weather_context ? (
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Weather at incident:</span>{" "}
            {synthesis.weather_context.description}
            {synthesis.weather_context.temp_c != null ? `, ${synthesis.weather_context.temp_c.toFixed(1)}°C` : ""}
            {synthesis.weather_context.visibility_m != null
              ? `, visibility ${(synthesis.weather_context.visibility_m / 1000).toFixed(1)} km`
              : ""}
            {synthesis.weather_context.precipitation_mm
              ? `, ${synthesis.weather_context.precipitation_mm.toFixed(1)} mm/hr precip.`
              : ""}
          </div>
        ) : null}

        {/* Review reasons */}
        {synthesis.review_reasons.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {synthesis.review_reasons.map((reason, i) => (
              <span key={i} className="rounded-full border border-amber-300/60 bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                {reason}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ConsensusPanel({ consensus }: { consensus: ConsensusMetadata }) {
  const { providers, per_model, liability_delta, agreement_level, factual_divergence } = consensus;

  const multiModel = providers.length > 1;
  const factualDiv = factual_divergence === true;

  const agreementColor =
    factualDiv
      ? "text-red-600 dark:text-red-400"
      : agreement_level === "strong"
        ? "text-green-600 dark:text-green-400"
        : agreement_level === "moderate"
          ? "text-amber-600 dark:text-amber-400"
          : "text-red-600 dark:text-red-400";

  const AgreementIcon = factualDiv
    ? AlertTriangle
    : agreement_level === "strong"
      ? CheckCircle2
      : agreement_level === "moderate"
        ? GitCompare
        : AlertTriangle;

  const perModelEntries = Object.entries(per_model ?? {});

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs">
      {multiModel ? (
        <>
          <AgreementIcon className={cn("size-3.5 shrink-0", agreementColor)} aria-hidden />
          <span className="text-muted-foreground">
            {perModelEntries.map(([provider, liability], i) => (
              <span key={provider}>
                {i > 0 ? <span className="mx-1">·</span> : null}
                {PROVIDER_LABELS[provider] ?? provider}&nbsp;
                <span className="font-medium tabular-nums text-foreground">
                  {liability ?? "—"}%
                </span>
              </span>
            ))}
            {liability_delta != null ? (
              <span className="ml-1 text-muted-foreground">
                (Δ&nbsp;{liability_delta}&nbsp;pp)
              </span>
            ) : null}
          </span>
          <span className={cn("font-medium", agreementColor)}>
            {factualDiv
              ? "Material facts diverged"
              : agreement_level === "strong"
                ? "Models agree"
                : agreement_level === "moderate"
                  ? "Moderate variance"
                  : "High variance"}
          </span>
        </>
      ) : (
        <span className="text-muted-foreground">
          Single model · {PROVIDER_LABELS[providers[0]] ?? providers[0] ?? "unknown"}
        </span>
      )}
    </div>
  );
}

export default async function ClaimScorecardPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <p className="text-muted-foreground">Sign in to view this claim.</p>
        <Link href="/login" className={cn(buttonVariants(), "mt-4 inline-flex")}>
          Sign in
        </Link>
      </div>
    );
  }

  const orgId = await getOrgIdForUser(supabase, user.id);
  if (!orgId) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <p className="text-muted-foreground">
          Your account has no organization. Ask an admin to add you in user_org_memberships.
        </p>
        <Link href="/" className={cn(buttonVariants(), "mt-4 inline-flex")}>
          Home
        </Link>
      </div>
    );
  }

  const { data: claim, error } = await supabase
    .from("claims")
    .select("id, claim_number, state_code, status, liability_score, summary, created_at, user_id, dashcam_perspective")
    .eq("id", id)
    .eq("org_id", orgId)
    .single();

  // synthesis_raw is a Phase D column — fetch separately so a missing migration doesn't break the page
  const synthesisRaw = await supabase
    .from("claims")
    .select("synthesis_raw")
    .eq("id", id)
    .single()
    .then(({ data }) => (data as { synthesis_raw?: unknown } | null)?.synthesis_raw ?? null)
    .then(undefined, () => null) as import("@/lib/ai/vla-schemas").SynthesisResult | null;

  if (error || !claim || claim.user_id !== user.id) {
    notFound();
  }

  // Fetch ALL evidence rows. Exclude Phase D columns (analyzed_jointly) that may not exist yet.
  const { data: evidenceRows } = await supabase
    .from("evidence")
    .select("id, file_path, file_type, source_type, submitted_by, original_filename, vla_analysis_raw")
    .eq("claim_id", id)
    .eq("org_id", orgId);

  // Primary evidence = first video/dashcam item (for EvidencePlayer + timeline display)
  const primaryEv = evidenceRows?.find((e) =>
    ["dashcam_video", "surveillance_video", "bystander_video", "telematics_video"].includes(e.source_type) ||
    e.file_type === "video"
  ) ?? evidenceRows?.[0];

  // Route the video through our proxy
  const mediaUrl = primaryEv?.file_path ? `/api/claims/${id}/video` : null;

  const raw = primaryEv?.vla_analysis_raw as Record<string, unknown> | null;
  const timeline = Array.isArray(raw?.timeline)
    ? (raw.timeline as {
        timestamp_seconds?: number;
        action?: string;
        suggested_liability_percent?: number;
        adjuster_observation?: string;
        confidence?: "high" | "medium" | "low";
        violation_tags?: string[];
      }[])
    : [];
  const statuteMatches = Array.isArray(raw?.statute_matches)
    ? (raw.statute_matches as {
        action?: string;
        timestamp_seconds?: number;
        statute?: { statute_code?: string; description?: string } | null;
      }[])
    : [];

  const overallConfidence = typeof raw?.overall_confidence === "string"
    ? (raw.overall_confidence as "high" | "medium" | "low")
    : null;

  const consensus = (raw?.consensus ?? null) as ConsensusMetadata | null;
  const modelUsage = Array.isArray(raw?.model_usage)
    ? (raw.model_usage as ModelUsage[])
    : null;
  const totalCostUsd =
    typeof raw?.total_cost_usd === "number" ? raw.total_cost_usd : null;
  const rawByProvider =
    raw?.raw_by_provider != null && typeof raw.raw_by_provider === "object"
      ? (raw.raw_by_provider as Partial<Record<string, unknown>>)
      : null;

  const showReviewRecommended =
    claim.status === "completed" &&
    (overallConfidence === "low" ||
      timeline.some((e) => e.confidence === "low") ||
      claim.liability_score == null ||
      consensus?.review_required === true ||
      consensus?.factual_divergence === true ||
      synthesisRaw?.review_required === true);

  // Fetch existing adjuster review (if any)
  const { data: reviewRows } = await supabase
    .from("claim_reviews")
    .select("status, adjuster_fault_percent, adjuster_notes, event_overrides, reserve_amount")
    .eq("claim_id", id)
    .limit(1);

  const existingReview = reviewRows?.[0] ?? null;

  return (
    <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-6 p-6">
      <PollingRefresher status={claim.status} />
      <AnalysisTrigger claimId={claim.id} status={claim.status} />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Claim {claim.claim_number}</h1>
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
          </div>
          <p className="text-sm text-muted-foreground">
            {claim.state_code} · Created {new Date(claim.created_at).toLocaleString()}
          </p>
          <PerspectivePicker
            claimId={claim.id}
            current={(claim.dashcam_perspective as DashcamPerspective) ?? "insured"}
            disabled={claim.status === "analyzing" || claim.status === "pending"}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/dashboard/claims" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            All claims
          </Link>
          {claim.status === "completed" ? (
            <a
              href={`/api/claims/${claim.id}/export`}
              download
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
            >
              <Download className="size-4" aria-hidden />
              Export JSON
            </a>
          ) : null}
          {claim.status === "completed" || claim.status === "error" ? (
            <ReAnalyzeButton claimId={claim.id} />
          ) : null}
          <Link href="/dashboard/new" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            New upload
          </Link>
          <DeleteClaimButton claimId={claim.id} />
        </div>
      </div>

      {/* Score hero — only when completed */}
      {claim.status === "completed" && (consensus?.liability_delta !== 100) ? (() => {
        const score = claim.liability_score;
        const ringColor =
          score == null ? "border-muted"
          : score === 0 ? "border-emerald-400 dark:border-emerald-600"
          : score <= 25 ? "border-teal-400 dark:border-teal-600"
          : score <= 50 ? "border-amber-400 dark:border-amber-600"
          : score <= 75 ? "border-orange-400 dark:border-orange-600"
          : "border-red-400 dark:border-red-600";
        const bgColor =
          score == null ? "bg-muted/30"
          : score === 0 ? "bg-emerald-50 dark:bg-emerald-950/40"
          : score <= 25 ? "bg-teal-50 dark:bg-teal-950/40"
          : score <= 50 ? "bg-amber-50 dark:bg-amber-950/40"
          : score <= 75 ? "bg-orange-50 dark:bg-orange-950/40"
          : "bg-red-50 dark:bg-red-950/40";
        const textColor =
          score == null ? "text-foreground"
          : score === 0 ? "text-emerald-700 dark:text-emerald-400"
          : score <= 25 ? "text-teal-700 dark:text-teal-400"
          : score <= 50 ? "text-amber-700 dark:text-amber-400"
          : score <= 75 ? "text-orange-700 dark:text-orange-400"
          : "text-red-700 dark:text-red-400";
        const label =
          score == null ? "—"
          : score === 0 ? "No fault"
          : score <= 25 ? "Low fault"
          : score <= 50 ? "Moderate fault"
          : score <= 75 ? "High fault"
          : "Majority fault";

        return (
          <div className="flex flex-col items-center gap-4 rounded-xl border bg-card py-8 sm:flex-row sm:items-center sm:gap-8 sm:px-8 sm:py-6">
            {/* Ring + number */}
            <div className={cn("flex size-32 shrink-0 flex-col items-center justify-center rounded-full border-4 sm:size-28", ringColor, bgColor)}>
              <span className={cn("text-4xl font-bold tabular-nums leading-none sm:text-3xl", textColor)}>
                {score != null ? `${score}%` : "—"}
              </span>
              <span className={cn("mt-1 text-[10px] font-semibold uppercase tracking-wide", textColor)}>
                {label}
              </span>
            </div>

            {/* Details */}
            <div className="flex flex-1 flex-col items-center gap-3 text-center sm:items-start sm:text-left">
              <div>
                <p className="text-sm font-medium text-muted-foreground">AI Liability Score</p>
                <p className="text-xs text-muted-foreground/70">
                  Consensus across all models · Final determination remains with the adjuster
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                {consensus ? <ConsensusPanel consensus={consensus} /> : null}
                {modelUsage ? <ModelCostPanel usage={modelUsage} totalCostUsd={totalCostUsd} /> : null}
                {rawByProvider ? <ModelBreakdownPanel rawByProvider={rawByProvider} /> : null}
              </div>
            </div>
          </div>
        );
      })() : null}

      {/* Analyzing banner */}
      {claim.status === "pending" || claim.status === "analyzing" ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          <span className="inline-block size-2 shrink-0 animate-pulse rounded-full bg-amber-500" aria-hidden />
          <span className="text-muted-foreground">
            Analysis is running — this page refreshes automatically every few seconds.
          </span>
        </div>
      ) : null}

      {/* Review recommended banner */}
      {showReviewRecommended ? (
        <div className="flex items-center gap-3 rounded-lg border border-amber-400/50 bg-amber-50/60 px-4 py-3 text-sm dark:bg-amber-950/30">
          <AlertTriangle className="size-4 shrink-0 text-amber-500" aria-hidden />
          <span className="text-amber-800 dark:text-amber-300">
            {consensus?.factual_divergence
              ? "Models disagreed on what is visible in the footage (for example, another vehicle or a conflict). Automated liability scoring and statute alignment were withheld. Review the source video and expand “Per-model outputs” before relying on any narrative."
              : consensus?.liability_delta === 100
                ? "Models fundamentally disagree on whether an incident is captured in this footage. The liability score has been suppressed. Adjuster review with additional evidence (police report, damage photos, witness statements) is required before any determination."
                : consensus?.review_required
                  ? `Models disagreed by ${consensus.liability_delta} percentage points — human adjuster review is required before using this analysis.`
                  : "One or more events have low confidence. Human adjuster review is recommended before using this analysis."}
          </span>
        </div>
      ) : null}

      {/* Error banner */}
      {claim.status === "error" ? (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
          role="alert"
        >
          <p className="font-medium text-destructive">Analysis failed</p>
          <p className="mt-1 text-muted-foreground">
            {claim.summary?.trim()
              ? claim.summary
              : "The model or storage step returned an error. Use Re-analyze to retry, or contact support if this persists."}
          </p>
        </div>
      ) : null}

      {/* Evidence list — multi-item header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {primaryEv?.source_type && primaryEv.source_type !== "dashcam_video" ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded border border-border bg-muted/40 px-2 py-0.5 font-medium capitalize">
                {primaryEv.source_type.replace(/_/g, " ")}
              </span>
              {primaryEv.submitted_by && primaryEv.submitted_by !== "insured" ? (
                <span className="text-muted-foreground/70">
                  submitted by {primaryEv.submitted_by}
                </span>
              ) : null}
              {primaryEv.original_filename ? (
                <span className="text-muted-foreground/50 truncate max-w-xs" title={primaryEv.original_filename}>
                  {primaryEv.original_filename}
                </span>
              ) : null}
            </div>
          ) : null}
          {evidenceRows && evidenceRows.length > 1 ? (
            <EvidenceListPanel
              items={evidenceRows.map((e) => ({
                id: e.id,
                source_type: e.source_type,
                original_filename: e.original_filename ?? null,
                analyzed_jointly: null,
                vla_analysis_raw: e.vla_analysis_raw as Record<string, unknown> | null,
              }))}
            />
          ) : null}
        </div>
        {/* Add evidence button — only when not currently analyzing */}
        {claim.status !== "analyzing" && claim.status !== "pending" ? (
          <MultiEvidenceUpload claimId={claim.id} />
        ) : null}
      </div>

      <EvidencePlayer
        mediaUrl={mediaUrl}
        fileType={primaryEv?.file_type}
        timeline={timeline}
        statuteMatches={statuteMatches}
        summary={claim.status !== "error" ? claim.summary : null}
        claimStatus={claim.status}
      />

      {/* Multi-evidence synthesis panel (Phase D) */}
      {claim.status === "completed" && synthesisRaw && synthesisRaw.evidence_count > 1 ? (
        <SynthesisPanel synthesis={synthesisRaw} />
      ) : null}

      {/* Adjuster review form — only when analysis is complete */}
      {claim.status === "completed" ? (
        <AdjusterReviewForm
          claimId={claim.id}
          aiLiabilityScore={claim.liability_score ?? null}
          timeline={timeline}
          existingReview={existingReview}
        />
      ) : null}

      <p className="text-center text-xs text-muted-foreground/70">
        This analysis is AI-assisted and provided for adjuster review only. Final liability determination
        remains the responsibility of the human adjuster and carrier. Not legal advice.
      </p>
    </div>
  );
}
