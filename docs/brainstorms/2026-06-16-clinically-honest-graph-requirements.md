---
date: 2026-06-16
topic: clinically-honest-graph
---

# Clinically Honest Health Graph

## Problem Frame

The `/demo/record` health graph is the product's clearest expression of its thesis — *"every node is grounded in a record you could cite."* A CMO review found that the graph's most authoritative signal — the change rings (improved / worsened / stable / new) — **contradicts the very source chunks it claims to be grounded in**, because the demo hand-authors the `change` decoration on each fixture node instead of deriving it from the recorded values. Verified contradictions today (`prisma/fixtures/synthetic/graph-narrative.ts`):

| Marker | Ring shows | Cited record says | Defect |
|---|---|---|---|
| LDL | 🔴 worsened ↑ 3.1→3.6 | 3.6 → **2.9** ("meaningful improvement") | **Red alarm on an improving marker.** Baseline 3.1 is in no source. |
| HbA1c | ⚪ stable 5.7→5.7 | **5.9** → 5.7 (via 6.1 mid-way) | Wrong baseline + direction; the 6.1 peak is discarded. |
| Free‑T | 🔵 new — → **19.5** | **9.5** → **11.8** | Labelled "new" despite a 2024 value; 19.5 is fabricated. |
| Ferritin | 🟢 improved 42→71 | 42 → **68** | Value + unit (µg/L vs ng/mL) mismatch. |

A red "worsened" ring on a marker that improved is a patient-safety pattern, not a cosmetic bug. Beyond the data errors, the graph makes clinical claims it isn't entitled to: it collapses *measurement movement* and *clinical judgment* into one tone, asserts causation via `CAUSES` edges (e.g. "low‑normal ferritin → causes → fatigue", where ferritin 42 isn't even deficient), renders a validated lab and a self‑reported symptom with identical authority, and shows every node at equal salience with no clinical priority.

**Who is affected:** any clinician or prospective customer evaluating the demo (trust collapses the moment a ring disagrees with its citation), and — by extension — the integrity standard for the real product. **Why it matters now:** the graph is the headline demo surface; its credibility *is* the pitch.

The fix is a single governing rule: **the source record is the single source of truth; every visual state is derived from it and can never contradict it.**

## Requirements

**A. Truth integrity (single source of truth)**
- R1. Every visual state — value direction, delta, classification, clinical tone, ring/badge — is **derived** from a node's source-grounded values (recorded before/after numbers, units, dates, reference ranges, clinical context). Hand-authoring a ring state, classification, or tone is prohibited. A visual state must never be able to contradict the citation behind it.
- R2. Fix the current demo contradictions so each marker exactly matches its cited source values, units, and dates: no fabricated values, no unit mismatches, no "new" label when a prior measurement exists, no direction that disagrees with the numbers.
- R3. Anti-regression path: rings/badges are *computed* by a derived-change engine, not assigned. Reuse the engine the authed `/record` path already uses (`classifyChange` / `diffLatestPanels` in `src/lib/markers/panel-diff.ts`) so the demo and the real product share one truth path; the demo stops carrying a hand-authored `change` field. If the values say LDL improved, the graph *cannot* render a worsened ring.

**B. Honest, realistic persona**
- R4. Re-author the persona **only through its source records** (not through styling) so a clinically useful mix emerges *from the data*: ≥1 marker genuinely improves, ≥1 cardiometabolic marker genuinely worsens despite other gains, ≥1 stays borderline / needs monitoring, and ≥1 is genuinely newly measured (the next panel expanded scope).
- R5. Clinical realism over drama — the case must read as a plausible patient (lifestyle-change trajectory with mixed response), never contrived just to exercise visual states.

**C. Separate measurement movement from clinical judgment**
- R6. Encode movement and judgment as **distinct dimensions**, not one collapsed "improved/worsened" (the current `classification` conflates them):
  - **value direction:** increased / decreased / stable / new
  - **clinical status:** favourable / unfavourable / uncertain / needs‑context
  - **confidence:** low / medium / high
  - **actionability:** monitor / act / retest / clinician‑review
- R7. The dimensions may honestly disagree — e.g. ferritin *increased* (direction) but status *uncertain* (it's an acute‑phase reactant; without TSAT/CRP a rise may be inflammation, not repletion), or HbA1c *decreased* but *needs‑context* (this patient's improving iron status can lower HbA1c independent of glycemia).

**D. Safe relationships (no causal overclaim)**
- R8. Remove `CAUSES`. Replace with a vocabulary that does not assert unproven causation: `associated_with`, `may_contribute_to`, `changed_after`, `action_targets`, `needs_follow_up`, `supported_by`. A relationship may assert causation only when clinically proven.

**E. Evidence grading**
- R9. Source strength is visually distinct so nodes/edges render authority proportional to their evidence: validated lab > wearable‑derived estimate > self‑reported symptom > inferred relationship. A self-reported "energy" node must not read with the same authority as a lab ferritin.

**F. Clinical priority**
- R10. Surface the clinically important story as a **priority cluster** rather than all-nodes-equal. For this persona that is cardiometabolic risk — borderline HbA1c, atherogenic lipids, boundary blood pressure, central adiposity — presented as the salient signal, not buried among equally-weighted nodes.

## Success Criteria

The user's acceptance criteria, restated as pass/fail gates:
- No visual state can contradict its cited source.
- No fabricated values; no unit mismatches.
- No "new" label where prior measurements exist.
- No `CAUSES` edges unless clinically proven.
- All visual states are derived from source data (none hand-styled).
- At least one **honest setback** appears in the demo through source data, not manual styling.
- The graph **feels clinically honest, not just visually complete** — a clinician reviewing it should not catch the tool overclaiming.

## Scope Boundaries

- This is about the **graph's clinical logic and its demo expression**, demonstrated on `/demo/record`. It is not a regulated clinical decision tool and does not issue medical advice (the existing non-advice framing stays).
- The derived-change engine should be the **real, reusable** logic (shared with the authed path), not a demo-only shim — but the *persona content* re-authored here is fixture-only.
- Not in scope: a full assay-interference / confounder inference engine, or a formal ≥3-point trend-statistics model. R6's "needs‑context" status and R7's examples capture the *honesty* (the tool flags uncertainty) without building a reasoning engine. A multi-point trend model is a separate future brainstorm.
- Not in scope: changing the authed `/graph` user experience. Any shared-engine changes must preserve the authed path's current behaviour.

## Key Decisions

- **Source record is the single source of truth; visual states are derived, never authored.** This is the spine — it makes every other requirement an implementation of one rule, and makes contradiction structurally impossible rather than a thing to police.
- **Reuse the authed path's derive engine** (`classifyChange`/`diffLatestPanels`) rather than computing change in the demo. One truth path for demo and product; the demo's job becomes carrying honest *source values*, not decorations.
- **Persona realism beats visual completeness.** If honest data yields fewer tones, that's acceptable; R4 re-authors the *records* so a realistic mix appears truthfully, never via styling.
- **Causation requires proof.** Default relationship language is associative / temporal / contributory; `CAUSES` is removed, not relabelled-in-place.

## Dependencies / Assumptions

- The reference ranges and clinical-status thresholds (what counts as favourable/unfavourable/needs‑context per marker) are clinical content. Assume standard guideline ranges (ADA for HbA1c, NICE/lipid targets, age/sex lab ranges) as the starting point, with CMO review of the specific values.
- The current `NodeChangeWire` model (`src/types/graph.ts`) and the demo fixture model (`prisma/fixtures/demo-navigable-record.ts`, `prisma/fixtures/synthetic/graph-narrative.ts`) will need to evolve to carry source values + the R6 dimensions; the canonical `EdgeType` set will need the R8 vocabulary. These are technical shapes for planning.

## Outstanding Questions

### Resolve Before Planning
- *(none — the governing rule and acceptance criteria are decided; planning can proceed.)*

### Deferred to Planning
- [Affects R3][Technical] How much of `classifyChange`/`diffLatestPanels` can the demo reuse directly vs. needs a thin source-values adapter, given the demo has no DB/observations? Resolve against the actual engine signatures.
- [Affects R6][Technical] Data-model shape for the four dimensions on the wire/fixture node, and how the canvas renders them (the current ring encodes one tone — direction vs status vs confidence vs actionability need a visual language). Likely pairs with R9/R10 in the canvas.
- [Affects R8][Technical] Whether to extend the canonical `EdgeType` enum (`src/lib/graph/types.ts`) with the safe vocabulary or map demo-local types; the authed schema must stay valid.
- [Affects R4, R7][Needs clinical input] The specific re-authored persona records — which marker worsens, exact values/units/dates, and the reference ranges per marker — drafted in planning for CMO sign-off.
- [Affects R9, R10][Technical] Visual encoding for evidence grade and the priority cluster on the existing force canvas (without re-introducing the layout/determinism risks the graph already manages).

## CMO Direction — locked 2026-06-16

The Chief Medical Officer reviewed and gave binding direction. The governing constraint above everything else:

> **Do not let the canvas become a medical dashboard. It must feel like a *performance-baseline canvas* with clinical safety underneath — show one credible change, one newly captured signal, and one clear next step, without implying diagnosis.**

This is a **regulatory guardrail**, not just a tone preference: per MHRA, a product's *intended purpose* is shaped by its labelling, language and presentation — so the copy and framing must keep the product in the wellness / information / clinician-prep lane, not the regulated-medical-device lane. ([MHRA: Software & AI as a Medical Device](https://www.gov.uk/government/publications/software-and-artificial-intelligence-ai-as-a-medical-device/software-and-artificial-intelligence-ai-as-a-medical-device))

### Persona (R4–R5) — DONE
36-year-old active gym member, trains 4×/week, uses Oura/Whoop, feels broadly well, wants recovery/energy/long-term performance. 2024 prior bloodwork; 2026 MorningForm baseline. **Shipped** in `prisma/fixtures/synthetic/graph-narrative.ts`:
- **LDL-C 2.7 → 3.4 mmol/L** = the credible worsened change. `3.0` is a **MorningForm attention threshold**, *not* a clinical treatment threshold (UK lipid decisions use broader CVD risk + non-HDL targets + family history, not one LDL number — NICE NG238).
- **ApoB 0.98 g/L** = the new signal. Framed **"new baseline captured,"** never "worsened" (no prior value).
- 2024 lipids reframed to an optimal baseline; the dyslipidaemia *diagnosis* became an **"LDL above attention threshold"** *attention item* appearing in 2026.

### Four consumer dimensions (R6–R7) — TO BUILD
Show consumer-friendly labels (internally = status / trend / confidence / actionability):
1. **Where it is now** · 2. **What changed** · 3. **How clear the signal is** · 4. **What to do next**

Per-marker interpretation matrix (CMO-authored — use verbatim):
| Marker | Where it is now | What changed | Signal clarity | Next step |
|---|---|---|---|---|
| **LDL-C** | Above attention threshold | Increased 2.7 → 3.4 mmol/L | Medium–High (same unit, comparable context) | Review full lipid profile + overall risk with a clinician; track diet, alcohol, training load, weight, family history |
| **ApoB** | New baseline captured | No previous comparison | Medium (useful, no personal trend yet) | Use as a reference point for retesting; review alongside LDL-C, non-HDL, triglycerides, family history |
| **Ferritin** | Value-dependent | Prior-dependent | Context-dependent (acute-phase reactant — interpret with CRP/inflammation) | Interpret with CRP/FBC, symptoms, clinician context |
| **HbA1c** | Value-dependent | Prior-dependent | Needs context if iron status / red-cell markers abnormal | Interpret with glucose markers + iron/FBC context |

### Flag taxonomy (do NOT visually blur these)
1. **Attention** — "worth watching" (performance/longevity signals; most of the product lives here).
2. **Clinician-discussion** — "worth discussing with a GP/private doctor" (interpretation needs medical context).
3. **Escalation** — "requires clinical review before user-facing interpretation" (critical values / red flags only).

### Canvas hierarchy (R6/R9/R10) — keep it simple, ONE dominant hierarchy
- **Top authority cue:** "Built from verified lab results, wearable trends and your intake. Flagged items are for tracking or clinician discussion, not diagnosis." (+ "Safety-reviewed where required by a clinical reviewer." when reviewed.)
- **Marker cards:** name · current value · previous (if any) · small trend indicator · one plain-English sentence · one next-step label.
- **One priority cluster: "Cardiometabolic baseline"** — LDL-C increased, ApoB newly captured, full lipid context needs review. Cluster copy: *"worth watching because one lipid marker has moved upward and a new particle marker has been captured. This is a tracking and clinician-discussion signal, not a diagnosis."*
- **Do not** add four loud visual channels (avoids the medical-cockpit feel). Anything potentially diagnostic routes to **clinician handover**, never a user-facing conclusion.

### Ship gate (CMO)
Phase 1 (truth integrity) is shippable as the patient-safety fix. The **full canvas** must NOT ship until all five are locked: (1) marker/persona values ✅, (2) interpretation matrix ✅ (above), (3) visual hierarchy ✅ (above), (4) escalation language ✅ (above), (5) clinical sign-off on thresholds/rules ✅. With these locked, the interpretation engine + canvas reframe may be built against this signed-off language.

## Next Steps

→ `/ce:plan` (or resume the active plan `docs/plans/2026-06-16-002-feat-clinically-honest-graph-plan.md`) to build the **interpretation engine + consumer dimensions + flag taxonomy + canvas reframe** against the locked CMO direction above. Truth integrity (R1–R3 ✅), no-causal-overclaim (R8 ✅), evidence grading (R9 ✅), and the honest persona (R4–R5 ✅) are already implemented on branch `feat/clinically-honest-graph`.
