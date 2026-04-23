"use client";

import { useEffect, useRef, useState } from "react";
import { FileVideo, ScanLine, Gavel } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    step: 1,
    icon: FileVideo,
    title: "Upload the evidence",
    description:
      "Dashcam video, damage photos, or other claim documents. Drag and drop, or batch upload dozens of claims at once.",
  },
  {
    step: 2,
    icon: ScanLine,
    title: "First pass on the file",
    description:
      "Frame-by-frame review that builds a timeline, highlights inconsistencies, and suggests comparative-fault ranges — with statute references where they help, not as a substitute for your judgment.",
  },
  {
    step: 3,
    icon: Gavel,
    title: "Your adjuster decides",
    description:
      "A review package with timeline, supporting references, and indicative modeling. Agree or dispute each line, add notes, and record your fault determination — always separate from the model output.",
  },
];

// Delays in ms: icon, connector after it, text
const ICON_DELAYS  = [0,   650, 1300];
const LINE_DELAYS  = [200, 550];
const TEXT_DELAYS  = [150, 800, 1450];

export function HowItWorksSection() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.45 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="relative grid gap-10 sm:grid-cols-3">

      {/* ── Connector lines (desktop only) ────────────────────────── */}
      {LINE_DELAYS.map((delay, i) => (
        <div
          key={i}
          className="pointer-events-none absolute hidden sm:block"
          style={{
            /* sits between icon centres at top-8 (32px) */
            top: "2rem",
            left:  i === 0 ? "calc(33.33% - 0.5rem)"  : "calc(66.66% - 0.5rem)",
            right: i === 0 ? "calc(66.66% - 0.5rem)"  : "calc(33.33% - 0.5rem) + 0.5rem",
            // simpler: use explicit left/right percents
          }}
          aria-hidden
        >
          <div className="overflow-hidden">
            <div
              className="h-px bg-gradient-to-r from-blue-300 to-blue-200 transition-all duration-500 ease-in-out"
              style={{
                width:            visible ? "100%" : "0%",
                transitionDelay:  visible ? `${delay}ms` : "0ms",
              }}
            />
          </div>
        </div>
      ))}

      {/* Simpler absolute connector — single full-width line that reveals */}
      <div
        className="pointer-events-none absolute hidden sm:block"
        style={{ top: "2rem", left: "calc(16.66% + 2rem)", right: "calc(16.66% + 2rem)" }}
        aria-hidden
      >
        <div className="overflow-hidden">
          <div
            className="h-px bg-gradient-to-r from-blue-200 via-blue-400 to-blue-200 transition-[width] duration-[1400ms] ease-in-out"
            style={{
              width: visible ? "100%" : "0%",
              transitionDelay: visible ? "200ms" : "0ms",
            }}
          />
        </div>
      </div>

      {/* ── Steps ─────────────────────────────────────────────────── */}
      {STEPS.map((item, i) => (
        <div key={item.step} className="flex flex-col items-center gap-4 text-center">

          {/* Icon — scales + fades in */}
          <div
            className={cn(
              "relative flex size-16 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-200 transition-all duration-500 ease-out",
              visible ? "scale-100 opacity-100" : "scale-75 opacity-0"
            )}
            style={{ transitionDelay: visible ? `${ICON_DELAYS[i]}ms` : "0ms" }}
          >
            <item.icon className="size-7 text-white" aria-hidden />
            <span
              className={cn(
                "absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-blue-600 shadow-sm ring-1 ring-blue-100 transition-all duration-300",
                visible ? "scale-100 opacity-100" : "scale-0 opacity-0"
              )}
              style={{ transitionDelay: visible ? `${ICON_DELAYS[i] + 120}ms` : "0ms" }}
            >
              {item.step}
            </span>
          </div>

          {/* Text — slides up + fades in */}
          <div
            className={cn(
              "transition-all duration-500 ease-out",
              visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
            )}
            style={{ transitionDelay: visible ? `${TEXT_DELAYS[i]}ms` : "0ms" }}
          >
            <h3 className="text-lg font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
          </div>

        </div>
      ))}
    </div>
  );
}
