import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Gavel,
  BarChart3,
  Shield,
  Layers,
  Clock,
  ArrowRight,
  Users,
} from "lucide-react";
import { AgenticHeroPanel } from "@/components/landing/agentic-hero-panel";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard/new");

  return (
    <div className="flex flex-col">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b bg-background pb-24 pt-16 sm:pt-24">
        {/* Blue radial glow behind copy */}
        <div
          className="pointer-events-none absolute -left-32 -top-32 size-[600px] rounded-full bg-blue-100/60 blur-3xl"
          aria-hidden
        />
        {/* Subtle grid texture */}
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,oklch(0.50_0.22_255/0.04)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.50_0.22_255/0.04)_1px,transparent_1px)] bg-[size:64px_64px]"
          aria-hidden
        />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">

            {/* Copy */}
            <div className="flex flex-col gap-6">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-1 text-xs font-medium text-blue-700">
                <span className="size-1.5 animate-pulse rounded-full bg-blue-500" />
                Adjuster co-pilot for evidence review
              </div>
              <h1 className="text-balance font-heading text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Evidence support for complex auto claims.{" "}
                <span className="text-primary">In minutes.</span>
              </h1>
              <p className="text-pretty text-lg leading-relaxed text-muted-foreground">
                Upload dashcam footage, damage photos, or other evidence and get structured
                timelines, comparative-fault <span className="whitespace-nowrap">modeling</span>, and
                inconsistency flags — for your team to <span className="font-medium text-foreground">review and decide</span>.
                Final liability always stays with the adjuster.
              </p>
              <p className="text-pretty text-sm text-muted-foreground">
                Built with input from claims professionals.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "gap-2 shadow-md shadow-blue-200")}>
                  Try it on a claim <ArrowRight className="size-4" aria-hidden />
                </Link>
                <a
                  href="#how-it-works"
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
                >
                  See how it works
                </a>
              </div>
              <p className="text-xs text-muted-foreground/70">
                SOC 2 in progress · Data stays scoped to your organization
              </p>
            </div>

            {/* Agentic live panel */}
            <div className="relative mx-auto w-full max-w-md lg:max-w-none">
              <div className="absolute -inset-6 rounded-3xl bg-blue-500/10 blur-3xl" aria-hidden />
              <AgenticHeroPanel />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────────────────────── */}
      <section className="border-b bg-blue-600">
        <div className="mx-auto grid max-w-4xl grid-cols-3 divide-x divide-blue-500 px-4 sm:px-6 lg:px-8">
          {[
            { value: "~2 min", label: "from upload to review package" },
            { value: "Jurisdiction", label: "statute references where helpful" },
            { value: "Full", label: "evidence trail for every file" },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-1 py-7 text-center">
              <span className="text-2xl font-bold tabular-nums text-white sm:text-3xl">{stat.value}</span>
              <span className="text-xs text-blue-200 sm:text-sm">{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="border-b py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <span className="mb-3 inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-blue-600">
              How it works
            </span>
            <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              From evidence upload to a clear review in three steps
            </h2>
            <p className="mt-3 text-muted-foreground">
              No training required. You stay in the decision role — the tool handles the first pass on the evidence.
            </p>
          </div>

          <HowItWorksSection />
        </div>
      </section>

      {/* ── Capabilities ─────────────────────────────────────────────────── */}
      <section className="border-b bg-blue-50/60 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-14 text-center">
            <span className="mb-3 inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-blue-700">
              Capabilities
            </span>
            <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              Everything your team needs
            </h2>
            <p className="mt-3 text-muted-foreground">
              Built for the way adjusters and TPAs actually work.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Layers,
                title: "Comparative-fault modeling (indicative)",
                description:
                  "See modeled ranges and confidence when evidence supports it. When the file is thin or models disagree, the review package says so — so adjusters know where to dig in before a final fault call.",
              },
              {
                icon: Gavel,
                title: "Statute references as supporting context",
                description:
                  "Where a timeline event lines up to your reference traffic rules, a statute is suggested as backup — not a legal conclusion. You apply judgment the way you already do, with a paper trail for review.",
              },
              {
                icon: Clock,
                title: "Second-by-second timeline",
                description:
                  "The incident is reconstructed moment by moment. Click any event in the timeline to jump to that exact frame in the dashcam footage.",
              },
              {
                icon: Users,
                title: "Adjuster has final say",
                description:
                  "Agree or dispute each line in the file. Record your own fault percentage and notes. Modeled output and your determination are always tracked separately.",
              },
              {
                icon: BarChart3,
                title: "Leakage monitoring",
                description:
                  "Track where model output and adjuster determinations diverge. Outliers surface automatically — useful for internal QA and shadow audits, not a substitute for claims policy.",
              },
              {
                icon: Shield,
                title: "Standalone now, connect later",
                description:
                  "Web app for pilots today: upload, review, one-click export. Integrations with claim cores come next — the review package is built to travel as structured output, not to replace your system of record on day one.",
              },
            ].map((f) => (
              <div key={f.title} className="group flex flex-col gap-4 rounded-2xl border border-blue-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex size-11 items-center justify-center rounded-xl bg-blue-600 shadow-sm shadow-blue-200">
                  <f.icon className="size-5 text-white" aria-hidden />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Responsible AI callout ────────────────────────────────────────── */}
      <section className="border-b py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-8 py-10 text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-blue-600 shadow-md shadow-blue-200">
              <Shield className="size-6 text-white" aria-hidden />
            </div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight">
              Evidence in. Structured review out. The adjuster decides.
            </h2>
            <p className="mt-4 text-pretty text-muted-foreground">
              Axiom is <span className="font-medium text-foreground">not</span> an automated fault engine and does not
              replace adjuster judgment or your legal process. It summarizes what the evidence can support,
              surfaces disagreements and gaps, and leaves final liability to licensed staff — every
              review package says so.
            </p>
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-blue-700 to-blue-900 py-24">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="font-heading text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            See it on one of your own claims.
          </h2>
          <p className="mt-4 text-blue-200">
            Upload a claim and get a structured evidence review and indicative comparative-fault modeling
            in under five minutes. No training required to see value on your own files.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-blue-700 shadow-lg shadow-blue-900/30 transition-colors hover:bg-blue-50"
            >
              Get started free <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <p className="mt-5 text-xs text-blue-300">
            AI-assisted analysis for adjuster review only. Not legal advice.
          </p>
        </div>
      </section>

    </div>
  );
}
