import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type Props = {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
};

export function LegalDocLayout({ title, lastUpdated, children }: Props) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4 shrink-0" aria-hidden />
        Back to home
      </Link>
      <h1 className="font-heading text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
      <div className="mt-10 space-y-6 text-sm leading-relaxed text-foreground">{children}</div>
    </div>
  );
}

export function LegalH2({ children }: { children: React.ReactNode }) {
  return <h2 className="pt-4 text-base font-semibold tracking-tight text-foreground">{children}</h2>;
}

export function LegalP({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground">{children}</p>;
}

export function LegalUl({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5 text-muted-foreground">{children}</ul>;
}
