import Link from "next/link";
import { Building2, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/auth/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getOrgProfileForUser } from "@/lib/supabase/org";

export async function SiteNavbar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const orgProfile = user ? await getOrgProfileForUser(supabase, user.id) : null;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-md outline-none ring-offset-background transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/framelogo.svg"
            alt="Axiom VLA"
            width={48}
            height={48}
            className="h-11 w-11 shrink-0 animate-[spin_3s_linear_infinite] object-contain motion-reduce:animate-none sm:h-12 sm:w-12"
          />
          <span className="font-heading text-lg font-semibold tracking-tight sm:text-xl">Axiom VLA</span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-3" aria-label="Main">
          <Link
            href="/"
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Home
          </Link>
          {user ? (
            <>
          <Link
            href="/dashboard/new"
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            New claim
          </Link>
          <Link
            href="/dashboard/claims"
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            My Claims
          </Link>
          <Link
            href="/dashboard/review-queue"
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Queue
          </Link>
          <Link
            href="/dashboard/analytics"
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Analytics
          </Link>
          <Link
            href="/dashboard/import"
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Import
          </Link>
              {orgProfile ? (
                <span
                  className="inline-flex max-w-[min(9rem,28vw)] items-center gap-1.5 sm:max-w-[13.75rem]"
                  title={`Workspace: ${orgProfile.name} · ${orgProfile.slug}`}
                >
                  <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate text-sm font-medium text-foreground">{orgProfile.name}</span>
                </span>
              ) : (
                <span
                  className="inline-flex max-w-[min(11rem,40vw)] items-center gap-1.5 rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-xs text-amber-950 dark:text-amber-100 sm:max-w-[17.5rem]"
                  title="New accounts normally get a workspace from the DB trigger on auth.users. If this never resolves, run supabase_schema.sql (or supabase_migration_signup_org_provisioning.sql) in the Supabase SQL editor, or insert user_org_memberships manually."
                >
                  <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">No workspace — check DB</span>
                </span>
              )}
              <span
                className="hidden max-w-[200px] truncate text-sm text-muted-foreground lg:inline"
                title={user.email ?? ""}
              >
                {user.email}
              </span>
              <form action={signOutAction}>
                <Button type="submit" variant="outline" size="sm">
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <Link href="/login" className={cn(buttonVariants({ size: "sm" }))}>
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
