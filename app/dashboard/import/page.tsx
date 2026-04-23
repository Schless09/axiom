import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ImportForm } from "@/components/claims/import-form";

export const metadata = { title: "Import Claims — Axiom VLA" };

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-muted-foreground" aria-hidden />
            <h1 className="text-2xl font-semibold tracking-tight">Import Historical Claims</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload a CSV of closed claims with adjuster outcomes for retroactive shadow audit analysis.
          </p>
        </div>
        <Link href="/dashboard/analytics" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Analytics
        </Link>
      </div>

      {/* How it works */}
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        {[
          {
            step: "1",
            title: "Import outcomes",
            desc: "Upload a CSV with claim numbers, states, adjuster fault %, and settlement amounts.",
          },
          {
            step: "2",
            title: "Upload videos",
            desc: "Match dashcam or incident footage to each claim. AI analysis runs automatically.",
          },
          {
            step: "3",
            title: "View variance",
            desc: "Analytics dashboard shows where AI disagrees with historical adjuster decisions.",
          },
        ].map((item) => (
          <div key={item.step} className="flex gap-3 rounded-lg border bg-card px-4 py-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
              {item.step}
            </span>
            <div>
              <p className="text-sm font-medium">{item.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <ImportForm />
    </div>
  );
}
