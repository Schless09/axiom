import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border/70 bg-muted/20">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-5 sm:justify-between sm:px-6 lg:px-8">
        <p className="text-center text-xs text-muted-foreground sm:text-left">
          © {new Date().getFullYear()} Axiom VLA
        </p>
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1" aria-label="Legal">
          <Link
            href="/terms"
            className="text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Terms of Service
          </Link>
          <Link
            href="/privacy"
            className="text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Privacy Policy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
