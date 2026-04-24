"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Upload, X, FileVideo, FileImage, FileText,
  ChevronDown, Layers, Files, FolderOpen, Plus, Trash2,
} from "lucide-react";
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

const PERSPECTIVE_OPTIONS = [
  { value: "",         label: "Auto-detect" },
  { value: "insured",  label: "Insured" },
  { value: "adverse",  label: "Adverse" },
  { value: "witness",  label: "Witness" },
] as const;

type UploadMode = "separate" | "groups" | "one";

interface FileRow {
  id: string;
  file: File;
  stateCode: string;
  claimNumber: string;
  perspective: string;
  groupId: string | null;
  status: "idle" | "uploading" | "done" | "error";
  error?: string;
  claimId?: string;
}

interface ClaimGroup {
  id: string;
  stateCode: string;
  claimNumber: string;
}

// ─── Thumbnail component ──────────────────────────────────────────────────────

function useFileThumbnail(file: File): string | null {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    if (file.type.startsWith("image/")) {
      objectUrl = URL.createObjectURL(file);
      setThumbUrl(objectUrl);
      return () => {
        cancelled = true;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }

    if (file.type.startsWith("video/")) {
      objectUrl = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.src = objectUrl;

      const onLoaded = () => { video.currentTime = 1.5; };
      const onSeeked = () => {
        if (cancelled) return;
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 180;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          setThumbUrl(canvas.toDataURL("image/jpeg", 0.85));
        }
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
      const onError = () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };

      video.addEventListener("loadedmetadata", onLoaded);
      video.addEventListener("seeked", onSeeked);
      video.addEventListener("error", onError);

      return () => {
        cancelled = true;
        video.removeEventListener("loadedmetadata", onLoaded);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }

    // PDFs: no browser-side preview without pdfjs — fall through to null
  }, [file]);

  return thumbUrl;
}

function FileThumbnail({ file }: { file: File }) {
  const thumbUrl = useFileThumbnail(file);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<{ x: number; y: number } | null>(null);

  const handleMouseEnter = () => {
    if (!thumbUrl || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // Place to the right; if it would overflow the viewport, place to the left
    const spaceRight = window.innerWidth - rect.right;
    const popoverW = 240;
    const x = spaceRight >= popoverW + 16
      ? rect.right + 8
      : rect.left - popoverW - 8;
    setPopover({ x, y: rect.top + rect.height / 2 });
  };

  const handleMouseLeave = () => setPopover(null);

  const isPdf = file.name.toLowerCase().endsWith(".pdf");

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "size-10 shrink-0 rounded-md overflow-hidden border border-border bg-muted flex items-center justify-center",
          thumbUrl && "cursor-zoom-in",
        )}
      >
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
        ) : isPdf ? (
          <FileText className="size-4 text-muted-foreground" />
        ) : file.type.startsWith("video/") ? (
          <FileVideo className="size-4 text-muted-foreground" />
        ) : (
          <FileImage className="size-4 text-muted-foreground" />
        )}
      </div>

      {/* Enlarged preview portal — renders outside any overflow:hidden ancestor */}
      {thumbUrl && popover && createPortal(
        <div
          className="pointer-events-none fixed z-[9999] w-60 overflow-hidden rounded-xl border border-border bg-card shadow-2xl ring-1 ring-black/5"
          style={{
            left: popover.x,
            top: popover.y,
            transform: "translateY(-50%)",
          }}
        >
          <img src={thumbUrl} alt="" className="w-full object-cover" />
          <div className="px-3 py-2 border-t border-border bg-muted/40">
            <p className="truncate text-xs font-medium" title={file.name}>{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fileTypeBadge(file: File) {
  if (file.type.startsWith("video/")) return "Video";
  if (file.type.startsWith("image/")) return "Photo";
  if (file.name.toLowerCase().endsWith(".pdf")) return "Document";
  return "File";
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

let groupCounter = 1;

// ─── Main form ────────────────────────────────────────────────────────────────

export function BatchUploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<FileRow[]>([]);
  const [bulkState, setBulkState] = useState("IL");
  const [submitting, setSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [mode, setMode] = useState<UploadMode>("separate");

  const [claimGroups, setClaimGroups] = useState<ClaimGroup[]>([]);
  const [oneState, setOneState] = useState("IL");
  const [oneClaimNumber, setOneClaimNumber] = useState("");

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) =>
      f.type.startsWith("video/") || f.type.startsWith("image/") ||
      f.name.toLowerCase().endsWith(".pdf"),
    );
    setRows((prev) => [
      ...prev,
      ...arr.map((file) => ({
        id: `${Date.now()}-${Math.random()}`,
        file,
        stateCode: bulkState,
        claimNumber: "",
        perspective: "",
        groupId: null,
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

  const addClaimGroup = () => {
    setClaimGroups((prev) => [
      ...prev,
      { id: `group-${Date.now()}-${groupCounter++}`, stateCode: bulkState, claimNumber: "" },
    ]);
  };

  const updateGroup = (id: string, patch: Partial<ClaimGroup>) =>
    setClaimGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  const removeGroup = (id: string) => {
    setClaimGroups((prev) => prev.filter((g) => g.id !== id));
    setRows((prev) => prev.map((r) => r.groupId === id ? { ...r, groupId: null } : r));
  };

  async function handleSubmit() {
    if (rows.length === 0 || submitting) return;
    const pending = rows.filter((r) => r.status === "idle");
    if (pending.length === 0) return;

    setSubmitting(true);
    const batchId = crypto.randomUUID();

    if (mode === "one") {
      let sharedClaimId: string | null = null;
      for (const row of pending) {
        updateRow(row.id, { status: "uploading" });
        const fd = new FormData();
        fd.append("file", row.file);
        fd.append("state_code", oneState);
        if (oneClaimNumber.trim()) fd.append("claim_number", oneClaimNumber.trim());
        fd.append("batch_id", batchId);
        if (row.perspective) fd.append("perspective", row.perspective);
        if (sharedClaimId) fd.append("claim_id", sharedClaimId);
        const result = await uploadClaimEvidence(fd);
        if (result.ok) {
          sharedClaimId = result.claimId;
          updateRow(row.id, { status: "done", claimId: result.claimId });
        } else {
          updateRow(row.id, { status: "error", error: result.error });
        }
      }
      setSubmitting(false);
      if (sharedClaimId) router.push(`/dashboard/claims/${sharedClaimId}`);

    } else if (mode === "groups") {
      let anyBatchSuccess = false;
      const grouped = new Map<string, FileRow[]>();
      const unassigned: FileRow[] = [];
      for (const row of pending) {
        if (row.groupId) {
          grouped.set(row.groupId, [...(grouped.get(row.groupId) ?? []), row]);
        } else {
          unassigned.push(row);
        }
      }
      for (const [groupId, groupRows] of grouped) {
        const group = claimGroups.find((g) => g.id === groupId);
        if (!group) continue;
        let sharedClaimId: string | null = null;
        for (const row of groupRows) {
          updateRow(row.id, { status: "uploading" });
          const fd = new FormData();
          fd.append("file", row.file);
          fd.append("state_code", group.stateCode);
          if (group.claimNumber.trim()) fd.append("claim_number", group.claimNumber.trim());
          fd.append("batch_id", batchId);
          if (row.perspective) fd.append("perspective", row.perspective);
          if (sharedClaimId) fd.append("claim_id", sharedClaimId);
          const result = await uploadClaimEvidence(fd);
          if (result.ok) {
            anyBatchSuccess = true;
            sharedClaimId = result.claimId;
            updateRow(row.id, { status: "done", claimId: result.claimId });
          } else {
            updateRow(row.id, { status: "error", error: result.error });
          }
        }
      }
      for (const row of unassigned) {
        updateRow(row.id, { status: "uploading" });
        const fd = new FormData();
        fd.append("file", row.file);
        fd.append("state_code", bulkState);
        fd.append("batch_id", batchId);
        const result = await uploadClaimEvidence(fd);
        if (result.ok) {
          anyBatchSuccess = true;
          updateRow(row.id, { status: "done", claimId: result.claimId });
        } else {
          updateRow(row.id, { status: "error", error: result.error });
        }
      }
      setSubmitting(false);
      if (anyBatchSuccess) router.push(`/dashboard/batch/${batchId}`);

    } else {
      let anyBatchSuccess = false;
      for (const row of pending) {
        updateRow(row.id, { status: "uploading" });
        const fd = new FormData();
        fd.append("file", row.file);
        fd.append("state_code", row.stateCode);
        if (row.claimNumber.trim()) fd.append("claim_number", row.claimNumber.trim());
        fd.append("batch_id", batchId);
        const result = await uploadClaimEvidence(fd);
        if (result.ok) {
          anyBatchSuccess = true;
          updateRow(row.id, { status: "done", claimId: result.claimId });
        } else {
          updateRow(row.id, { status: "error", error: result.error });
        }
      }
      setSubmitting(false);
      if (anyBatchSuccess) router.push(`/dashboard/batch/${batchId}`);
    }
  }

  const idleRows = rows.filter((r) => r.status === "idle");
  const doneCount = rows.filter((r) => r.status === "done").length;
  const uploadingIndex = rows.findIndex((r) => r.status === "uploading");
  const unassignedRows = idleRows.filter((r) => r.groupId === null);
  const assignedGroupCount = claimGroups.filter((g) =>
    rows.some((r) => r.groupId === g.id && r.status === "idle"),
  ).length;

  function submitLabel() {
    if (submitting) return `Uploading ${doneCount + 1} of ${rows.length}…`;
    if (mode === "one") return `Analyze 1 claim (${idleRows.length} file${idleRows.length !== 1 ? "s" : ""})`;
    if (mode === "groups") {
      const assigned = idleRows.length - unassignedRows.length;
      return `Analyze ${assignedGroupCount} claim${assignedGroupCount !== 1 ? "s" : ""} (${assigned} file${assigned !== 1 ? "s" : ""})`;
    }
    return `Analyze ${idleRows.length} claim${idleRows.length !== 1 ? "s" : ""}`;
  }

  const submitDisabled = submitting || idleRows.length === 0 || (mode === "groups" && assignedGroupCount === 0);

  // ── Shared perspective cell ─────────────────────────────────────────────────
  function PerspectiveCell({ row }: { row: FileRow }) {
    if (!row.file.type.startsWith("video/")) {
      return <span className="text-xs text-muted-foreground/50">—</span>;
    }
    return (
      <div className="relative">
        <select
          value={row.perspective}
          onChange={(e) => updateRow(row.id, { perspective: e.target.value })}
          disabled={row.status !== "idle" || submitting}
          className="appearance-none rounded-md border border-border bg-background px-2 py-1 pr-6 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        >
          {PERSPECTIVE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
      </div>
    );
  }

  // ── Shared status cell ──────────────────────────────────────────────────────
  function StatusCell({ row, i }: { row: FileRow; i: number }) {
    if (row.status === "uploading") return (
      <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 text-sm">
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
        Uploading…
      </span>
    );
    if (row.status === "done") return <span className="text-emerald-600 dark:text-emerald-400 text-sm">Done ✓</span>;
    if (row.status === "error") {
      const msg = row.error ?? "Unknown error";
      return (
        <span
          className="text-destructive text-sm block max-w-[min(20rem,100%)] break-words leading-snug"
          title={msg}
        >
          Failed — {msg}
        </span>
      );
    }
    return (
      <span className="text-muted-foreground text-sm">
        {uploadingIndex !== -1 && rows.indexOf(row) > uploadingIndex ? `Queued (#${i + 1})` : "Ready"}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Drop zone */}
      {rows.length === 0 ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex min-h-[280px] cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed transition-colors",
            isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30",
          )}
        >
          <Upload className="size-10 text-muted-foreground/50" />
          <div className="text-center">
            <p className="font-medium">Drop videos, images, or PDFs here</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Select multiple files — group them into one or more claims after dropping
            </p>
          </div>
          <p className="text-xs text-muted-foreground/60">MP4, MOV, WebM, JPEG, PNG, PDF · max 100 MB each</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">

          {/* Mode toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1 self-start">
            {(
              [
                { id: "separate", icon: Files,      label: "Separate claims" },
                { id: "groups",   icon: FolderOpen,  label: "Claim groups" },
                { id: "one",      icon: Layers,      label: "One claim" },
              ] as { id: UploadMode; icon: React.ElementType; label: string }[]
            ).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  mode === id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* ── Claim groups mode ─────────────────────────────────────────────── */}
          {mode === "groups" && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-muted-foreground">
                Create claim slots, then assign each file to the right claim.
              </p>

              {claimGroups.map((group, gi) => {
                const groupFiles = rows.filter((r) => r.groupId === group.id);
                return (
                  <div key={group.id} className="rounded-lg border border-border overflow-hidden">
                    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/30 px-4 py-2.5">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Claim {gi + 1}
                      </span>
                      <div className="relative">
                        <select
                          value={group.stateCode}
                          onChange={(e) => updateGroup(group.id, { stateCode: e.target.value })}
                          disabled={submitting}
                          className="appearance-none rounded-md border border-border bg-background px-2 py-1 pr-6 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                      </div>
                      <Input
                        value={group.claimNumber}
                        onChange={(e) => updateGroup(group.id, { claimNumber: e.target.value })}
                        placeholder="Claim # (optional)"
                        disabled={submitting}
                        className="h-7 w-40 text-sm"
                      />
                      <span className="text-xs text-muted-foreground">
                        {groupFiles.length} file{groupFiles.length !== 1 ? "s" : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeGroup(group.id)}
                        disabled={submitting}
                        className="ml-auto rounded p-0.5 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    {groupFiles.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-muted-foreground/60 italic">
                        No files assigned yet — use the unassigned pool below.
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <tbody>
                          {groupFiles.map((row, i) => (
                            <tr
                              key={row.id}
                              className={cn(
                                "border-b border-border/40 last:border-0",
                                row.status === "uploading" && "bg-blue-50/40 dark:bg-blue-950/20",
                                row.status === "done" && "bg-emerald-50/40 dark:bg-emerald-950/20",
                                row.status === "error" && "bg-red-50/40 dark:bg-red-950/20",
                              )}
                            >
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-3 min-w-0">
                                  <FileThumbnail file={row.file} />
                                  <div className="min-w-0">
                                    <p className="truncate max-w-[160px] text-sm font-medium" title={row.file.name}>{row.file.name}</p>
                                    <p className="text-xs text-muted-foreground">{fileTypeBadge(row.file)} · {formatBytes(row.file.size)}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2"><PerspectiveCell row={row} /></td>
                              <td className="px-3 py-2"><StatusCell row={row} i={i} /></td>
                              <td className="px-2 py-2">
                                {row.status === "idle" && (
                                  <button
                                    type="button"
                                    onClick={() => updateRow(row.id, { groupId: null })}
                                    disabled={submitting}
                                    title="Unassign"
                                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                                  >
                                    <X className="size-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={addClaimGroup}
                disabled={submitting}
                className="flex items-center gap-2 self-start rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors disabled:opacity-50"
              >
                <Plus className="size-3.5" />
                Add claim
              </button>

              {/* Unassigned pool */}
              {rows.some((r) => r.groupId === null) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20 overflow-hidden">
                  <div className="border-b border-amber-200/60 dark:border-amber-900/30 px-4 py-2.5">
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                      Unassigned — {rows.filter((r) => r.groupId === null).length} file{rows.filter((r) => r.groupId === null).length !== 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-amber-600/70 dark:text-amber-500/70">
                      Assign each file to a claim group, or they will each become a separate claim.
                    </p>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="border-b border-amber-200/60 dark:border-amber-900/30 bg-amber-50/60 dark:bg-amber-950/30">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-amber-700/80 dark:text-amber-400/80">File</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-amber-700/80 dark:text-amber-400/80">Perspective</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-amber-700/80 dark:text-amber-400/80">Assign to claim</th>
                        <th className="w-8 px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.filter((r) => r.groupId === null).map((row) => (
                        <tr key={row.id} className="border-b border-amber-200/40 dark:border-amber-900/20 last:border-0">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-3 min-w-0">
                              <FileThumbnail file={row.file} />
                              <div className="min-w-0">
                                <p className="truncate max-w-[160px] text-sm font-medium" title={row.file.name}>{row.file.name}</p>
                                <p className="text-xs text-muted-foreground">{fileTypeBadge(row.file)} · {formatBytes(row.file.size)}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5"><PerspectiveCell row={row} /></td>
                          <td className="px-3 py-2.5">
                            {claimGroups.length === 0 ? (
                              <span className="text-xs text-muted-foreground/50">Add a claim first ↑</span>
                            ) : (
                              <div className="relative">
                                <select
                                  value={row.groupId ?? ""}
                                  onChange={(e) => updateRow(row.id, { groupId: e.target.value || null })}
                                  disabled={row.status !== "idle" || submitting}
                                  className="appearance-none rounded-md border border-border bg-background px-2 py-1 pr-6 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                                >
                                  <option value="">— assign —</option>
                                  {claimGroups.map((g, gi) => (
                                    <option key={g.id} value={g.id}>
                                      Claim {gi + 1}{g.claimNumber ? ` · ${g.claimNumber}` : ""}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2.5">
                            <button
                              type="button"
                              onClick={() => removeRow(row.id)}
                              disabled={submitting}
                              className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                            >
                              <X className="size-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── One-claim mode ────────────────────────────────────────────────── */}
          {mode === "one" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">State</Label>
                  <div className="relative">
                    <select
                      value={oneState}
                      onChange={(e) => setOneState(e.target.value)}
                      disabled={submitting}
                      className="appearance-none rounded-md border border-border bg-background px-3 py-1.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Claim number</Label>
                  <Input
                    value={oneClaimNumber}
                    onChange={(e) => setOneClaimNumber(e.target.value)}
                    placeholder="Auto-generate"
                    disabled={submitting}
                    className="h-8 w-44 text-sm"
                  />
                </div>
                <p className="ml-auto text-xs text-muted-foreground">
                  All {rows.length} file{rows.length !== 1 ? "s" : ""} → 1 claim
                </p>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/40">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">File</th>
                      <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Perspective</th>
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
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3 min-w-0">
                            <FileThumbnail file={row.file} />
                            <div className="min-w-0">
                              <p className="truncate max-w-[180px] font-medium" title={row.file.name}>{row.file.name}</p>
                              <p className="text-xs text-muted-foreground">{fileTypeBadge(row.file)} · {formatBytes(row.file.size)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5"><PerspectiveCell row={row} /></td>
                        <td className="px-3 py-2.5"><StatusCell row={row} i={i} /></td>
                        <td className="px-2 py-2.5">
                          {row.status === "idle" && (
                            <button type="button" onClick={() => removeRow(row.id)} disabled={submitting} className="rounded p-0.5 text-muted-foreground hover:text-destructive">
                              <X className="size-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Separate-claims mode ──────────────────────────────────────────── */}
          {mode === "separate" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
                <span className="text-sm font-medium">{rows.length} file{rows.length !== 1 ? "s" : ""} selected</span>
                <div className="ml-auto flex items-center gap-2">
                  <Label htmlFor="bulk-state" className="text-sm text-muted-foreground whitespace-nowrap">Set all states:</Label>
                  <div className="relative">
                    <select
                      id="bulk-state"
                      value={bulkState}
                      onChange={(e) => setBulkState(e.target.value)}
                      disabled={submitting}
                      className="appearance-none rounded-md border border-border bg-background px-3 py-1.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={applyBulkState} disabled={submitting}>Apply to all</Button>
                </div>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/40">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">File</th>
                      <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">State</th>
                      <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Claim # (optional)</th>
                      <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Perspective</th>
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
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3 min-w-0">
                            <FileThumbnail file={row.file} />
                            <div className="min-w-0">
                              <p className="truncate max-w-[160px] font-medium" title={row.file.name}>{row.file.name}</p>
                              <p className="text-xs text-muted-foreground">{formatBytes(row.file.size)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="relative">
                            <select
                              value={row.stateCode}
                              onChange={(e) => updateRow(row.id, { stateCode: e.target.value })}
                              disabled={row.status !== "idle" || submitting}
                              className="appearance-none rounded-md border border-border bg-background px-2 py-1 pr-6 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                            >
                              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <Input
                            value={row.claimNumber}
                            onChange={(e) => updateRow(row.id, { claimNumber: e.target.value })}
                            placeholder="Auto-generate"
                            disabled={row.status !== "idle" || submitting}
                            className="h-8 w-36 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2.5"><PerspectiveCell row={row} /></td>
                        <td className="px-3 py-2.5"><StatusCell row={row} i={i} /></td>
                        <td className="px-2 py-2.5">
                          {row.status === "idle" && (
                            <button type="button" onClick={() => removeRow(row.id)} disabled={submitting} className="rounded p-0.5 text-muted-foreground hover:text-destructive">
                              <X className="size-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Progress bar */}
          {submitting && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Uploading {doneCount + 1} of {rows.length}</span>
                <span>{Math.round((doneCount / rows.length) * 100)}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${(doneCount / rows.length) * 100}%` }} />
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button type="button" variant="ghost" size="sm" onClick={() => inputRef.current?.click()} disabled={submitting}>
                Add more files
              </Button>
              {mode === "groups" && unassignedRows.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {unassignedRows.length} file{unassignedRows.length !== 1 ? "s" : ""} unassigned
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => { setRows([]); setClaimGroups([]); }} disabled={submitting}>
                Clear all
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={submitDisabled}>
                {submitLabel()}
              </Button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="video/*,image/*,.pdf"
        className="sr-only"
        onChange={(e) => e.target.files && addFiles(e.target.files)}
      />
    </div>
  );
}
