# Auto claims adjuster lifecycle & Axiom product fit

This doc is for **internal positioning and sales**: what adjusters actually do end-to-end, where software/AI can realistically help, and **where Axiom fits today** (not a promise of future roadmap unless noted).

Related: [`service-positioning.md`](./service-positioning.md), [`mvp-to-product-checklist.md`](./mvp-to-product-checklist.md).

---

## 1. The through-line

An auto claims adjuster’s job is to **establish facts**, **apply coverage and law**, **quantify money**, and **document decisions** — under time pressure, severity rules, and regulatory expectations. It is part investigator, part negotiator, part project manager, and part customer handler.

**In one sentence:** figure out what happened, who owes what under the policy and state law, pay the right amount, and close an auditable file.

---

## 2. End-to-end lifecycle (“crash to cash”)

| Phase | What happens |
|-------|----------------|
| **FNOL (First Notice of Loss)** | Claim is opened: who, what, where, when; initial severity (minor vs total loss vs injury); claim file created. Intake may be phone, app, agent, or third-party report. |
| **Initial contact** | Reach insured, claimant, witnesses; set expectations; often **recorded statements**; start a timeline. Emotions and incomplete stories are normal. |
| **Investigation** | Collect statements, **police report**, **photos/video (incl. dashcam)**, inspections, prior damage, **weather/road context**; watch for fraud signals. |
| **Liability** | Assign fault (0–100% or comparative splits) using **state law**, traffic rules, and carrier guidelines. This drives who pays whom. |
| **Damage (vehicle)** | Repairable path: estimate, approve, monitor repairs. **Total loss:** ACV, repair vs value threshold, salvage, settlement offer. |
| **Coverage** | Policy effective? Which coverages apply (liability, collision, comp, etc.)? Limits, deductibles, exclusions. |
| **Negotiation** | With body shops, claimants, attorneys; rental duration; total loss value disputes. |
| **Rental / logistics** | Authorize and cap rental; align with repair timeline — a real cost lever. |
| **Payment / settlement** | Pay shops, insureds, third parties; document every decision. |
| **Subrogation** | When the carrier pays first but another party owes, pursue **recovery** from the at-fault party or their insurer. |
| **Fraud / SIU** | Ongoing; narrow, repeatable patterns often work better than “catch all fraud.” |
| **Closure** | File complete, compliant, and ready for audit or litigation support. |

**Role split (typical):** liability vs **physical damage** vs **total loss** vs **bodily injury** vs **field**. Axiom is closest to **liability + investigation** for **auto/casualty evidence** (especially **video and multi-evidence files**), not to full medical **BI** handling or shop **estimating systems** (CCC/Audatex).

---

## 3. Where AI / software can realistically win (industry pattern)

These are **patterns** buyers recognize; they are not a commitment that Axiom builds all of them.

| Opportunity area | What “good” looks like | What usually fails |
|------------------|------------------------|--------------------|
| **FNOL & intake** | Structured data before a human chases missing fields | “Replace humans” on messy narratives only |
| **Liability decision support** | Summarize evidence, surface inconsistencies, **support** (not unilateral) fault judgment | “Autonomous fault” with no human sign-off in regulated settings |
| **Estimate intelligence** | Second opinion, anomaly flag vs book | Fully automated repair estimates in all edge cases |
| **Negotiation / benchmarking** | Historical ranges, “you’re off book” nudges | Black-box “this claimant settles at $X” with no explainability |
| **Total loss explainability** | Transparent comps and adjustments | One number with no defensible breakdown |
| **Subrogation ops** | Demands, tracking, follow-ups | Promising full recovery rates |
| **Fraud** | **Narrow** patterns, SIU handoff | “Catch all fraud” |
| **Adjuster co-pilot** | Summaries, next steps, draft notes — **on top of** existing CMS | Rip-and-replace core policy/claims systems |

**Positioning line that works in front of carriers:** *You are buying **speed, consistency, and documentation** for evidence-heavy liability work — not a robot adjuster and not a core system replacement.*

---

## 4. Axiom: current product fit vs that map

Axiom (Axiom) is a **liability evidence review** product: **multi-model** analysis, **consensus**, **statute alignment**, **human override**, and **leakage-oriented analytics** — not a full FNOL suite or a body-shop estimating product.

| Industry “win zone” | Role Axiom plays **today** | Gaps / not the core SKU |
|---------------------|------------------------------|---------------------------|
| **FNOL / structured intake** | **Light** — upload flows and CSV import for pilots; not a policyholder TurboTax-style FNOL | Deep telephony/app FNOL, agent-facing intake |
| **Liability from evidence** | **Core** — VLA-style outputs, multi-model agreement, **withhold score** when material facts conflict, **scene coherence / hallucination** check, perspective handling | Full legal determinations; department of insurance filings |
| **Investigation (video, docs, audio, photos)** | **Core** — video frame pipeline, **PDF/audio/damage** paths, **multi-evidence synthesis**, weather/physics as signals | Full SIU case management |
| **Statute / traffic law alignment** | **Core** — jurisdiction-stamped references from a **curated** statutes DB + controlled tags; not LLM-invented citations | Every statute in every state without seed data |
| **Damage $ / total loss** | **Partial** — damage *interpretation* for liability context; **not** CCC/Audatex replacement or ACV comp engines | Primary estimating and valuation dispute workflow |
| **Coverage / policy interpretation** | **Partial** — policy-style outputs where engineered; not a full policy engine | Guaranteed coverage determination |
| **Negotiation intelligence** | **Partial** — org analytics, AI–adjuster **delta** and **leverage** story | Claimant-level settlement prediction product |
| **Subrogation** | **Adjacency** — better **documentation** of liability story; not automated demands/recovery | Subrogation platform |
| **Fraud** | **Indirect** — inconsistency, low confidence, model disagreement; not SIU “fraud score” as a product | Certified fraud investigation |
| **Adjuster “co-pilot”** | **Partial** — scorecard, timeline, **review queue**, **export**; not embedded in Guidewire/Duck Creek as the primary UI | Full CMS-embedded co-pilot everywhere |

**Summary:** Axiom is strongest where the industry map says **“liability decision support + evidence”** — exactly the space where “replace the adjuster” is **not** credible, but “make the adjuster **faster and more defensible**” **is**.

---

## 5. Suggested phrasing for decks and calls

- **We don’t** replace the adjuster, **rip out** core claims systems, or **auto-pay** from a single model.  
- **We do** turn **video and multi-type evidence** into a **file-ready, statute-aware liability position** with **multi-model checks**, **explicit uncertainty**, and a **full audit trail** for the part of the file that otherwise burns hours and drives inconsistency.  
- **Pilot posture:** **shadow** AI vs current process (or vs adjuster opinion), measure **time**, **agreement**, and **delta** — see analytics and export paths in the app.

---

*Last updated: Apr 2026. Adjust rows as the product and roadmap change.*
