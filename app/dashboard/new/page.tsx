import { BatchUploadForm } from "@/components/claims/batch-upload-form";

export const metadata = { title: "Upload Claims — Axiom VLA" };

export default function NewClaimPage() {
  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-5 py-10 sm:px-8 sm:py-16">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Upload evidence</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Select one or more dashcam videos or images. Set state and claim number per file,
          then submit — analysis starts automatically and you can track progress in real time.
        </p>
      </div>
      <BatchUploadForm />
    </div>
  );
}
