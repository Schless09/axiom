"use client";

import { useCallback, useState, useTransition } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { addEvidenceToExistingClaim } from "@/app/actions/claims";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { FileUp, Upload, Plus } from "lucide-react";

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

const SOURCE_TYPE_OPTIONS = [
  { value: "dashcam_video", label: "Dashcam video" },
  { value: "surveillance_video", label: "Surveillance / traffic camera" },
  { value: "bystander_video", label: "Bystander / witness video" },
  { value: "police_report", label: "Police report (PDF)" },
  { value: "recorded_statement", label: "Recorded statement (audio / PDF)" },
  { value: "witness_statement", label: "Witness statement (PDF)" },
  { value: "damage_photo", label: "Damage photograph" },
  { value: "repair_estimate", label: "Repair estimate (PDF)" },
  { value: "scene_diagram", label: "Scene diagram" },
  { value: "medical_record", label: "Medical record" },
  { value: "other", label: "Other" },
] as const;

const SUBMITTED_BY_OPTIONS = [
  { value: "insured", label: "Insured" },
  { value: "adjuster", label: "Adjuster" },
  { value: "attorney", label: "Attorney" },
  { value: "tpa", label: "TPA" },
  { value: "thirdparty", label: "Third party" },
] as const;

function describeRejections(fileRejections: FileRejection[]): string {
  const first = fileRejections[0];
  if (!first) return "That file could not be used.";
  const codes = new Set(first.errors.map((e) => e.code));
  if (codes.has("file-too-large")) return `File exceeds ${Math.round(MAX_BYTES / (1024 * 1024))} MB.`;
  if (codes.has("file-invalid-type")) return "Unsupported file type.";
  return first.errors[0]?.message ?? "File could not be used.";
}

interface MultiEvidenceUploadProps {
  claimId: string;
  onUploaded?: () => void;
}

export function MultiEvidenceUpload({ claimId, onUploaded }: MultiEvidenceUploadProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [sourceType, setSourceType] = useState("dashcam_video");
  const [submittedBy, setSubmittedBy] = useState("adjuster");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const onDrop = useCallback((accepted: File[], fileRejections: FileRejection[]) => {
    setError(null);
    setSuccess(null);
    if (fileRejections.length > 0) {
      setFile(null);
      setError(describeRejections(fileRejections));
      return;
    }
    if (accepted[0]) {
      setFile(accepted[0]);
      // Auto-detect source type from file
      const f = accepted[0];
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      if (["mp4", "mov", "mkv", "webm", "avi"].includes(ext)) setSourceType("dashcam_video");
      else if (["jpg", "jpeg", "png", "webp"].includes(ext)) setSourceType("damage_photo");
      else if (["pdf"].includes(ext)) setSourceType("police_report");
      else if (["mp3", "m4a", "wav", "ogg", "flac"].includes(ext)) setSourceType("recorded_statement");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    maxSize: MAX_BYTES,
    accept: {
      "video/*": [".mp4", ".webm", ".mov", ".mkv", ".avi"],
      "image/*": [".jpg", ".jpeg", ".png", ".webp"],
      "application/pdf": [".pdf"],
      "audio/*": [".mp3", ".m4a", ".wav", ".ogg", ".flac"],
    },
  });

  function submit() {
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    setError(null);
    setSuccess(null);
    setProgress(15);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("source_type", sourceType);
      fd.set("submitted_by", submittedBy);
      const res = await addEvidenceToExistingClaim(claimId, fd);
      setProgress(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess("Evidence uploaded. Re-analysis will start automatically.");
      setFile(null);
      onUploaded?.();
    });
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-3.5" aria-hidden />
        Add evidence
      </Button>
    );
  }

  return (
    <Card className="border-border/80 shadow-sm shadow-black/5 dark:shadow-black/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Add evidence to this claim</CardTitle>
        <CardDescription>
          Upload additional video, photos, PDFs, or audio. Analysis re-runs automatically to incorporate all evidence.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="me-source-type">Evidence type</Label>
            <select
              id="me-source-type"
              className={cn(
                "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs",
                "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
              )}
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
            >
              {SOURCE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="me-submitted-by">Submitted by</Label>
            <select
              id="me-submitted-by"
              className={cn(
                "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs",
                "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
              )}
              value={submittedBy}
              onChange={(e) => setSubmittedBy(e.target.value)}
            >
              {SUBMITTED_BY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div
          {...getRootProps()}
          className={cn(
            "cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all duration-200",
            isDragActive
              ? "border-primary bg-primary/[0.06] shadow-inner"
              : "border-muted-foreground/20 bg-muted/30 hover:border-primary/40 hover:bg-muted/50",
          )}
        >
          <input {...getInputProps()} />
          {file ? (
            <FileUp className="mx-auto mb-2 size-7 text-primary" aria-hidden />
          ) : (
            <Upload className="mx-auto mb-2 size-7 text-muted-foreground" aria-hidden />
          )}
          <p className="text-sm text-muted-foreground">
            {file ? (
              <span className="font-medium text-foreground">{file.name}</span>
            ) : (
              <span>
                Drag and drop, or{" "}
                <span className="font-medium text-foreground">click to browse</span>
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            MP4, WebM, MOV · JPG, PNG · PDF · MP3, WAV, M4A
          </p>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {success ? <p className="text-sm text-green-600 dark:text-green-400">{success}</p> : null}
        {progress !== null ? <Progress value={progress} className="h-1.5" /> : null}

        <div className="flex gap-2">
          <Button
            type="button"
            className="flex-1 h-9 text-sm font-medium"
            disabled={pending || !file}
            onClick={submit}
          >
            {pending ? "Uploading…" : "Upload & re-analyze"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-9 text-sm"
            onClick={() => {
              setOpen(false);
              setFile(null);
              setError(null);
              setSuccess(null);
            }}
          >
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
