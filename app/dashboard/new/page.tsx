import { BatchUploadForm } from "@/components/claims/batch-upload-form";
import { createClient } from "@/lib/supabase/server";
import { getOrgProfileForUser } from "@/lib/supabase/org";

export const metadata = { title: "Upload Claims — Axiom VLA" };

export default async function NewClaimPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const orgProfile = user ? await getOrgProfileForUser(supabase, user.id) : null;

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-5 py-10 sm:px-8 sm:py-16">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Upload evidence</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Select one or more files — dashcam video, scene photos, or PDFs such as police reports. Set state and claim
          number per file, then submit. Analysis starts automatically and you can track progress in real time.
        </p>
        {orgProfile ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Claims and files are scoped to your workspace{" "}
            <span className="font-medium text-foreground">{orgProfile.name}</span>
            {orgProfile.slug ? (
              <>
                {" "}
                <span className="font-mono text-xs text-muted-foreground">({orgProfile.slug})</span>
              </>
            ) : null}
            .
          </p>
        ) : user ? (
          <div
            className="mt-4 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-50"
            role="status"
          >
            <p className="font-medium">No workspace is linked to this account yet.</p>
            <p className="mt-1 text-amber-900/90 dark:text-amber-100/90">
              Ask your administrator to assign you to an organization, or for local development run the sign-up
              provisioning in{" "}
              <code className="rounded bg-background/60 px-1 py-0.5 text-xs">supabase_schema.sql</code> (or{" "}
              <code className="rounded bg-background/60 px-1 py-0.5 text-xs">
                supabase_migration_signup_org_provisioning.sql
              </code>
              ) so new users receive <code className="rounded bg-background/60 px-1 py-0.5 text-xs">user_org_memberships</code>{" "}
              automatically.
            </p>
          </div>
        ) : null}
      </div>
      <BatchUploadForm />
    </div>
  );
}
