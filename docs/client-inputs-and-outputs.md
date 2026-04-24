# Client inputs and outputs — Axiom VLA

This document describes what a **client organization** (carrier, TPA, fleet, or pilot partner) must supply to use Axiom, and what they receive back in the product and in exports. It reflects the current application behavior.

---

## 1. What the client provides (inputs)

### 1.1 Access and identity

| Input | Required? | Notes |
|--------|-----------|--------|
| **User accounts** | Yes | Each user signs in via the app’s auth flow. New users get an **organization** scoped to them at signup (multi-tenant isolation). |
| **Org context** | Automatic | Claims and evidence are tied to the user’s org; uploads and analysis enforce org + ownership rules in the app. |

*Operational expectation:* the client designates who may upload evidence, run analysis, and submit adjuster reviews (today the product does not split **adjuster vs admin** roles inside the same org; that is a future enhancement per the product checklist).

---

### 1.2 Per-claim data (always)

| Input | Required? | Format / rules |
|--------|-----------|----------------|
| **Claim number** | Yes | Unique identifier the client uses (string). Duplicates within the same user’s book are skipped on CSV import. |
| **State / jurisdiction** | Yes | **US state code** (e.g. `IL`, `TX`, `CA`). Used for statute alignment and reporting. Must be a valid two-letter code (including `DC`). |

---

### 1.3 Evidence files (primary input for AI analysis)

Clients upload one or more files per claim. The system stores them in a private, org-scoped vault and classifies/runs the appropriate analysis pipeline.

| Constraint | Value |
|------------|--------|
| **Maximum file size** | **100 MB** per file (upload and server actions are aligned to this cap). |
| **Supported shapes** | **Video** (e.g. dashcam), **images** (e.g. damage photos), **documents** (e.g. PDF police reports), **audio** (e.g. recorded statements) — MIME detection drives `file_type`; the uploader can set or refine **source type** where the UI allows it. |

**Evidence source types** the classifier and pipelines understand (labels may be auto-suggested from content):

- `dashcam_video`, `surveillance_video`, `bystander_video`, `telematics_video`
- `police_report`, `recorded_statement`, `witness_statement`
- `scene_diagram`, `damage_photo`, `repair_estimate`, `medical_record`, `other`

**Optional metadata** (when present in the product data model):

- **GPS latitude / longitude** and **captured-at** timestamp on evidence — used for **historical weather / road context** in synthesis when APIs and data are available.
- **Dashcam perspective** (insured / adverse / witness, etc.) — can be set **after** upload on the scorecard; changing it triggers **re-analysis** so the model interprets the video from the correct viewpoint.

**Client operational inputs that improve quality but are not always mandatory in the UI:**

- Clear **original filenames** and consistent **claim numbering** for audit trails.
- **Additional evidence** on the same claim (multi-evidence) so the **synthesis** layer can weigh police report vs video vs photos, run consistency checks, and surface review reasons.

---

### 1.4 Historical claims import (CSV) — optional

Used to **bootstrap** books of business for **leakage / shadow-audit** views: create pending claims and optionally attach **human outcomes** so the app can compute AI vs adjuster deltas once AI scores exist.

**Required columns**

- `claim_number`
- `state_code`

**Optional columns**

- `adjuster_fault_percent` — integer **0–100**. If present, a **submitted** `claim_reviews` row is created for that claim with this fault percentage.
- `settlement_amount` — positive number (currency symbols and commas stripped). Stored as **`reserve_amount`** on that imported review for exposure-style analytics and CSV export.

**Template example**

```csv
claim_number,state_code,adjuster_fault_percent,settlement_amount
CLM-001,IL,65,45000
```

Imported claims start in **`pending`** status until the client uploads evidence and analysis runs.

---

### 1.5 Adjuster review inputs (human layer)

On the scorecard, after AI output exists, adjusters can supply:

| Input | Purpose |
|--------|---------|
| **Agree / dispute** on timeline events (with notes) | Records structured disagreement with the AI timeline. |
| **Final fault %** | Overrides the AI liability score for the claim file. |
| **Reserve amount** | Feeds leakage / exposure calculations. |
| **File notes** | Free-text notes stored with the review. |
| **Save draft / Submit** | Draft vs submitted review; submitted reviews drive **AI vs adjuster delta** metrics. |

---

### 1.6 Report style samples (onboarding, optional but high-value)

To calibrate AI narrative output to a carrier's or TPA's **exact house style**, the client may supply one or more **sanitized sample reports** from closed claims. These are used to set the tone, terminology, and section structure of `case_file_narrative` output so the AI writes in a format their adjusters recognize and trust.

| Input | Required? | Notes |
|-------|-----------|-------|
| **Closed claim report sample(s)** | Optional | 1–3 examples of a completed adjuster report in the client's preferred format. Must be **sanitized** — no claimant PII, no open-matter details. PDF, Word, or plain text accepted. |
| **Terminology preferences** | Optional | Notes on house style: e.g. "we say 'claimant unit' not 'adverse vehicle'" or "do not include reserve recommendations in AI output." Can be a short paragraph rather than a full sample. |

**Why this matters:** Without a style sample, the AI defaults to a generic senior-adjuster voice. With even one real report, the system can match vocabulary, section order, confidence language, and conclusion framing to what the client's team already reads and approves — dramatically reducing adjuster friction and review time.

**How it is used:** Style samples are stored at the **org level** and injected as a formatting example in the AI prompt at inference time (few-shot style matching). No PII from the sample is retained in the AI output or stored with active claims.

*Collect these during onboarding or pre-pilot scoping. Asking for a sanitized sample is also a strong signal-of-intent question — clients who share one are genuinely evaluating the integration.*

---

### 1.7 Technical / deployment inputs (if the client runs their own instance)

Not “claims data,” but required to operate a private deployment:

- Supabase project (URL, anon/publishable key, **service role** server-side).
- Model API keys (**Gemini** required for core flows; **OpenAI** / **Anthropic** optional for multi-model consensus).
- Optional: **Resend** for “analysis complete” email, **Sentry** for error reporting, **OpenWeatherMap** (if used in your deployment) for weather context, app URL for links in emails.

*In a typical SaaS arrangement, the vendor hosts these; the client only provides SSO or user provisioning per contract. Style samples (§1.6) are always held by the vendor and never exposed to other orgs.*

---

## 2. What the client receives (outputs)

### 2.1 In-app: claim scorecard (per claim)

After analysis completes (`completed` status), the client sees:

| Output | Description |
|--------|-------------|
| **Overall AI liability score** | Suggested **insured fault 0–100%** (when models agree sufficiently; otherwise the product may **withhold** the score and route to review — see trust gates in positioning docs). |
| **Summary / narrative** | Adjuster-style narrative and claim-level summary (including **synthesis** text when multiple evidence items exist). |
| **Per-evidence analysis** | For each file: structured **VLA-style** output (timeline with timestamps, violation tags, confidence, provider-specific raw results where stored). |
| **Statute alignment** | Matches between timeline / violation vocabulary and **jurisdiction-specific** statute references (deterministic tag match with fallback scoring). |
| **Consensus / quality signals** | Multi-model agreement, scene-coherence / hallucination flags, **“review recommended”** when confidence is low or synthesis flags issues. |
| **Synthesis panel** (multi-evidence) | Unified liability, confidence band, **review reasons**, physics / weather flags as produced by the synthesis engine. |
| **Video experience** | Timeline tied to the **evidence player** (seek to timestamp). Video may be **transcoded** server-side for browser playback. |
| **Export control** | **Export JSON** for the claim (see §2.3). |

---

### 2.2 In-app: operational views

| Surface | Output |
|---------|--------|
| **Claims list** | All of the user’s claims with status, fault estimate, **AI vs adjuster delta** (when a submitted review exists), dates; filters for search, status, state. |
| **Review queue** | Prioritized list of completed claims needing attention (synthesis flags, low confidence, extreme liability, age). |
| **Analytics** | Org-level KPIs: volumes, average AI liability, **average delta**, review rate, liability distribution, model confidence mix, **leakage trend** (e.g. high-variance claims over time), **jurisdiction breakdown** (leakage rate, average delta, exposure-style figures). |
| **Batch upload** | Live status page showing **per-claim progress** when many files are uploaded in one batch. |

---

### 2.3 Downloadable: per-claim JSON export

**Endpoint (authenticated):** `GET /api/claims/:id/export`

**File:** e.g. `axiom-vla-{claim_number}.json`

**Shape (conceptual):**

- `exported_at` — ISO timestamp  
- `disclaimer` — AI-assisted / human adjuster responsibility language  
- `claim` — `id`, `claim_number`, `state_code`, `status`, `liability_score`, `summary`, `created_at`  
- `evidence[]` — per file: `id`, `file_type`, `analysis` (full `vla_analysis_raw` object)

*Use case:* pilot agreements, IT integration, or manual filing alongside the claims management system.

**PII and data handling (include in pilot / DPA language):** The JSON export is a **structured copy of what the system derived from the uploaded evidence**, not a redacted record. Police reports, witness statements, medical or repair documents, and similar files often contain **personally identifiable information** — e.g. driver or passenger names, officer or witness identifiers, addresses, phone or policy references, and vehicle descriptions that could be identifying when combined with other data. The model may **repeat or paraphrase** that material inside `analysis` / narrative fields. **Axiom does not automatically redact names or other PII in exports or in stored analysis JSON.** Pilot agreements should state that the **customer (carrier / TPA)** remains responsible for: (1) lawful collection and use of uploads; (2) restricting download and onward sharing of exports to personnel and systems covered by the engagement; (3) retention and deletion consistent with the customer’s records program; and (4) any **manual redaction or sanitization** before sending a file to a third party (e.g. reinsurer, regulator, or outside counsel) if required by policy or law. Treat exported JSON with the same care as the underlying claim file.

---

### 2.4 Downloadable: shadow-audit CSV (analytics)

From the analytics experience, the client can download a **CSV** that includes:

- Report header: generation time, total claims, reviewed count, **average variance (percentage points)**, count of high-variance claims, **estimated leakage exposure (USD)** where reserves support it.  
- **High-variance claims** table (typically claims with **≥ 15 pp** delta between AI liability and adjuster fault %): claim number, state, AI %, adjuster %, delta, direction (**over-settlement** vs **under-reservation** risk), reserve, estimated exposure for that row.

*Use case:* shadow audits, management reporting, and cohort exports without pulling each JSON by hand.

---

### 2.5 Email (optional)

If outbound email is configured, the user receives an **analysis complete** message with claim reference, AI fault %, link to the scorecard, and the same **AI disclaimer** theme as in exports.

---

## 3. What Axiom explicitly does *not* output

- A **final legal determination of liability** — the product is **decision support**; the licensed adjuster / carrier remains responsible for the final position (disclaimers appear in-product and in JSON export).  
- **Guaranteed scores** when models disagree on material facts — the system is designed to **suppress** unreliable scores and push work to the **review queue** instead of fabricating certainty.

---

## 4. Quick reference — minimum viable client package

**To run AI on new claims**

1. User account and org context  
2. **Claim number** + **state code**  
3. At least one **evidence file** under **100 MB** (video, image, PDF, or audio as supported)  
4. Optional: perspective, extra evidence, GPS/time for richer synthesis  
5. Optional but recommended at onboarding: **1–3 sanitized sample reports** for style calibration (§1.6)  

**To measure leakage vs historical outcomes**

1. CSV with `claim_number`, `state_code`, and optionally `adjuster_fault_percent` / `settlement_amount`  
2. Then upload evidence and run analysis to populate AI scores and deltas  

**To take data out**

1. **JSON** per claim from the scorecard export  
2. **Shadow-audit CSV** from analytics for high-variance cohorts  

---

*This document is meant for pilots and customer-facing discussions. Behavior should be revalidated against the shipped product when you cut a new release.*
