"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, X, FileVideo, FileImage, ChevronDown } from "lucide-react";
import { uploadClaimEvidence } from "@/app/actions/claims";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

interface FileRow {
  /** Stable local key */
  id: string;
  file: File;
  stateCode: string;
  claimNumber: string;
  /** Upload result */
  status: "idle" | "uploading" | "done" | "error";
  error?: string;
  claimId?: string;
}

function fileIcon(file: File) {
  return file.type.startsWith("video/") ? (
    <FileVideo className="size-4 shrink-0 text-muted-foreground" />
  ) : (
    <FileImage className="size-4 shrink-0 text-muted-foreground" />
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BatchUploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<FileRow[]>([]);
  const [bulkState, setBulkState] = useState("IL");
  const [submitting, setSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) =>
      f.type.startsWith("video/") || f.type.startsWith("image/"),
    );
    setRows((prev) => [
      ...prev,
      ...arr.map((file) => ({
        id: `${Date.now()}-${Math.random()}`,
        file,
        stateCode: bulkState,
        claimNumber: "",
        status: "idle" as const,
      })),
    ]);
  }, [bulkState]);

  const removeRow = (id: string) =>
    setRows((prev) => prev.filter((r) => r.id !== id));

  const updateRow = (id: string, patch: Partial<FileRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const applyBulkState = () =>
    setRows((prev) => prev.map((r) =>
      r.status === "idle" ? { ...r, stateCode: bulkState } : r,
    ));

  async function handleSubmit() {
    if (rows.length === 0 || submitting) return;

    const pending = rows.filter((r) => r.status === "idle");
    if (pending.length === 0) return;

    setSubmitting(true);

    // Generate one batch_id for the entire submission
    const batchId = crypto.randomUUID();

    // Upload sequentially — avoids saturating the browser + server action body limit
    for (const row of pending) {
      updateRow(row.id, { status: "uploading" });

      const fd = new FormData();
      fd.append("file", row.file);
      fd.append("state_code", row.stateCode);
      if (row.claimNumber.trim()) fd.append("claim_number", row.claimNumber.trim());
      fd.append("batch_id", batchId);

      const result = await uploadClaimEvidence(fd);

      if (result.ok) {
        updateRow(row.id, { status: "done", claimId: result.claimId });
      } else {
        updateRow(row.id, { status: "error", error: result.error });
      }
    }

    setSubmitting(false);

    // Navigate to batch status page regardless of individual errors
    router.push(`/dashboard/batch/${batchId}`);
  }

  const idleCount = rows.filter((r) => r.status === "idle").length;
  const doneCount = rows.filter((r) => r.status === "done").length;
  const uploadingIndex = rows.findIndex((r) => r.status === "uploading");

  return (
    <div className="flex flex-col gap-6">
      {/* Drop zone */}
      {rows.length === 0 ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex min-h-[280px] cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed transition-colors",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/30",
          )}
        >
          <Upload className="size-10 text-muted-foreground/50" />
          <div className="text-center">
            <p className="font-medium">Drop videos or images here</p>
            <p className="mt-1 text-sm text-muted-foreground">
              or click to browse — select multiple files for batch upload
            </p>
          </div>
          <p className="text-xs text-muted-foreground/60">MP4, MOV, WebM, JPEG, PNG · max 100 MB each</p>
        </div>
      ) : (
        /* File table */
        <div className="flex flex-col gap-4">
          {/* Bulk controls */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
            <span className="text-sm font-medium">{rows.length} file{rows.length !== 1 ? "s" : ""} selected</span>
            <div className="ml-auto flex items-center gap-2">
              <Label htmlFor="bulk-state" className="text-sm text-muted-foreground whitespace-nowrap">
                Set all states:
              </Label>
              <div className="relative">
                <select
                  id="bulk-state"
                  value={bulkState}
                  onChange={(e) => setBulkState(e.target.value)}
                  disabled={submitting}
                  className="appearance-none rounded-md border border-border bg-background px-3 py-1.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={applyBulkState}
                disabled={submitting}
              >
                Apply to all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={submitting}
              >
                Add more
              </Button>
            </div>
          </div>

          {/* Per-file rows */}
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">File</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">State</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Claim # (optional)</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                  <th className="w-8 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-border/50 last:border-0",
                      row.status === "uploading" && "bg-blue-50/40 dark:bg-blue-950/20",
                      row.status === "done" && "bg-emerald-50/40 dark:bg-emerald-950/20",
                      row.status === "error" && "bg-red-50/40 dark:bg-red-950/20",
                    )}
                  >
                    {/* File info */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {fileIcon(row.file)}
                        <div className="min-w-0">
                          <p className="truncate max-w-[200px] font-medium" title={row.file.name}>
                            {row.file.name}
                          </p>
                          <p className="text-xs text-muted-foreground">{formatBytes(row.file.size)}</p>
                        </div>
                      </div>
                    </td>

                    {/* State */}
                    <td className="px-3 py-2.5">
                      <div className="relative">
                        <select
                          value={row.stateCode}
                          onChange={(e) => updateRow(row.id, { stateCode: e.target.value })}
                          disabled={row.status !== "idle" || submitting}
                          className="appearance-none rounded-md border border-border bg-background px-2 py-1 pr-6 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                        >
                          {US_STATES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                      </div>
                    </td>

                    {/* Claim number */}
                    <td className="px-3 py-2.5">
                      <Input
                        value={row.claimNumber}
                        onChange={(e) => updateRow(row.id, { claimNumber: e.target.value })}
                        placeholder="Auto-generate"
                        disabled={row.status !== "idle" || submitting}
                        className="h-8 w-40 text-sm"
                      />
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2.5">
                      {row.status === "idle" && (
                        <span className="text-muted-foreground">
                          {uploadingIndex !== -1 && rows.indexOf(row) > uploadingIndex
                            ? `Queued (#${i + 1})`
                            : "Ready"}
                        </span>
                      )}
                      {row.status === "uploading" && (
                        <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                          <span className="size-1.5 animate-pulse rounded-full bg-current" />
                          Uploading…
                        </span>
                      )}
                      {row.status === "done" && (
                        <span className="text-emerald-600 dark:text-emerald-400">Uploaded ✓</span>
                      )}
                      {row.status === "error" && (
                        <span className="text-destructive" title={row.error}>
                          Failed — {row.error?.slice(0, 40)}
                        </span>
                      )}
                    </td>

                    {/* Remove */}
                    <td className="px-2 py-2.5">
                      {row.status === "idle" && (
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          disabled={submitting}
                          className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                          aria-label="Remove file"
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Progress bar when uploading */}
          {submitting && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Uploading {doneCount + 1} of {rows.length}</span>
                <span>{Math.round(((doneCount) / rows.length) * 100)}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${(doneCount / rows.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              {idleCount} file{idleCount !== 1 ? "s" : ""} ready · 3 analyzed simultaneously · takes ~
              {Math.ceil(idleCount / 3) * 1} min
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRows([])}
                disabled={submitting}
              >
                Clear all
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || idleCount === 0}
              >
                {submitting
                  ? `Uploading ${doneCount + 1} of ${rows.length}…`
                  : `Analyze ${idleCount} claim${idleCount !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="video/*,image/*"
        className="sr-only"
        onChange={(e) => e.target.files && addFiles(e.target.files)}
      />
    </div>
  );
}
