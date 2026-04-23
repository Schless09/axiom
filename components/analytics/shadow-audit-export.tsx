"use client";

import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

type LeakageClaim = {
  claim_number: string;
  state_code: string;
  ai_fault: number;
  adj_fault: number;
  delta: number;
  reserve_amount: number | null;
  direction: "over-settlement" | "under-reservation";
};

type Props = {
  leakageClaims: LeakageClaim[];
  allClaimsCount: number;
  reviewedCount: number;
  avgAbsDelta: number | null;
  totalExposure: number;
  generatedAt: string;
};

function escapeCsvField(val: string | number | null): string {
  if (val == null) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(props: Props): string {
  const {
    leakageClaims,
    allClaimsCount,
    reviewedCount,
    avgAbsDelta,
    totalExposure,
    generatedAt,
  } = props;

  const lines: string[] = [];

  lines.push("Axiom VLA — Shadow Audit Report");
  lines.push(`Generated,${generatedAt}`);
  lines.push(`Total claims,${allClaimsCount}`);
  lines.push(`Reviewed claims,${reviewedCount}`);
  lines.push(`Average variance (pp),${avgAbsDelta != null ? avgAbsDelta.toFixed(1) : ""}`);
  lines.push(`High-variance claims,${leakageClaims.length}`);
  lines.push(`Estimated leakage exposure (USD),${totalExposure > 0 ? totalExposure.toFixed(2) : ""}`);
  lines.push("");
  lines.push("HIGH-VARIANCE CLAIMS (≥15 pp delta)");
  lines.push(
    ["Claim Number", "State", "AI Liability Score %", "Adjuster Fault %", "Delta (pp)", "Direction", "Reserve (USD)", "Est. Exposure (USD)"]
      .map(escapeCsvField)
      .join(","),
  );

  for (const c of leakageClaims) {
    const exposure =
      c.reserve_amount != null ? (c.reserve_amount * Math.abs(c.delta)) / 100 : null;
    lines.push(
      [
        c.claim_number,
        c.state_code,
        c.ai_fault,
        c.adj_fault,
        c.delta > 0 ? `+${c.delta}` : c.delta,
        c.direction === "over-settlement" ? "Over-settlement risk" : "Under-reservation risk",
        c.reserve_amount ?? "",
        exposure != null ? exposure.toFixed(2) : "",
      ]
        .map(escapeCsvField)
        .join(","),
    );
  }

  lines.push("");
  lines.push("This report is informational only. Not legal advice.");

  return lines.join("\r\n");
}

export function ShadowAuditExport(props: Props) {
  function handleExport() {
    const csv = buildCsv(props);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().slice(0, 10);
    a.download = `axiom-shadow-audit-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
      <FileDown className="size-4" aria-hidden />
      Export report
    </Button>
  );
}
