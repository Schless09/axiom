"use client";

import { useCallback, useState, useTransition } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { uploadClaimEvidence } from "@/app/actions/claims";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { FileUp, Upload } from "lucide-react";
import { useRouter } from "next/navigation";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT",
  "VA", "WA", "WV", "WI", "WY", "DC",
] as const;

/** Keep in sync with `MAX_BYTES` in `app/actions/claims.ts`. */
const MAX_BYTES = 100 * 1024 * 1024;

function describeRejections(fileRejections: FileRejection[]): string {
  const first = fileRejections[0];
  if (!first) return "That file could not be used.";
  const codes = new Set(first.errors.map((e) => e.code));
  if (codes.has("file-too-large")) {
    return `File is too large (max ${Math.round(MAX_BYTES / (1024 * 1024))} MB).`;
  }
  if (codes.has("file-invalid-type")) {
    return "That file type is not supported. Use MP4, WebM, MOV, MKV, JPG, PNG, or WebP.";
  }
  return first.errors[0]?.message ?? "That file could not be used.";
}

export function ClaimUploadForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stateCode, setStateCode] = useState("IL");
  const [claimNumber, setClaimNumber] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [statusLine, setStatusLine] = useState<string | null>(null);

  const onDrop = useCallback((accepted: File[], fileRejections: FileRejection[]) => {
    setError(null);
    if (fileRejections.length > 0) {
      setFile(null);
      setError(describeRejections(fileRejections));
      return;
    }
    if (accepted[0]) setFile(accepted[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    maxSize: MAX_BYTES,
    accept: {
      "video/*": [".mp4", ".webm", ".mov", ".mkv"],
      "image/*": [".jpg", ".jpeg", ".png", ".webp"],
    },
  });

  function submit() {
    if (!file) {
      setError("Choose a video or image file.");
      return;
    }
    setError(null);
    setStatusLine(null);
    setProgress(15);
    setStatusLine("Uploading…");
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("state_code", stateCode);
      if (claimNumber.trim()) fd.set("claim_number", claimNumber.trim());
      const res = await uploadClaimEvidence(fd);
      setProgress(45);
      if (!res.ok) {
        setError(res.error);
        setProgress(null);
        setStatusLine(null);
        return;
      }
      // Navigate immediately — AnalysisTrigger on the scorecard fires the analyze call
      setProgress(null);
      setStatusLine(null);
      router.push(`/dashboard/claims/${res.claimId}`);
    });
  }

  return (
    <Card className="w-full max-w-lg border-border/80 shadow-sm shadow-black/5 dark:shadow-black/20">
      <CardHeader className="space-y-1 pb-2">
        <CardTitle className="text-xl">New claim evidence</CardTitle>
        <CardDescription className="text-base leading-relaxed">
          Choose jurisdiction, attach a file, and upload. Analysis starts automatically on the scorecard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-2">
        <div className="space-y-2">
          <Label htmlFor="state">State (jurisdiction)</Label>
          <select
            id="state"
            className={cn(
              "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs",
              "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            )}
            value={stateCode}
            onChange={(e) => setStateCode(e.target.value)}
          >
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="claim">Claim number (optional)</Label>
          <Input
            id="claim"
            placeholder="Auto-generated if empty"
            value={claimNumber}
            onChange={(e) => setClaimNumber(e.target.value)}
          />
        </div>

        <div
          {...getRootProps()}
          className={cn(
            "cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200",
            isDragActive
              ? "border-primary bg-primary/[0.06] shadow-inner"
              : "border-muted-foreground/20 bg-muted/30 hover:border-primary/40 hover:bg-muted/50",
          )}
        >
          <input {...getInputProps()} />
          {file ? (
            <FileUp className="mx-auto mb-3 size-9 text-primary" aria-hidden />
          ) : (
            <Upload className="mx-auto mb-3 size-9 text-muted-foreground" aria-hidden />
          )}
          <p className="text-sm text-muted-foreground">
            {file ? (
              <span className="font-medium text-foreground">{file.name}</span>
            ) : (
              <span className="leading-relaxed">
                Drag and drop a video or image, or <span className="font-medium text-foreground">click to browse</span>
              </span>
            )}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">MP4, WebM, MOV, MKV · JPG, PNG, WebP</p>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {statusLine ? <p className="text-sm text-muted-foreground">{statusLine}</p> : null}
        {progress !== null ? <Progress value={progress} className="h-2" /> : null}

        <Button type="button" className="w-full h-10 text-[15px] font-medium" disabled={pending || !file} onClick={submit}>
          {pending ? "Working…" : "Upload & analyze"}
        </Button>
      </CardContent>
    </Card>
  );
}
