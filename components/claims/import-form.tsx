"use client";

import { useState, useRef, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { importClaimsFromCsv, type ImportRow } from "@/app/actions/import-claims";

const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
]);

const TEMPLATE_CSV = `claim_number,state_code,adjuster_fault_percent,settlement_amount
CLM-001,IL,65,45000
CLM-002,TX,30,120000
CLM-003,CA,80,250000`;

const REQUIRED_HEADERS = ["claim_number", "state_code"];
const OPTIONAL_HEADERS = ["adjuster_fault_percent", "settlement_amount"];
const ALL_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS];

type RowStatus = "valid" | "warning" | "error";

type ParsedRow = ImportRow & {
  rowNum: number;
  status: RowStatus;
  issues: string[];
};

// Minimal RFC 4180 CSV parser — handles quoted fields with embedded commas/newlines
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 2;
      } else if (ch === '"') {
        inQuotes = false;
        i++;
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ",") {
        row.push(field.trim());
        field = "";
        i++;
      } else if (ch === "\r" && next === "\n") {
        row.push(field.trim());
        if (row.some(Boolean)) rows.push(row);
        row = [];
        field = "";
        i += 2;
      } else if (ch === "\n" || ch === "\r") {
        row.push(field.trim());
        if (row.some(Boolean)) rows.push(row);
        row = [];
        field = "";
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }
  if (field || row.length) {
    row.push(field.trim());
    if (row.some(Boolean)) rows.push(row);
  }

  return rows;
}

function validateAndMap(rawRows: string[][]): {
  parsedRows: ParsedRow[];
  headerError: string | null;
} {
  if (rawRows.length === 0) return { parsedRows: [], headerError: "File is empty." };

  const headerRow = rawRows[0].map((h) => h.toLowerCase().trim());
  const missing = REQUIRED_HEADERS.filter((h) => !headerRow.includes(h));
  if (missing.length > 0) {
    return {
      parsedRows: [],
      headerError: `Missing required columns: ${missing.join(", ")}. Expected: ${ALL_HEADERS.join(", ")}`,
    };
  }

  const idx = (name: string) => headerRow.indexOf(name);

  const parsedRows: ParsedRow[] = [];

  for (let i = 1; i < rawRows.length; i++) {
    const cols = rawRows[i];
    const issues: string[] = [];

    const claim_number = cols[idx("claim_number")]?.trim() ?? "";
    const state_raw = (cols[idx("state_code")]?.trim() ?? "").toUpperCase();
    const adj_raw = idx("adjuster_fault_percent") >= 0 ? cols[idx("adjuster_fault_percent")]?.trim() : "";
    const settle_raw = idx("settlement_amount") >= 0 ? cols[idx("settlement_amount")]?.trim() : "";

    if (!claim_number) issues.push("claim_number is required");
    if (!state_raw) {
      issues.push("state_code is required");
    } else if (!US_STATES.has(state_raw)) {
      issues.push(`"${state_raw}" is not a valid US state code`);
    }

    let adjuster_fault_percent: number | null = null;
    if (adj_raw) {
      const n = parseInt(adj_raw, 10);
      if (isNaN(n) || n < 0 || n > 100) {
        issues.push(`adjuster_fault_percent "${adj_raw}" must be 0–100`);
      } else {
        adjuster_fault_percent = n;
      }
    }

    let settlement_amount: number | null = null;
    if (settle_raw) {
      const cleaned = settle_raw.replace(/[$,]/g, "");
      const n = parseFloat(cleaned);
      if (isNaN(n) || n < 0) {
        issues.push(`settlement_amount "${settle_raw}" must be a positive number`);
      } else {
        settlement_amount = n;
      }
    }

    const hasErrors = issues.some(
      (iss) =>
        iss.includes("required") ||
        iss.includes("valid US state") ||
        iss.includes("must be 0–100"),
    );

    parsedRows.push({
      rowNum: i,
      claim_number,
      state_code: state_raw,
      adjuster_fault_percent,
      settlement_amount,
      status: hasErrors ? "error" : issues.length > 0 ? "warning" : "valid",
      issues,
    });
  }

  return { parsedRows, headerError: null };
}

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "axiom-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

type FilterMode = "all" | "valid" | "errors";

export function ImportForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    errors: { claim_number: string; reason: string }[];
  } | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const processFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setHeaderError("Please upload a .csv file.");
      setParsedRows([]);
      setFileName(null);
      return;
    }
    setFileName(file.name);
    setResult(null);
    setGlobalError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rawRows = parseCsv(text);
      const { parsedRows: rows, headerError: hErr } = validateAndMap(rawRows);
      setHeaderError(hErr);
      setParsedRows(rows);
      setFilter("all");
    };
    reader.readAsText(file);
  }, []);

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  function handleImport() {
    const rowsToImport: ImportRow[] = parsedRows
      .filter((r) => r.status !== "error")
      .map(({ claim_number, state_code, adjuster_fault_percent, settlement_amount }) => ({
        claim_number,
        state_code,
        adjuster_fault_percent,
        settlement_amount,
      }));

    setGlobalError(null);
    startTransition(async () => {
      const res = await importClaimsFromCsv(rowsToImport);
      if (!res.ok) {
        setGlobalError(res.error ?? "Import failed.");
        return;
      }
      setResult({ imported: res.imported, skipped: res.skipped, errors: res.errors });
    });
  }

  const validCount = parsedRows.filter((r) => r.status === "valid").length;
  const warningCount = parsedRows.filter((r) => r.status === "warning").length;
  const errorCount = parsedRows.filter((r) => r.status === "error").length;
  const importableCount = validCount + warningCount;

  const filtered =
    filter === "valid"
      ? parsedRows.filter((r) => r.status !== "error")
      : filter === "errors"
        ? parsedRows.filter((r) => r.status === "error")
        : parsedRows;

  const fmtUsd = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

  // ── Success screen ────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border bg-card p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto mb-4 size-12 text-emerald-500" aria-hidden />
        <h2 className="text-xl font-semibold">Import complete</h2>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-2xl font-bold text-emerald-600">{result.imported}</p>
            <p className="text-xs text-muted-foreground">Claims imported</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-2xl font-bold text-muted-foreground">{result.skipped}</p>
            <p className="text-xs text-muted-foreground">Already existed</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className={cn("text-2xl font-bold", result.errors.length > 0 ? "text-amber-600" : "text-muted-foreground")}>
              {result.errors.length}
            </p>
            <p className="text-xs text-muted-foreground">Warnings</p>
          </div>
        </div>

        {result.errors.length > 0 ? (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-left dark:border-amber-800 dark:bg-amber-950/30">
            <p className="mb-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">Partial issues</p>
            {result.errors.map((e, i) => (
              <p key={i} className="text-xs text-amber-700 dark:text-amber-400">
                {e.claim_number !== "*" ? <span className="font-mono">{e.claim_number}: </span> : null}
                {e.reason}
              </p>
            ))}
          </div>
        ) : null}

        <p className="mt-4 text-sm text-muted-foreground">
          Claims are pending video upload and AI analysis. Upload dashcam or incident footage to trigger analysis.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={() => router.push("/dashboard/new")} className="gap-2">
            <Upload className="size-4" aria-hidden />
            Upload videos
          </Button>
          <Button variant="outline" onClick={() => router.push("/dashboard/analytics")} className="gap-2">
            View analytics
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setResult(null);
              setParsedRows([]);
              setFileName(null);
              setHeaderError(null);
            }}
          >
            Import another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Template download */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
        <div>
          <p className="text-sm font-medium">CSV format</p>
          <p className="text-xs text-muted-foreground">
            Required: <code className="font-mono">claim_number</code>,{" "}
            <code className="font-mono">state_code</code> — Optional:{" "}
            <code className="font-mono">adjuster_fault_percent</code>,{" "}
            <code className="font-mono">settlement_amount</code>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2 shrink-0">
          <Download className="size-4" aria-hidden />
          Download template
        </Button>
      </div>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload CSV file"
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30",
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
      >
        {fileName ? (
          <>
            <FileSpreadsheet className="size-10 text-primary" aria-hidden />
            <div className="text-center">
              <p className="font-medium text-foreground">{fileName}</p>
              <p className="text-sm text-muted-foreground">{parsedRows.length} data rows found — click to replace</p>
            </div>
          </>
        ) : (
          <>
            <Upload className="size-10 text-muted-foreground/60" aria-hidden />
            <div className="text-center">
              <p className="font-medium">Drop your CSV here, or click to browse</p>
              <p className="text-sm text-muted-foreground">Supports .csv files up to 10 MB</p>
            </div>
          </>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={onFileInput}
      />

      {/* Header parse error */}
      {headerError ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <p className="text-destructive">{headerError}</p>
        </div>
      ) : null}

      {/* Preview */}
      {parsedRows.length > 0 && !headerError ? (
        <>
          {/* Summary bar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-2 text-sm">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  filter === "all" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
                )}
              >
                All ({parsedRows.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter("valid")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  filter === "valid"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                Importable ({importableCount})
              </button>
              {errorCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setFilter("errors")}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    filter === "errors"
                      ? "bg-destructive text-destructive-foreground"
                      : "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30",
                  )}
                >
                  Errors ({errorCount})
                </button>
              ) : null}
            </div>
            <div className="ml-auto flex flex-wrap gap-2 text-xs text-muted-foreground">
              {validCount > 0 ? (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="size-3.5 text-emerald-500" />
                  {validCount} valid
                </span>
              ) : null}
              {warningCount > 0 ? (
                <span className="flex items-center gap-1">
                  <AlertTriangle className="size-3.5 text-amber-500" />
                  {warningCount} with warnings
                </span>
              ) : null}
              {errorCount > 0 ? (
                <span className="flex items-center gap-1">
                  <XCircle className="size-3.5 text-red-500" />
                  {errorCount} errors (will be skipped)
                </span>
              ) : null}
            </div>
          </div>

          {/* Preview table */}
          <div className="max-h-[420px] overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm">
                <tr className="border-b">
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Claim #</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">State</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Adj. fault %</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Settlement</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.rowNum}
                    className={cn(
                      "border-b last:border-0 transition-colors",
                      row.status === "error"
                        ? "bg-red-50/60 dark:bg-red-950/20"
                        : row.status === "warning"
                          ? "bg-amber-50/40 dark:bg-amber-950/10"
                          : "hover:bg-muted/30",
                    )}
                  >
                    <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{row.rowNum}</td>
                    <td className="px-3 py-2 font-mono text-xs font-medium">
                      {row.claim_number || <span className="italic text-muted-foreground">empty</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{row.state_code || "—"}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {row.adjuster_fault_percent != null ? `${row.adjuster_fault_percent}%` : "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {row.settlement_amount != null ? fmtUsd(row.settlement_amount) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {row.status === "valid" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="size-3.5" />
                          Valid
                        </span>
                      ) : row.status === "warning" ? (
                        <span
                          className="inline-flex cursor-help items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
                          title={row.issues.join("; ")}
                        >
                          <AlertTriangle className="size-3.5" />
                          Warning
                        </span>
                      ) : (
                        <span
                          className="inline-flex cursor-help items-center gap-1 text-xs text-red-600 dark:text-red-400"
                          title={row.issues.join("; ")}
                        >
                          <XCircle className="size-3.5" />
                          Error
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Import action */}
          {globalError ? (
            <p className="text-sm text-destructive">{globalError}</p>
          ) : null}

          {importableCount === 0 ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              All rows have errors. Fix the CSV and re-upload before importing.
            </p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-medium">
                  Ready to import {importableCount} claim{importableCount !== 1 ? "s" : ""}
                  {errorCount > 0 ? ` · ${errorCount} error row${errorCount !== 1 ? "s" : ""} will be skipped` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  Claims will be created as "pending" — upload videos afterward to trigger AI analysis.
                </p>
              </div>
              <Button onClick={handleImport} disabled={isPending} className="gap-2 shrink-0">
                {isPending ? (
                  "Importing…"
                ) : (
                  <>
                    Import {importableCount} claim{importableCount !== 1 ? "s" : ""}
                    <ChevronRight className="size-4" />
                  </>
                )}
              </Button>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
