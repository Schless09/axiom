# Sales discovery guide — Axiom

Use this on calls to **qualify the buyer**, **scope a credible pilot**, and **angle the product** toward what Axiom delivers today: **evidence-based liability review** (timeline, structured memo, **when the evidence supports it**—a clear liability read; **when it doesn't**—explicit **review required** / no definitive automated call), plus audit trail—not reserving or leakage without severity and policy data.

### External vs internal framing

- **Buyer-facing:** Prefer **certainty and judgment**, not “model disagreement.” Say things like: **no definitive result identified**, **insufficient certainty for an automated liability assessment**, **review required**, **provisional read**, **adjuster determination required**. That matches adjuster culture: the file either supports a call or it doesn’t.
- **Behind the scenes (don’t lead the call with this):** You may use **independent cross-checks** (separate passes on the same evidence) to spot overconfidence. Lead with **we don’t issue a definitive automated liability call unless the evidence supports one.**

### Dev-heavy phrases → insurance speak (quick swap)

| Avoid (sounds like engineering) | Prefer (claims / procurement) |
|----------------------------------|-------------------------------|
| Model / LLM / provider | Analysis engine, independent read, vendor subprocessors (if they ask) |
| Prompt version | **Analysis version** / “version of the review package we ran” |
| Human in the loop | **Adjuster review required** / supervisory sign-off / no closed file without examiner judgment |
| Ground truth | **Supervisor-reviewed sample** / known-outcome pilot set |
| Integrations | **Feed from the claims system** / data handoff from core (Guidewire, etc.) |
| Copilot | **Workbench**, **assistant**, **first-pass file package** (pick one; “copilot” is increasingly familiar) |
| Single-model overconfidence | **One automated read that’s wrong but sounds sure** |
| Automate a score | **Automated negligence split** / **automated comparative-fault read** (only if they use that language) |
| Audit artifacts | **Audit documentation**—what was reviewed, when, under which version |

---

## How to use this doc

1. **Pick 8–12 questions** that match the persona (carrier vs TPA vs self-insured).
2. **Listen for three signals:** pain you can solve now, pilot measurability, path to budget.
3. **Reframe reserve/leakage asks** into Phase 2 unless they already have structured intake and payment data.

---

## 1. Pain and urgency

- When a new claim arrives with **dashcam + police report + photos**, what should the **first hour** look like—who touches it and what artifact exists after?
- What is the **slowest or costliest step** today: finding facts, writing the file memo, reconciling conflicting stories, or getting **supervisor / peer alignment**?
- How often do **two reviewers read the same clip differently**? What does that cost (rework, reopened files, complaints, cycle time)?
- What types of claims create the most **“we wish we had a faster first read”** pressure?

---

## 2. Workflow and user

- Is evidence review **centralized** (specialty desk) or **distributed** (field adjusters)? Who is the **actual daily user**?
- What is the **system of record** (e.g. Guidewire, Origami, custom)—and is the expectation a **side-by-side workbench** or **inside the claims system**?
- What is the **minimum acceptable first-pass output**: timeline only, narrative memo, liability hypothesis, flags for review—or all of the above?
- Who **signs off** on liability-oriented conclusions today (adjuster, supervisor, legal)?

---

## 3. Evidence and pilot scope

- What share of relevant claims include **video**? **Police or incident reports**? **Repair estimates or photos**?
- Which **evidence formats** matter most in the next 90 days: **video** (e.g. MP4), **PDF**, **photos**, **recorded statements**?
- How common are **multi-video** or **insured vs adverse** footage on one claim? How do you organize that today?
- For a pilot, can they commit to **N claims** with a **supervisor-reviewed sample** or **known outcomes** (even lightweight)?

---

## 4. Governance, trust, and IT

- Is **examiner or supervisory review** before reliance on outputs a **hard requirement**, standard practice, or negotiable?
- Any **vendor non-negotiables**: which **AI or analytics vendors** are acceptable, **data retention**, whether **your claims data may be used to improve** the service, **subprocessors** (third parties who touch data), **where data is processed**?
- What **audit documentation** do you need: **which analysis ran**, **when**, **under what version**, **who acknowledged**—and retention expectations?
- Typical **security / procurement** path: questionnaire, penetration test, **single sign-on**, hosting/network requirements—what’s the realistic timeline?

---

## 5. Success metrics (design the pilot here)

- If this worked in 30–60 days, what moves first: **cycle time**, **consistency**, **escalation quality**, **supervisor load**, **customer complaints**?
- What would you **measure on 20–50 claims** with minimal overhead (e.g. time to first structured read, rubric agreement, usefulness of **review-required** flags)?
- What outcome triggers **“expand to production”** vs **“pilot complete, no purchase”**?
- Can you pre-agree a **commercial trigger**: e.g. if metrics A + B hit → **paid expansion** or **annual order**?

---

## 6. Budget, champion, and procurement

- Who owns **budget**: claims ops, innovation, IT, procurement?
- Is there **pilot funding** already, or are we creating a new line item?
- Who is your **champion**, and who is the **economic buyer**?
- After a successful pilot, what’s the normal path: **enterprise agreement**, **SOW**, **vendor onboarding**—and how long does that usually take?

---

## 7. Angling the product (match their words)

| They emphasize…        | You emphasize… |
|------------------------|----------------|
| Speed, backlog         | Structured timeline + draft memo + consistent format |
| Fear of wrong calls    | **No definitive automated call** when certainty isn’t there—**review required** instead of a false single score |
| Audit, compliance      | **Defensible file documentation**—what was reviewed, when, under which analysis version; adjuster remains decision-maker |
| Reserve, leakage, $  | Phase 1 = **evidence and fault intelligence**; economics needs limits, severity, payments—**Phase 2** with intake / integrations |

**One-line positioning you can say:**

> “Axiom is an **evidence workbench for adjusters**: a faster structured first read on the file, and when the evidence **doesn’t support a definitive liability call**, we say so—instead of sounding sure when we shouldn’t.”

(Optional second line if they ask how you know: *“We run **independent cross-checks** on the same evidence so one automated read can’t ‘sound definitive’ when the file doesn’t support it.”*)

---

## 8. Power questions (close the discovery)

1. *“If your team got a **draft file memo** every time, and a clear **‘definitive call vs review required’** signal when the evidence is ambiguous, **what decision** becomes faster—and **who signs off**?”*
2. *“What would you need to see in **30 days** to justify **paying for production**?”*

---

## 9. What not to promise on early calls

- **Final reserve** or settlement authority from video alone  
- **Leakage %** without payment data, limits, and severity anchors  
- **Fully automated liability** with no human review  

If they push on dollars, respond with: **conditional economics later**; **pilot success = review quality + time + consistency**.

---

## 10. Optional: after the call

- Send a **short recap**: their top 3 pains, proposed pilot scope, success metrics, and **explicit non-goals**.  
- Attach or link **client inputs/outputs** expectations (`docs/client-inputs-and-outputs.md`) so scope stays aligned.
