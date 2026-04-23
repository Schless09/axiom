import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/auth/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export async function SiteNavbar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
