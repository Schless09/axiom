"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { getOrgIdForUser } from "@/lib/supabase/org";

export type ReanalyzeResult = { ok: true } | { ok: false; error: string };
export type UpdatePerspectiveResult = { ok: true } | { ok: false; error: string };

export type DashcamPerspective = "insured" | "witness" | "adverse";

/**
 * Updates a claim's dashcam_perspective and resets it to pending so re-analysis
 * fires automatically via the AnalysisTrigger.
 */
export async function updateClaimPerspective(
  claimId: string,
  perspective: DashcamPerspective,
): Promise<UpdatePerspectiveResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return { ok: false, error: "Not authenticated." };

  const orgId = await getOrgIdForUser(supabase, user.id);
  if (!orgId) return { ok: false, error: "No organization context." };

  const { data: claim, error: claimError } = await supabase
    .from("claims")
    .select("id, user_id, status")
    .eq("id", claimId)
    .eq("org_id", orgId)
    .single();

  if (claimError || !claim || claim.user_id !== user.id) {
    return { ok: false, error: "Claim not found or access denied." };
  }

  if (claim.status === "analyzing") {
    return { ok: false, error: "Analysis is already running. Wait for it to finish." };
  }

  const { error: updateError } = await supabase
    .from("claims")
    .update({ dashcam_perspective: perspective, status: "pending", summary: null, liability_score: null })
    .eq("id", claimId)
    .eq("org_id", orgId);

  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath(`/dashboard/claims/${claimId}`);
  return { ok: true };
}

/**
 * Resets a claim to "pending" so the AnalysisTrigger client component fires
 * a fresh analysis run on the next scorecard render.
 */
export async function reanalyzeClaim(claimId: string): Promise<ReanalyzeResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return { ok: false, error: "Not authenticated." };

  const orgId = await getOrgIdForUser(supabase, user.id);
  if (!orgId) return { ok: false, error: "No organization context." };

  const { data: claim, error: claimError } = await supabase
    .from("claims")
    .select("id, user_id, status")
    .eq("id", claimId)
    .eq("org_id", orgId)
    .single();

  if (claimError || !claim || claim.user_id !== user.id) {
    return { ok: false, error: "Claim not found or access denied." };
  }

  if (claim.status === "analyzing") {
    return { ok: false, error: "Analysis is already running. Wait for it to finish." };
  }

  const { error: updateError } = await supabase
    .from("claims")
    .update({ status: "pending", summary: null, liability_score: null })
    .eq("id", claimId)
    .eq("org_id", orgId);

  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath(`/dashboard/claims/${claimId}`);
  return { ok: true };
}

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB — align with serverActions.bodySizeLimit
const BUCKET = "evidence";

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "file";
}

function defaultClaimNumber(): string {
  return `CLM-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

/** Keeps the real PostgREST/Postgres message first; adds a short hint for common PDF cases. */
function formatPdfEvidenceInsertError(raw: string): string {
  if (/row-level security/i.test(raw)) {
    return `${raw}\n\nRLS blocked this row: you must be logged in as the claim owner (claim.user_id = your user) with org membership.`;
  }
  if ((/file_type|document/i.test(raw) || /evidence_file_type/i.test(raw)) && (/check constraint|not-null/i.test(raw))) {
    return `${raw}\n\nfile_type: pull the latest supabase_migration_evidence_file_type_document.sql and run it again — it drops every evidence CHECK whose definition mentions file_type, then re-adds one that allows \`document\`.`;
  }
  if (/evidence_source_type_check|source_type/i.test(raw) && /check constraint/i.test(raw)) {
    return `${raw}\n\nsource_type: run supabase_migration_evidence_source_type_check.sql (full allow-list includes \`other\`). The app now sends \`police_report\` for PDF batch uploads so this usually passes without SQL.`;
  }
  if (/violates check constraint/i.test(raw)) {
    return `${raw}\n\nList evidence checks in Supabase SQL: select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.evidence'::regclass and contype = 'c';`;
  }
  return raw;
}

export type UploadClaimResult =
  | { ok: true; claimId: string; evidenceId: string; batchId: string | null }
  | { ok: false; error: string };

/**
 * Receives dashcam video or image from the client, uploads to Supabase Storage,
 * and inserts `claims` + `evidence` rows.
 */
export async function uploadClaimEvidence(formData: FormData): Promise<UploadClaimResult> {
  return Sentry.withServerActionInstrumentation(
    "uploadClaimEvidence",
    {
      headers: await headers(),
      formData,
    },
    async (): Promise<UploadClaimResult> => {
      const supabase = await createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        return { ok: false, error: "You must be signed in to upload evidence." };
      }

      const orgId = await getOrgIdForUser(supabase, user.id);
      if (!orgId) {
        return {
          ok: false,
          error: "No organization assigned. Add a row in user_org_memberships for your user.",
        };
      }

      const file = formData.get("file");
      if (!(file instanceof File) || file.size === 0) {
        return { ok: false, error: "A non-empty file is required." };
      }

      if (file.size > MAX_BYTES) {
        return { ok: false, error: `File exceeds ${MAX_BYTES / (1024 * 1024)} MB limit.` };
      }

      const stateRaw = formData.get("state_code");
      const state_code =
        typeof stateRaw === "string" && stateRaw.trim().length >= 2
          ? stateRaw.trim().toUpperCase().slice(0, 2)
          : "";

      if (!state_code) {
        return { ok: false, error: "state_code is required (e.g. IL)." };
      }

      const claimNumberRaw = formData.get("claim_number");
      const claim_number =
        typeof claimNumberRaw === "string" && claimNumberRaw.trim().length > 0
          ? claimNumberRaw.trim()
          : defaultClaimNumber();

      // Derive MIME from file extension if the browser didn't detect one —
      // dashcam files often have missing/empty type metadata.
      const EXT_MIME: Record<string, string> = {
        mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
        mkv: "video/x-matroska", avi: "video/x-msvideo",
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
        pdf: "application/pdf",
      };
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const mime = (file.type && file.type !== "application/octet-stream")
        ? file.type
        : EXT_MIME[ext] ?? "video/mp4";
      const isPdf = mime === "application/pdf" || ext === "pdf";
      // PDFs: use explicit 'document' so NOT NULL columns and the analyze route agree. If insert fails with a
      // check constraint, run supabase_migration_evidence_file_type_document.sql in Supabase.
      const effective_file_type: string | null = mime.startsWith("image/")
        ? "image"
        : isPdf
          ? "document"
          : "video";

      // Derive source_type from MIME — the AI classifier will refine this during analysis.
      // PDFs use police_report (not "other") so older DBs whose source_type CHECK omits "other" still accept inserts.
      const source_type =
        effective_file_type === "image" ? "damage_photo" :
        isPdf ? "police_report" :
        "dashcam_video";

      const VALID_SUBMITTED_BY = ["insured", "adjuster", "attorney", "tpa", "thirdparty", "system"] as const;
      const submittedByRaw = formData.get("submitted_by");
      const submitted_by =
        typeof submittedByRaw === "string" && (VALID_SUBMITTED_BY as readonly string[]).includes(submittedByRaw)
          ? submittedByRaw
          : "insured";

      const capturedAtRaw = formData.get("captured_at");
      const captured_at =
        typeof capturedAtRaw === "string" && capturedAtRaw.trim()
          ? new Date(capturedAtRaw).toISOString()
          : null;

      const batchIdRaw = formData.get("batch_id");
      const batch_id =
        typeof batchIdRaw === "string" && batchIdRaw.trim().length > 0
          ? batchIdRaw.trim()
          : null;

      // Optional perspective per evidence item (used when grouping multiple files into one claim)
      const VALID_PERSPECTIVES = ["insured", "adverse", "witness", "officer", "neutral"] as const;
      const perspectiveRaw = formData.get("perspective");
      const evidence_perspective =
        typeof perspectiveRaw === "string" && (VALID_PERSPECTIVES as readonly string[]).includes(perspectiveRaw)
          ? perspectiveRaw
          : null;

      // Optional: add evidence to an existing claim instead of creating a new one.
      // Used when grouping multiple files under one claim from the batch upload form.
      const existingClaimIdRaw = formData.get("claim_id");
      const existingClaimId =
        typeof existingClaimIdRaw === "string" && existingClaimIdRaw.trim().length > 0
          ? existingClaimIdRaw.trim()
          : null;

      let claimId: string;

      if (existingClaimId) {
        // Verify the user owns this claim before attaching evidence to it
        const { data: existingClaim, error: fetchError } = await supabase
          .from("claims")
          .select("id")
          .eq("id", existingClaimId)
          .eq("org_id", orgId)
          .eq("user_id", user.id)
          .single();

        if (fetchError || !existingClaim) {
          return { ok: false, error: "Claim not found or access denied." };
        }
        claimId = existingClaim.id as string;
      } else {
        const { data: claim, error: claimError } = await supabase
          .from("claims")
          .insert({
            org_id: orgId,
            user_id: user.id,
            claim_number,
            state_code,
            status: "pending",
            dashcam_perspective: "insured",
            ...(batch_id ? { batch_id } : {}),
          })
          .select("id")
          .single();

        if (claimError || !claim) {
          if (claimError?.code === "23505") {
            return {
              ok: false,
              error: "That claim number is already in use. Leave it blank for an auto-generated number.",
            };
          }
          return { ok: false, error: claimError?.message ?? "Failed to create claim." };
        }
        claimId = claim.id as string;
      }

      const objectName = `${orgId}/${user.id}/${claimId}/${safeFileName(file.name)}`;

      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectName, buffer, {
        contentType: mime,
        upsert: false,
      });

      if (uploadError) {
        if (!existingClaimId) {
          await supabase.from("claims").delete().eq("id", claimId).eq("org_id", orgId);
        }
        return { ok: false, error: uploadError.message };
      }

      const { data: ev, error: evError } = await supabase
        .from("evidence")
        .insert({
          org_id: orgId,
          claim_id: claimId,
          file_path: objectName,
          file_type: effective_file_type,
          source_type,
          submitted_by,
          original_filename: file.name,
          file_size_bytes: file.size,
          ...(captured_at ? { captured_at } : {}),
          ...(evidence_perspective ? { perspective: evidence_perspective } : {}),
        })
        .select("id")
        .single();

      if (evError || !ev) {
        await supabase.storage.from(BUCKET).remove([objectName]);
        if (!existingClaimId) {
          await supabase.from("claims").delete().eq("id", claimId).eq("org_id", orgId);
        }
        const raw = evError?.message ?? "Failed to save evidence record.";
        return { ok: false, error: isPdf ? formatPdfEvidenceInsertError(raw) : raw };
      }

      revalidatePath("/dashboard/claims");
      revalidatePath(`/dashboard/claims/${claimId}`);
      if (batch_id) revalidatePath(`/dashboard/batch/${batch_id}`);

      return { ok: true, claimId, evidenceId: ev.id as string, batchId: batch_id };
    },
  );
}

export type AddEvidenceResult =
  | { ok: true; evidenceId: string }
  | { ok: false; error: string };

const VALID_SOURCE_TYPES_ADD = [
  "dashcam_video", "surveillance_video", "bystander_video", "telematics_video",
  "police_report", "recorded_statement", "witness_statement", "scene_diagram",
  "damage_photo", "repair_estimate", "medical_record", "other",
] as const;
type AddSourceType = typeof VALID_SOURCE_TYPES_ADD[number];

const EXT_MIME_ADD: Record<string, string> = {
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  mkv: "video/x-matroska", avi: "video/x-msvideo",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  pdf: "application/pdf",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav",
  ogg: "audio/ogg", flac: "audio/flac",
};

/**
 * Add a new evidence file to an existing claim.
 * Resets the claim to "pending" so re-analysis fires automatically via AnalysisTrigger.
 * Accepts video, images, PDFs, and audio files.
 */
export async function addEvidenceToExistingClaim(
  claimId: string,
  formData: FormData,
): Promise<AddEvidenceResult> {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: "You must be signed in to upload evidence." };

  const orgId = await getOrgIdForUser(supabase, user.id);
  if (!orgId) return { ok: false, error: "No organization assigned." };

  // Verify claim ownership
  const { data: claim, error: claimError } = await supabase
    .from("claims")
    .select("id, user_id, status")
    .eq("id", claimId)
    .eq("org_id", orgId)
    .single();

  if (claimError || !claim || claim.user_id !== user.id) {
    return { ok: false, error: "Claim not found or access denied." };
  }
  if (claim.status === "analyzing") {
    return { ok: false, error: "Analysis is already running. Wait for it to finish before adding evidence." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "A non-empty file is required." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: `File exceeds ${MAX_BYTES / (1024 * 1024)} MB limit.` };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime =
    file.type && file.type !== "application/octet-stream"
      ? file.type
      : EXT_MIME_ADD[ext] ?? "application/octet-stream";

  const isPdf =
    mime === "application/pdf" || ext === "pdf" || mime.toLowerCase().includes("pdf");
  const file_type_db: string | null =
    mime.startsWith("video/")
      ? "video"
      : mime.startsWith("image/")
        ? "image"
        : isPdf
          ? "document"
          : null;

  const sourceTypeRaw = formData.get("source_type");
  const source_type: AddSourceType =
    typeof sourceTypeRaw === "string" && (VALID_SOURCE_TYPES_ADD as readonly string[]).includes(sourceTypeRaw)
      ? (sourceTypeRaw as AddSourceType)
      : mime.startsWith("image/") ? "damage_photo"
      : mime.startsWith("video/") ? "dashcam_video"
      : isPdf ? "police_report"
      : mime.startsWith("audio/") ? "recorded_statement"
      : "other";

  const submittedByRaw = formData.get("submitted_by");
  const VALID_SUBMITTED_BY = ["insured", "adjuster", "attorney", "tpa", "thirdparty", "system"] as const;
  const submitted_by =
    typeof submittedByRaw === "string" && (VALID_SUBMITTED_BY as readonly string[]).includes(submittedByRaw)
      ? submittedByRaw
      : "adjuster";

  const capturedAtRaw = formData.get("captured_at");
  const captured_at =
    typeof capturedAtRaw === "string" && capturedAtRaw.trim()
      ? new Date(capturedAtRaw).toISOString()
      : null;

  const gpsLatRaw = formData.get("gps_lat");
  const gpsLonRaw = formData.get("gps_lon");
  const gps_lat = typeof gpsLatRaw === "string" && gpsLatRaw ? parseFloat(gpsLatRaw) : null;
  const gps_lon = typeof gpsLonRaw === "string" && gpsLonRaw ? parseFloat(gpsLonRaw) : null;

  const objectName = `${orgId}/${user.id}/${claimId}/${safeFileName(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectName, buffer, {
    contentType: mime,
    upsert: false,
  });

  if (uploadError) return { ok: false, error: uploadError.message };

  const { data: ev, error: evError } = await supabase
    .from("evidence")
    .insert({
      org_id: orgId,
      claim_id: claimId,
      file_path: objectName,
      file_type: file_type_db,
      source_type,
      submitted_by,
      original_filename: file.name,
      file_size_bytes: file.size,
      ...(captured_at ? { captured_at } : {}),
      ...(gps_lat != null && !isNaN(gps_lat) ? { gps_lat } : {}),
      ...(gps_lon != null && !isNaN(gps_lon) ? { gps_lon } : {}),
    })
    .select("id")
    .single();

  if (evError || !ev) {
    await supabase.storage.from(BUCKET).remove([objectName]);
    const raw = evError?.message ?? "Failed to save evidence record.";
    return { ok: false, error: isPdf ? formatPdfEvidenceInsertError(raw) : raw };
  }

  // Reset claim to pending so AnalysisTrigger fires re-analysis
  await supabase
    .from("claims")
    .update({ status: "pending", summary: null, liability_score: null, synthesis_raw: null })
    .eq("id", claimId)
    .eq("org_id", orgId);

  revalidatePath(`/dashboard/claims/${claimId}`);
  return { ok: true, evidenceId: ev.id as string };
}
