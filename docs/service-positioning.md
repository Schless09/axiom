# Axiom — Service Positioning & Sales Brief

---

## Describe your service offering in as much detail as possible

Axiom is an AI-powered liability review platform built specifically for auto insurance claim operations. Adjusters, TPAs, and self-insured fleet operators upload claim evidence — dashcam video, damage photos, police reports, recorded statements, or audio — and receive a structured liability scorecard in minutes.

The core analysis pipeline works like this:

1. **Evidence ingestion.** Adjusters upload one or many evidence files per claim. Each file is classified automatically (dashcam video, damage photo, PDF report, audio statement, etc.) and stored in a private, org-scoped vault. GPS coordinates and capture timestamps can be attached to any item for weather context retrieval.

2. **Multi-model analysis.** Three leading vision AI models — Google Gemini, OpenAI GPT-4o, and Anthropic Claude — analyze each piece of evidence simultaneously and independently, each using the same rigorously engineered prompt built in the voice of a senior liability adjuster. Models produce: a frame-by-frame timeline of events with timestamps, a recommended liability percentage (0–100% insured fault), violation tags drawn from a controlled vocabulary, a confidence rating (high / medium / low), and a professional narrative in adjuster file-note style.

3. **Hallucination and coherence check.** After all three models return, a fourth AI pass (Gemini Flash) acts as a quality-control auditor: it reads the three model narratives side-by-side and checks whether all three are observing the same physical scene, or whether one model is hallucinating — describing a different setting, different actors, or a different incident entirely. If an outlier is found, it is named, its discrepancy explained, and the claim is automatically flagged for human review.

4. **Consensus scoring.** A consensus engine merges the three outputs: liability is averaged, timelines are merged on anchor timestamps, model agreement is classified as strong (≤10 pp spread), moderate, or weak (>20 pp spread). When models fundamentally disagree on material facts — whether another vehicle was present, whether contact occurred — the liability score is withheld entirely and the claim routes to an adjuster queue.

5. **Statute alignment.** Every timeline event is matched against a jurisdiction-specific statutes database covering major US states. Matches use exact violation tags first (deterministic), then token-overlap scoring as a fallback. The resulting citation list shows the statute text, violation type, and match confidence alongside the timeline.

6. **Multi-evidence synthesis.** When a claim has multiple evidence items, a synthesis engine combines the individual analyses — weighting police reports above dashcam video for official citations, checking damage patterns for consistency with claimed speed, running coarse physics plausibility checks on deceleration and impact force, and pulling historical weather and road condition data from the time and location of the incident. The synthesis produces a unified liability figure with a confidence band and a list of review reasons.

7. **Adjuster review layer.** On the scorecard, adjusters can: agree or dispute individual timeline events, set a final fault percentage that overrides the AI figure, enter reserve amounts, and write file notes. Draft reviews can be saved and submitted. Every submitted review creates an AI-vs-adjuster delta record for leakage analysis.

8. **Leakage monitoring.** An org-wide analytics dashboard shows: KPI trends over time (average AI liability, average adjuster override, average delta), a 6-month leakage trend with claims flagged as high-variance, a jurisdiction breakdown table (leakage rate and average dollar exposure per state), model confidence distributions, and a one-click CSV export of all claims above a configurable leakage threshold for shadow audit submissions.

9. **Review queue.** Claims are automatically surfaced in a prioritized review queue sorted by urgency score — synthesis flags, model confidence, liability extremes, and claim age — so adjusters always know which files need attention first.

10. **Batch operations.** Multiple claims can be uploaded in a single batch. A live batch status page shows analysis progress per claim. Historical closed claims can be imported by CSV (claim number, state, fault %, reserve, adjuster notes) to bootstrap leakage analysis against existing books of business.

All data is org-scoped with row-level security. Every AI output is logged with model version, prompt version, token counts, and estimated cost per run for full audit traceability.

---

## What outcome do you promise to deliver for your clients, and why does it matter?

**The promise:** a statute-aligned liability position on every piece of claim evidence, reviewed by three independent AI models, in under five minutes — with a human adjuster making the final call.

**Why it matters:** The average auto liability claim takes 2–7 days to assign preliminary fault, driven by adjuster workload and the manual, inconsistent process of watching video and looking up statutes. Delay costs money directly (reserving inaccuracy compounds over time) and indirectly (higher litigation exposure the longer a claim sits open).

**The numbers:**
- Industry data consistently places **loss leakage** — the gap between what carriers pay and what they should have paid — at **5–10% of total incurred losses**. For a TPA handling $100M in annual losses, that is $5M–$10M leaving the table every year.
- AI-assisted review reduces average **time-to-liability-position** from days to **under 5 minutes** per evidence item.
- Three-model consensus with a hallucination check raises AI output reliability significantly above any single-model approach — the system self-identifies when it cannot confidently score and routes to a human rather than guessing.
- Consistent, statute-cited outputs reduce the **adjuster-to-adjuster variance** that drives settlement inconsistency within the same organization.
- Shadow audit preparation — historically a multi-day manual pull — becomes a one-click CSV export.

---

## What sets you apart from competitors?

**Multi-model consensus with adversarial hallucination detection.** No single AI model is reliable enough for consequential liability decisions. Axiom VLA runs three independent frontier models against every piece of evidence, then runs a fourth model to check whether the first three watched the same video. Competitors use one model. We use four.

**Built for the claims file, not the demo.** The AI output is written in professional adjuster file-note style, in past tense, with no AI meta-language. It references specific timestamps, produces violation tags from a controlled vocabulary, and cites statutes by jurisdiction. It is designed to be dropped directly into a claims management system, not cleaned up before use.

**Statute alignment is deterministic, not generated.** Statute citations come from a seeded jurisdiction database matched by controlled vocabulary tags — the model cannot hallucinate a statute reference. The LLM identifies the violation type; the rule engine finds the citation.

**The score is withheld when it shouldn't be trusted.** When models disagree on material facts — whether another vehicle appeared, whether contact occurred — Axiom suppresses the liability score and routes the claim for human review. Most systems give a number no matter what. We tell you when we don't know.

**Adjuster feedback closes the loop.** The adjuster review layer captures the human decision alongside the AI position. Every override becomes a labeled data point for leakage analysis, model benchmarking, and future prompt improvement. The system gets better as your adjusters use it.

**Multi-evidence synthesis weighs source authority.** A police report carries more statutory weight than a dashcam angle. A damage photo that is inconsistent with the claimed speed is a red flag. Axiom synthesizes across evidence types with an explicit weighting model — not a single pass over one video clip.

**Full audit trail, per run.** Every model call is logged with provider, model version, prompt version, token counts, and cost. Regulators and defense counsel asking "how did you reach this number" get a complete, timestamped record.

---

## What pain points does your service eliminate?

**The video backlog.** Dashcam footage sits unwatched because there aren't enough adjuster hours to review it all. Axiom processes video in minutes, automatically, clearing the backlog without adding headcount.

**Inconsistent adjuster findings.** Two adjusters watching the same video reach different liability numbers. Axiom applies a consistent, documented methodology to every clip — the same prompt, the same statute database, the same scoring rubric — every time.

**Statute lookup friction.** Matching a dashcam event to the relevant state traffic statute is time-consuming and error-prone. Axiom does it automatically, by jurisdiction, with a controlled vocabulary that maps violation types to statute rows.

**Leakage you can't see.** Most carriers know they have leakage; very few can quantify it by jurisdiction, model, or claim type without a custom reporting project. Axiom surfaces it in real time on the analytics dashboard.

**Shadow audit preparation.** Assembling a shadow audit cohort — pulling claims, standardizing fields, computing AI-vs-adjuster deltas — can take a team days. Axiom exports it as a CSV in one click.

**Litigation exposure from undocumented decisions.** When a claim goes to litigation, "the adjuster watched the video and decided" is a weak record. Axiom produces a structured, statute-cited, multi-model liability assessment with a full audit trail that documents the reasoning behind every decision.

**Single-model AI risk.** Deploying one LLM for liability decisions introduces undetectable hallucination risk. If Gemini says 70% and it's wrong, you have no signal. If Gemini says 70%, GPT-4o says 72%, and Claude says 0% — you know something is wrong. Axiom makes disagreement visible rather than hidden.

---

## What is your pricing structure and how does it demonstrate ROI?

Axiom is priced per analyzed claim, with volume tiers aligned to book size. There are no per-seat licenses and no minimum annual analyst headcount.

**Illustrative structure:**
- **Pilot / proof-of-concept:** flat monthly fee covering a defined claim cohort (e.g. 500 claims/month), full feature access, onboarding, and shadow audit reporting support
- **Production tiers:** per-claim pricing that decreases at volume thresholds — the unit cost of AI analysis drops as claim volume rises
- **Add-ons:** additional evidence types per claim (audio transcription, multi-evidence synthesis), dedicated support, custom statute jurisdiction packages

**ROI framing:**
- If Axiom identifies even **1 pp of additional leakage recovery** on a $50M annual loss book, it returns **$500,000** — against a platform cost measured in the tens of thousands
- If it reduces average time-to-liability-position by 3 days across 10,000 claims per year, the compounding reserve accuracy improvement alone justifies the cost
- The platform cost per claim is a fraction of one hour of adjuster time — for analysis that takes the adjuster hours, not minutes

---

## What guarantees do you offer and what happens if a claim doesn't score correctly?

Axiom is a decision-support tool, not a decision-maker. Every output includes an explicit AI disclaimer — "Final liability determination is the responsibility of the licensed adjuster" — and the adjuster override layer is a first-class feature, not an afterthought.

**Built-in quality gates:**
- Claims where models fundamentally disagree have their liability score withheld automatically — they are not presented as confident assessments
- Claims where the scene coherence check flags a likely hallucination are routed to the human review queue
- Claims where overall confidence is low display a "Review recommended" banner; low-confidence timeline events are marked in red

**If an analysis is wrong:** the adjuster disputes the specific event, overrides the fault percentage, and the claim is logged with the delta. That delta feeds directly into the leakage monitoring and model benchmarking systems. A re-analyze button resets the claim for a fresh multi-model run — useful after changing the dashcam perspective or adding additional evidence.

**Pilot structure:** initial engagements are structured as shadow audits — AI scores run in parallel with existing adjuster decisions, with no change to current workflow. This generates a defensible accuracy benchmark before any process change, and the delta analysis quantifies the financial opportunity before full deployment.

---

## What is the best-case scenario if clients work with you?

An adjuster uploads a dashcam clip. Before they finish their coffee, they have: a statute-cited liability position reviewed by three independent AI models, a timeline of events with timestamps they can seek to in the video, a confidence rating, a flagged note that one of the models described a different scene and the other two agree the insured was at fault, and a review queue that sorted this claim ahead of the other forty waiting for attention. They spend their time on judgment, negotiation, and relationship — not on watching video and looking up statutes.

At the organizational level: leakage shrinks visibly on the jurisdiction breakdown chart. Shadow audit cohorts get assembled in minutes. Model accuracy is benchmarked per prompt version so the system improves over time. New adjusters onboard faster because the AI provides a consistent baseline. And when a claim goes to litigation, there is a multi-model, statute-cited, timestamped record of every decision.

---

## What is the worst-case scenario if clients don't work with you?

The status quo: video evidence goes un-reviewed or reviewed inconsistently. Leakage accumulates — invisible on any dashboard, unmeasurable without a custom reporting project. Settlement decisions vary by adjuster, by shift, and by workload. Shadow audit preparation is a manual project that happens quarterly at best. Single-model AI tools get deployed to cut costs, introducing hallucination risk with no detection mechanism. And when a claim goes to litigation, "the adjuster watched it" is the record.

The industry is moving toward AI-assisted claims regardless. The question is whether an organization adopts a system built with multi-model checks, statute alignment, adjuster override workflows, and full audit trails — or a single-model tool that produces a number with no accountability layer.

---

## How many employees do your ideal clients have?

**Primary target:** TPAs and regional carriers with **50–500 employees** in claims operations, handling **5,000–100,000 auto liability claims per year**. Large enough to have measurable leakage, small enough that custom in-house AI development is not economical.

**Secondary target:** Self-insured fleets and captives with **dedicated claims or risk management teams** (typically 10–50 people) — they have video evidence but limited adjuster capacity to review it.

**Tertiary:** Large national carriers and mega-TPAs — the sales cycle is longer, procurement requirements are heavier, but the dollar opportunity per client is significantly larger.

---

## Who has the decision-making authority to invest in your services?

The economic buyer is typically the **VP of Claims**, **Chief Claims Officer**, or **VP of Operations** — the person responsible for combined ratio improvement, adjuster efficiency, and leakage control. They have P&L accountability for the outcomes Axiom delivers.

The technical champion is often a **Claims Technology Director** or **Senior Adjuster / Litigation Specialist** who understands the evidence review workflow well enough to evaluate AI output quality.

In smaller TPAs and captives, these roles overlap — the **Director of Claims** or **Head of Risk** is often both buyer and user.

Procurement and IT involvement grows at carriers above ~500 employees, where compliance, data residency, and integration requirements enter the conversation.

---

## What are the goals of your clients?

- **Reduce loss leakage** — recover dollars being left on the table through inconsistent or under-supported liability decisions
- **Improve combined ratio** — every percentage point of loss ratio improvement has direct P&L impact
- **Scale claims capacity without scaling headcount** — handle more claims per adjuster without sacrificing quality
- **Reduce litigation exposure** — documented, consistent, statute-cited decisions are harder to attack in discovery
- **Accelerate time-to-close** — faster liability positioning means faster reserving, faster settlement, lower carrying cost
- **Pass shadow audits** — TPA contracts increasingly include shadow audit requirements; being able to demonstrate AI-assisted review with human override is a competitive differentiator in RFPs
- **Benchmark adjuster consistency** — identify variance across adjusters, offices, and jurisdictions before it becomes a pattern

---

## What problems do your target clients face without you?

- Video evidence backlogs that never fully clear
- Liability decisions that vary by adjuster, caseload, and experience level
- No visibility into leakage until a quarterly or annual reserve review
- Statute lookup done manually, inconsistently, or skipped entirely
- Shadow audit preparation that ties up analyst time for days
- Inability to benchmark AI tools without a multi-model comparison framework
- Single-model AI deployments with no mechanism to detect or contain hallucination
- New adjuster ramp time of months because there is no consistent methodology to learn from

---

## What pain points keep your target clients up at night?

**"We know we have leakage but we can't prove where it is."** The reserves look right in aggregate but no one can say which jurisdictions, claim types, or adjusters are driving variance.

**"Our adjusters watch the video but they still disagree."** Two senior adjusters watch the same dashcam clip and one says 40%, one says 70%. The settlement depends on who picked up the phone.

**"We're using AI but I don't trust it."** One model, one output, no check. If it hallucinates, no one catches it until the claim is closed.

**"We can't staff our way through the video backlog."** Hiring adjusters is expensive and slow. Video volume from dashcam proliferation keeps growing. The math doesn't work.

**"We have a shadow audit requirement in six months."** The TPA contract requires demonstrating AI-assisted review with documented decision support. There is no system in place to produce that documentation.

**"A defense attorney is asking how we reached our liability number."** The answer — "the adjuster reviewed the footage" — is insufficient. Discovery is about documentation, and there isn't any.

---

## Is there anything else we should know about your service offering?

**This is not a black-box verdict machine.** Axiom is explicitly designed around human judgment. The AI produces a position; the adjuster makes the decision. The system is designed to make disagreement visible (multi-model consensus), to know when it doesn't know (score suppression, hallucination routing), and to capture the human override as the authoritative record. That design philosophy is a legal and regulatory necessity, not just a product preference.

**The pilot structure is low-risk by design.** The first engagement is a shadow audit: AI scores run in parallel with existing adjuster workflow, with zero change to current process. The output is a delta analysis showing where the AI agreed with adjusters, where it disagreed, and what the financial opportunity looks like. The client sees the system's accuracy before committing to process change.

**Prompt versioning and model benchmarking are built in.** Every AI analysis is stamped with the prompt version used. When prompts are updated, historical analyses remain queryable by the old version. This makes it possible to run controlled before/after comparisons as the system evolves — a capability that matters for regulatory defensibility and for demonstrating continuous improvement to TPA clients.

**The statute database is jurisdiction-specific and continuously expandable.** Coverage today includes major US states. New jurisdictions are added by extending the seed data — the matching logic does not change. Coverage can be prioritized by the states in a client's book of business.

**The system is multi-tenant and org-scoped by design.** Data is isolated at the organization level with row-level security in the database. No org can see another org's claims, evidence, or analytics. This is the architecture required for TPA deployments where a single platform serves multiple carrier clients.

**Integration is API-ready.** The analyze pipeline is built as a REST endpoint. Webhooks and TPA system integrations (CMS, FNOL platforms, document management systems) are the planned next phase and are on the roadmap for post-pilot deployments.
