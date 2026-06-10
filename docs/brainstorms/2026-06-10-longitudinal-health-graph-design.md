---
date: 2026-06-10
topic: longitudinal-health-graph
status: design proposal (pre-/ce:plan)
author: review of current implementation + design
---

# Longitudinal Health Graph — Making Time a First-Class Primitive

> **Read this first.** Every claim below is tagged **EXISTS** (shipped, in
> `main`), **DARK** (built but behind a flag, not user-visible), or
> **PROPOSED** (does not exist; this document is proposing it). The single
> guiding constraint: find the *smallest* change that makes the graph
> longitudinal and clinically useful, reusing the temporal scaffolding the
> codebase already has rather than rewriting the product.
>
> **The headline finding:** the schema already contains most of a temporal
> data model (dated event node-types, temporal edge-types, a real wearable
> time-series, an action→outcome before/after snapshot, a unified trajectory
> reader). The graph feels static for two specific, fixable reasons:
> **(1) lab biomarker values are structurally collapsed to one value per
> marker**, so lab history literally cannot be stored; and **(2) the graph
> renderer has no notion of time** — it draws all of history at once with no
> diff, scrub, or change signal. Fix those two and the moat appears.

---

## 1. Current State — what exists vs what is missing

### 1.1 How the graph represents each concept today

| Concept | Representation | Status |
|---|---|---|
| **Markers (labs)** | `GraphNode type='biomarker'`, **one node per `(userId, canonicalKey)`**; value/unit/range/`collectionDate` in `attributes` JSON (`src/lib/graph/attributes/biomarker.ts`) | **EXISTS — but single-valued (see 1.2)** |
| **Markers (wearables)** | `HealthDataPoint(provider, category, metric, value, unit, timestamp)` — a true append-only time-series (`prisma/schema.prisma:529`) | **EXISTS — genuinely longitudinal** |
| **Sources** | `SourceDocument(kind, capturedAt, contentHash, …)` + `SourceChunk` (byte-offset provenance); deduped by `(userId, contentHash)` | **EXISTS — dated, immutable** |
| **Symptoms** | `GraphNode type='symptom'` (concept) + `type='symptom_episode'` (dated instance) linked by `INSTANCE_OF`; concept carries rolling fields (`currentSeverity`, `lastObservedAt`) | **EXISTS as schema; episodes not produced by any ingest path** |
| **Actions** | `Action(verb, label, markerName, state, acceptedAt, completedAt, dismissedAt)` lifecycle: `suggested→accepted→completed→outcome-measured` / `dismissed` (`prisma/schema.prisma:783`) | **DARK** (behind `DECISIONS_ENABLED`) |
| **Decisions / outcomes** | `ActionOutcome(markerName, beforeValue, beforeAt, afterValue, afterAt)` — a *frozen* before/after snapshot written atomically with the `outcome-measured` transition | **DARK** |
| **Edges** | `GraphEdge(type, fromNodeId, toNodeId, weight, fromChunkId, fromDocumentId, metadata)`; types: `SUPPORTS`, `ASSOCIATED_WITH`, `CAUSES`, `CONTRADICTS`, `TEMPORAL_SUCCEEDS`, `INSTANCE_OF`, `OUTCOME_CHANGED` | **EXISTS — temporal types defined** |
| **Timestamps** | Every node/edge has `createdAt`/`updatedAt`; dated event types carry domain dates (`observation.measuredAt`, `symptom_episode.onsetAt/resolvedAt`, `intervention_event.occurredAt`, `metric_window.periodStart/End`, `biomarker.collectionDate`) | **EXISTS** |
| **Historical values** | Reassembled *at query time* by `buildMarkerTrajectory()` merging biomarker-node values + `HealthDataPoint` rows into `SeriesPoint[]` (`src/lib/markers/trajectory.ts`) | **DARK — and lab arm is single-point (see 1.2)** |
| **Confidence / grounding** | `GraphNode.confidence Float @default(1.0)` (never degraded in practice); grounding via `SUPPORTS` edges → chunk → document; AI answers enforce per-section citation density | **EXISTS (grounding strong; confidence flat)** |

### 1.2 The one structural gap that matters most

Biomarker nodes are upserted by `@@unique([userId, type, canonicalKey])` and
merged **first-write-wins** (`src/lib/graph/mutations.ts:58-74`). `biomarker`
is **not** in `ROLLING_ATTRIBUTE_FIELDS` (`attributes/index.ts:145`), so even
`latestValue` cannot be updated by a later upload.

**Consequence:** upload a second blood panel and the new ferritin value is
*discarded* — the node keeps the first value forever. `loadBiomarkerSeries()`
reads node attributes, so it can only ever return **≤1 lab point per marker**
(`trajectory.ts:125-162`). The "ferritin 25 → 41 → 62" story the deck sells is
**impossible from labs today**; the only multi-point series come from
`HealthDataPoint` (wearables). In the demo persona the two dated panels
(HbA1c 5.9% in 2024-04, 5.7% in 2026-02) exist only as *chunk text*, never as
queryable structured values.

### 1.3 What is missing (clearly distinguished)

- **MISSING — lab marker history.** No way to store >1 dated lab value per
  marker (1.2). This is the root cause and the smallest-fix target.
- **MISSING — any time dimension in the graph renderer.** The D3 canvas
  (`src/components/graph/`) draws *all* of history simultaneously. No time
  scrubber, no "what changed", no before/after, no event overlay. The only
  temporal signal is a +1 importance bonus for nodes cited in a document
  captured in the last 30 days (`src/lib/graph/importance.ts`).
- **MISSING — temporal/causal edges in practice.** `TEMPORAL_SUCCEEDS`,
  `OUTCOME_CHANGED`, `INSTANCE_OF` are defined and endpoint-validated
  (`edge-validation.ts`) but **never created by any ingestion path**
  (confirmed: zero non-test, non-type-def usages). They are latent schema.
- **MISSING — re-test detection / panel diff.** A second upload with a new
  `contentHash` creates a new `SourceDocument`; nothing compares its values to
  prior panels or computes "what changed."
- **MISSING — lab↔wearable name join.** `buildMarkerTrajectory` joins on
  exact (case-insensitive) name; lab displayName `"HbA1c"` ≠ wearable metric
  `"hba1c_percent"`, so the two stores silently fail to merge for the same
  marker.
- **MISSING — uncertainty over time.** `confidence` is a flat `1.0`; nothing
  decays stale values or flags single-draw vs confirmed-trend.

---

## 2. Clinical Model of Time — why a trajectory beats a value

A single result answers "what is this number?" A trajectory answers the
questions a clinician actually asks: *which direction, how fast, since when,
and after what?* Clinically, one value is weak because it conflates signal
with noise — a ferritin of 28 µg/L is a different decision if last quarter it
was 18 (recovering) versus 45 (declining). Biological variation, assay
variation, and regression-to-the-mean all mean that **trend is the unit of
clinical meaning**, not the point.

The time model the product needs, mapped to where each piece lives:

- **Lab values over time** — discrete, irregularly sampled, each with a
  reference range that may itself shift (age/sex). *Today: collapsed (1.2).*
- **Wearable trends over time** — dense, noisy, needs aggregation windows.
  *Today: `HealthDataPoint`, real series; `recognize_pattern_in_history`
  computes first/last/avg + a ≤24-point window.*
- **Symptom changes** — episodic, subjective, severity-scaled. *Today:
  `symptom`/`symptom_episode` schema exists; not populated.*
- **Interventions & adherence** — start/stop, dose, did-they-actually-do-it.
  *Today: `intervention`/`intervention_event` schema exists; `Action.track`
  verb is the closest live surface.*
- **Clinician notes / health events** — encounters, referrals, procedures,
  dated. *Today: `encounter`/`referral`/`procedure` node types exist; GP-record
  import is the intended producer.*
- **Decisions made by the user** — accept/dismiss/complete an action. *Today:
  `Action` lifecycle (DARK).*
- **Retests** — a later measurement of the same marker. *Today: no detection.*
- **Outcomes** — the measured change attributed to a decision. *Today:
  `ActionOutcome` frozen before/after (DARK).*
- **Uncertainty over time** — confidence in a value should fall as it ages and
  rise when a retest confirms it. *Today: absent.*

**Design principle (carry into every screen):** *the graph should not just show
what is connected — it should show what changed, when, what else changed around
then, what we did, and whether it worked.*

---

## 3. Graph Data Model — the minimum viable longitudinal schema

### 3.1 Reuse, don't rebuild

The codebase already has the "stable concept node + dated instance nodes linked
by `INSTANCE_OF`" pattern, applied to symptoms (`symptom` ← `symptom_episode`)
and interventions (`intervention` ← `intervention_event`, with
`OUTCOME_CHANGED` to the affected measurement). **The longitudinal fix is to
apply that exact, already-validated pattern to biomarkers** — nothing new is
invented.

### 3.2 The one required change (PROPOSED, smallest viable)

**Stop collapsing lab readings. Emit a dated observation instance per draw.**

- Keep the `biomarker` **concept** node (one per `canonicalKey`) — it is the
  stable identity edges attach to (topics, symptoms, the AI's citations).
- On each lab ingest, additionally create a dated **`observation`** node
  (this node type and its attribute schema — `value`, `unit`, `measuredAt`,
  `referenceMin/Max` — **already EXIST**) and link `observation
  --INSTANCE_OF--> biomarker`, grounded by a `SUPPORTS` edge to the chunk,
  dated by `collectionDate`.
- Add `biomarker` to `ROLLING_ATTRIBUTE_FIELDS` for `latestValue` /
  `latestValueAt` so the concept node tracks "current" without walking
  instances (mirrors how `symptom.currentSeverity` works).
- `loadBiomarkerSeries()` changes from "read the one node's attributes" to
  "read the `INSTANCE_OF` observation instances" → real multi-point lab
  trajectories, **with no change to `SeriesPoint` or the chart.**

This is the *entire* required schema delta for longitudinality. It adds **no
new tables**: it reuses `GraphNode(type='observation')`, `GraphEdge(INSTANCE_OF
/ SUPPORTS)`, and existing attribute schemas. A migration backfill (3.5) can
reconstruct instances from existing `SourceChunk`s, so we don't lose the past.

### 3.3 Which edges need what (mostly already true)

| Edge | Needs timestamp | Validity window | Source ref | Confidence | Clinical rationale |
|---|---|---|---|---|---|
| `SUPPORTS` (provenance) | inherits doc `capturedAt` | n/a | **yes** (`fromChunkId`/`fromDocumentId` — EXISTS) | n/a | n/a |
| `INSTANCE_OF` (reading→marker) | instance carries `measuredAt` | n/a | yes | inherit | n/a |
| `OUTCOME_CHANGED` (intervention→marker) | **PROPOSED:** `metadata.observedFrom/To` | yes | yes | **PROPOSED:** `metadata.rationale` (descriptive only) | yes |
| `TEMPORAL_SUCCEEDS` (event→event) | both endpoints dated | n/a | yes | `weight` | n/a |
| `ASSOCIATED_WITH` / `CAUSES` | `createdAt` (EXISTS) | **PROPOSED:** optional `metadata.validFrom/To` | yes | `weight` | `metadata.rationale` |

`GraphEdge.metadata` is already a free-form JSON string, so validity windows,
rationale, and observation ranges are **additive in metadata — no column
changes** beyond the optional convenience fields above.

### 3.4 Node-type roles in the longitudinal model (all EXIST as types)

- **Temporal/observation nodes:** `observation` (one dated reading — now used
  for labs too), `metric_window` (a dated wearable aggregation).
- **Event nodes:** `encounter`, `referral`, `procedure`, `intervention_event`,
  `symptom_episode` — all carry domain dates.
- **Concept (identity) nodes:** `biomarker`, `symptom`, `condition`,
  `medication`, `intervention` — stable; carry a rolling "current" picture.
- **Decision nodes:** `Action` rows (relational, not graph nodes) — *keep them
  relational* (see 3.6); surface them on the graph as an overlay, don't
  duplicate them as `GraphNode`s.
- **Source nodes:** `SourceDocument`/`SourceChunk` (dated, immutable).
- **User-state snapshots:** `StateProfile` (current) + `CheckIn` (dated daily).
  **PROPOSED (later phase, not MVP):** a periodic `state_snapshot` is *not*
  needed for MVP — check-ins already provide dated subjective state.

### 3.5 Migration considerations

- **Backfill:** a one-shot job re-reads existing lab `SourceChunk`s and emits
  `observation` instances for already-ingested panels (the chunk text holds the
  dated values; the demo persona proves this is recoverable). Idempotent, keyed
  by `(biomarker canonicalKey, measuredAt)`.
- **Dedup:** observation instances dedup on a canonical key like
  `obs_<marker>_<yyyy_mm_dd>` (matches existing time-bearing key conventions in
  `canonical-keys.ts`), so re-uploading the same panel doesn't double-count.
- **No destructive change:** the concept node and all existing edges/topics
  keep working; this is purely additive.

### 3.6 Explicitly NOT doing (anti-overbuild)

- ❌ No event-sourcing rewrite, no bitemporal columns, no separate
  time-series DB. `HealthDataPoint` + dated `observation` instances are enough.
- ❌ No promotion of `Action`/`ActionOutcome` into `GraphNode`s — they stay
  relational and are *projected* onto the graph as overlays.
- ❌ No new node or edge *types* — every type the MVP needs already exists.

---

## 4. Product Experience — designing for time

The longitudinal graph must answer six questions. Mapping each to a concrete,
mostly-reuses-what-exists surface:

| Question | Surface | Status |
|---|---|---|
| **What changed?** | "What changed since last test" panel-diff card after a re-test upload | **PROPOSED (MVP)** — reuses `buildMarkerTrajectory` + `sparkline` |
| **When did it change?** | Dated points on the trajectory + a marker on the graph timeline | **PROPOSED** — chart EXISTS (`/decisions/marker/[name]`) |
| **What else changed around then?** | Event overlay: actions/encounters/uploads near that date | **PROPOSED** — data EXISTS (`Action.*At`, `SourceDocument.capturedAt`) |
| **What did we do?** | The Decisions timeline (`/decisions`) | **DARK** — already built |
| **Did it work?** | `ActionOutcome` before/after on the card face | **DARK** — already built |
| **What should we do next?** | "Recommended next steps" from the safe action vocabulary | **DARK** (Phase A `propose_next_steps`) |

### Interaction patterns (PROPOSED; reduced-motion fallbacks in §6)

- **Time scrubber** (graph): a horizontal date axis under the canvas; dragging
  it sets an `asOf` date and the graph dims/hides nodes whose latest evidence
  postdates `asOf` and pulses nodes whose value changed at that step. *MVP can
  ship a 2-stop version (this panel vs previous panel) before a continuous
  scrubber.*
- **Before/after states:** tap two panels → side-by-side marker columns with
  Δ and direction, colored by clinical direction not just sign.
- **Marker trajectories:** the existing sparkline, reached from the graph node
  sheet, the timeline, and answers that cite the marker.
- **Event overlays:** vertical markers on a trajectory for "started X",
  "uploaded panel", "GP visit" — drawn from `Action`/`SourceDocument` dates.
- **"What changed since last time?"** — the MVP centerpiece (§7).
- **"Why did this marker move?"** — opens the marker's trajectory with nearby
  events overlaid and an AI explanation grounded in dated values (§5).
- **"Show me what happened after I started this action"** — anchors the
  trajectory at `Action.acceptedAt` and shades after.
- **"Compare this blood panel to my previous one"** — the panel-diff card.
- **"What's trending in the wrong direction?"** — a sorted list of markers by
  signed, direction-aware slope across their last N points.

---

## 5. Clinical Reasoning Layer — how Form Intelligence reasons over time

### 5.1 What it should identify (capabilities, mostly connection work)

The scribe already has `recognize_pattern_in_history` (90-day window,
first/last/avg + ≤24-point series) and a context digest that injects 7-day
wearable trends + latest biomarkers (both **DARK** behind `ASK_DEEP_ENABLED`).
The longitudinal upgrades (**PROPOSED**):

- **Improving / worsening / stable-but-suboptimal markers** — from the dated
  series (now real for labs), classified by direction-aware slope + reference
  context, not by the latest point alone.
- **Correlated changes** — surface co-movement ("HRV rose as weight fell over
  the same window") **descriptively**, never as proof.
- **Possible intervention effects** — align an `Action.acceptedAt` with a
  subsequent marker move; present as "after you started X, Y moved" — temporal
  association, explicitly *not* causation.
- **Confounders & missing follow-up** — "only one ferritin value; a retest
  would confirm direction"; "weight changed too, which also affects this."
- **Escalation triggers** — values in clinically urgent ranges route to GP-prep
  (the existing `route_to_gp_prep` tool) regardless of trend.

### 5.2 What it must avoid (already enforced; extend the patterns)

False causality, over-claiming from one data point, diagnosis-grade likelihood
ranking, and intervention directives are **already blocked** by the
forbidden-phrase enforcement + judgment-kind gate + citation-density floor
(`src/lib/scribe/policy/`). The temporal work must register **new judgment
kinds** (e.g. `trend-description`, `intervention-association`) with their own
citation rules and clinical-advisor sign-off — the same launch-gate pattern the
deck-gap brainstorm already established for `investigation-avenues`.

### 5.3 Recommended safe clinical phrasing

- ✅ "Your ferritin has risen across your last three tests (25 → 41 → 62 µg/L,
  Jan–Jun), moving from below to within the reference range."
- ✅ "This improvement followed the iron-rich-diet action you started in
  February — the two coincide in time; other factors may also contribute."
- ✅ "You have a single reading for vitamin D. A repeat test would tell us
  whether this is a trend or a one-off."
- ❌ "Your iron supplement *fixed* your ferritin." (causal over-claim)
- ❌ "You should take 14 mg of iron daily." (dose directive — already blocked)
- ❌ "These values suggest you most likely have condition X." (likelihood
  ranking — already blocked)

---

## 6. Graph Physics & Visual Language — motion that means time

The graph already runs a deterministic D3 force sim with a **shipped settle-in
entrance** (Phase 1 of `2026-06-08-001-feat-graph-physics-motion-plan.md`),
plus spring drag + zoom, all built on pure primitives in
`src/lib/graph/motion.ts` and gated by `computeMotionAllowed()` (SSR/Node/
reduced-motion safe). Motion always ends at a frozen rest — **no perpetual
wobble.** Build on that vocabulary; don't introduce a new animation system.

Motion should *express change and causality*, never decorate:

- **Nodes settling when new data lands** — reuse the existing entrance tween
  for newly-added/affected nodes only (relayout is Phase-2 of the motion plan).
- **Edges strengthening / fading over time** — map `weight`/recency to edge
  opacity (the `edgeOpacity` primitive already exists for hover-dim); a stale
  association fades, a freshly-cited one is crisp.
- **Markers pulsing when they change significantly** — a one-shot pulse
  (single eased scale-up-and-back) on biomarker nodes whose latest observation
  crossed a meaningful threshold. **PROPOSED** small addition to `motion.ts`.
- **Timeline scrub transitions** — moving the scrubber eases node opacity
  between time states; **PROPOSED**, gated identically to entrance.
- **Event clusters as temporal layers** — nodes from the same upload/visit
  briefly cohere then settle, communicating "these arrived together."
- **Reduced-motion fallback** — every one of the above is **off** under
  `prefers-reduced-motion`: pulses become a static ring, scrub snaps, clusters
  appear instantly. This is the established pattern, not new work.

**Default feeling:** stable and trustworthy at rest; *alive only when new data
lands or the user explores time*; clinically calm, never gimmicky.

---

## 7. First MVP — "what changed since my last panel"

**Target demo:** a user (or the seeded persona) uploads a second blood panel
and MorningForm shows what changed, which markers improved/worsened, which
graph nodes changed, what actions might explain it, and what to do next — in
one sitting. The bar: a technical cofounder says *"this is a real health graph,
not a dashboard."*

Because so much is already built or DARK, the MVP is **one schema change + the
lab-history fix + connection work + one new diff surface + one graph signal.**

### Backend / data model
- **PROPOSED:** lab ingest emits dated `observation` instances + `INSTANCE_OF`
  edges; add `biomarker` rolling fields (`latestValue`, `latestValueAt`).
  Files: `src/app/api/intake/documents/route.ts`, `src/lib/graph/mutations.ts`,
  `src/lib/graph/attributes/index.ts`, `prisma/schema.prisma` (no new
  models — additive rolling-field set only).
- **PROPOSED:** fix `loadBiomarkerSeries()` to read observation instances
  (`src/lib/markers/trajectory.ts`) and add a marker-name↔metric alias map so
  lab + wearable series actually merge.
- **PROPOSED:** a `diffPanels(prev, latest)` reader returning per-marker Δ +
  direction (`src/lib/markers/panel-diff.ts`, new file).
- **PROPOSED:** re-test detection — on ingest, if the new panel's markers
  overlap a prior panel, flag it and compute the diff.

### Frontend / graph
- **PROPOSED:** a "What changed since {date}" card on the post-upload screen
  and on `/decisions` — reuses the existing `sparkline`.
- **PROPOSED:** pulse-on-change for biomarker nodes whose latest observation
  crossed a threshold (small `motion.ts` addition; reduced-motion → static
  ring).
- **PROPOSED (stretch):** 2-stop "this panel vs previous" toggle on the canvas
  before a continuous scrubber.

### API / query
- **PROPOSED:** `GET /api/markers/[name]/trajectory` (thin wrapper over
  `buildMarkerTrajectory`) and `GET /api/panels/diff?from=&to=`.
- **EXISTS:** `/api/record` (full graph), node provenance endpoints.

### AI prompt / context
- **PROPOSED:** extend the context digest (`src/lib/chat/user-context.ts`) to
  inject the dated lab series (not just latest) and the most recent panel diff;
  register the `trend-description` / `intervention-association` judgment kinds.
- **EXISTS:** `recognize_pattern_in_history`, citation enforcement.

### Tests
- Trajectory reader returns multi-point lab series after the schema change
  (the regression that proves 1.2 is fixed).
- `diffPanels` direction/Δ correctness; re-test detection; alias-map merge.
- GDPR: new `observation` instances ride existing `GraphNode` export/delete
  coverage (verify, don't assume — the vacuous-guard trap).
- Pure motion primitive for the pulse (node env, like existing `motion.test.ts`).

### Migration
- Backfill `observation` instances from existing lab chunks (§3.5), idempotent.

### Feature flags
- Reuse the existing strict-`=== 'true'` pattern. Gate the longitudinal lab
  history + diff behind a new `LONGITUDINAL_GRAPH_ENABLED`; flip
  `DECISIONS_ENABLED` on alongside it so the timeline/trajectory/outcome surface
  (already built) lights up for the demo. Off → byte-for-byte current behavior.

---

## 8. The first 10 longitudinal questions to support

1. What changed since my last test?
2. Why is my ferritin moving? (direction + dated values + nearby events)
3. Did my sleep intervention help? (action date anchored against HRV trend)
4. What markers are trending in the wrong direction?
5. What should I retest next, and when?
6. Has my recovery improved over the last month?
7. Which decision had the biggest measured effect? (`ActionOutcome` Δ ranking)
8. Compare this blood panel to my previous one.
9. What else changed around the time this marker moved?
10. Which of my markers have only one reading (low confidence) and deserve a
    repeat?

---

## 9. Safety & Regulation — guardrails for time

Separate the four tiers and keep each on the right side of the line the May
priority-markers pivot drew:

- **Descriptive trend interpretation (allowed):** "X rose from A to B between
  these dates, crossing into/out of the reference range." Grounded in cited,
  dated values. New `trend-description` judgment kind, advisor-reviewed.
- **Decision support (allowed, bounded vocabulary):** "Recommended next steps"
  drawn only from *measure / discuss / track / behavior* — never doses, drugs,
  or dietary-quantity directives (already enforced; the temporal feature adds
  no new verbs).
- **Clinician escalation (required):** urgent-range values route to GP-prep
  regardless of trend; the existing `route_to_gp_prep` + out-of-scope fallback
  handle this.
- **Medical advice to avoid (blocked):** causal claims ("the supplement fixed
  it"), likelihood-ranked diagnoses, and any intervention directive. The
  forbidden-phrase scanner + judgment-kind gate already block the latter two;
  **the temporal work must add patterns for false-causality phrasing** and an
  enforcement test, because "X caused Y" is newly tempting once trends are
  visible.

**Net:** the longitudinal layer is clinically *more* useful precisely because
it stays descriptive — trajectory + association + "a retest would confirm" is
differentiated and safe; causation and ranking are the lines we don't cross.
Temporal disclosure of more history to the LLM is a DPIA/consent trigger (the
same hard-gate the deck-gap brainstorm flagged for context injection) — confirm
before flipping the flag.

---

## 10. Output — recommendations, plan, and phasing

### Product recommendation
Make time the spine of the existing health record. Lead with the **panel-diff
moment** ("what changed since your last test") because it is the cheapest path
to the "real health graph, not a dashboard" reaction and it lights up four
already-built-but-dark surfaces (timeline, trajectory, outcome, next-steps) at
once.

### Data-model recommendation
**One change:** stop collapsing lab biomarkers; emit dated `observation`
instances linked by `INSTANCE_OF` (the pattern already used for symptoms and
interventions). No new tables, no new types. Everything else is additive
metadata and a query change.

### Technical implementation plan
Backfill + ingest emit instances → trajectory reader reads instances →
panel-diff reader + re-test detection → diff card + node pulse → context-digest
+ judgment-kind extension → flag flip. (Detailed file list below.)

### UX interaction plan
Panel-diff card → marker trajectory (existing sparkline) → event overlay → "why
did this move?" answer → Decisions timeline with before/after. Continuous time
scrubber is a fast-follow, not MVP.

### Safety framework
Four-tier separation (§9); new descriptive judgment kinds under advisor
sign-off; new false-causality forbidden-phrase patterns + test; DPIA/consent
check before wider history disclosure.

### Files to modify (MVP)
- `prisma/schema.prisma` — additive only (rolling-field semantics; no new model)
- `src/lib/graph/attributes/index.ts` — add `biomarker` rolling fields
- `src/lib/graph/mutations.ts` — emit observation instances on lab ingest
- `src/app/api/intake/documents/route.ts` — wire instance emission + re-test flag
- `src/lib/markers/trajectory.ts` — read instances; lab↔wearable alias map
- `src/lib/markers/panel-diff.ts` — **new** diff reader
- `src/lib/chat/user-context.ts` — inject dated series + latest diff
- `src/lib/scribe/policy/` — new judgment kinds + false-causality patterns
- `src/lib/graph/motion.ts` + `src/components/graph/use-graph-state.ts` —
  pulse-on-change (reduced-motion safe)
- new diff-card component; new trajectory/diff API routes
- `src/lib/env.ts` — `LONGITUDINAL_GRAPH_ENABLED`; flip `DECISIONS_ENABLED`
- a backfill script under `scripts/`
- tests colocated per existing convention (vitest `node` env, real test DB)

### Acceptance criteria
- A second panel upload produces a **multi-point** lab trajectory (the 1.2
  regression is gone) and a "what changed" card with correct Δ/direction.
- The graph shows a one-shot pulse on changed markers; reduced-motion shows a
  static ring; no perpetual motion.
- An answer to "why is my ferritin moving?" cites **dated values** and any
  time-adjacent action, with no causal/dose/diagnosis language (enforcement
  tests green).
- The Decisions timeline shows the accepted action and, after the retest, an
  `outcome-measured` card with before/after.
- Flag off → byte-for-byte current behavior; GDPR export/delete cover the new
  observation instances.

### Phased plan: MVP → full longitudinal graph

- **Phase 0 (MVP, this proposal):** lab-history schema fix + backfill +
  panel-diff card + node pulse + dated-series in the AI + flip the dark
  Decisions/trajectory surfaces. *Result: the demo reads as a real
  longitudinal health graph.*
- **Phase 1:** continuous **time scrubber** on the canvas (asOf dimming +
  scrub transitions); event overlays on trajectories.
- **Phase 2:** populate **intervention_event / OUTCOME_CHANGED** edges from the
  action lifecycle so "what happened after I started X" is graph-native; begin
  **confidence-over-time** (decay stale values, boost confirmed retests).
- **Phase 3:** populate **symptom_episode** + **encounter/referral/procedure**
  from GP-record import and check-ins, so the whole graph — not just labs — is
  longitudinal; correlated-change detection across domains.

---

## Sources & references (repo, verbatim-checked)

- Schema: `prisma/schema.prisma` (GraphNode 303, GraphEdge 323, SourceDocument
  202, HealthDataPoint 529, Action 783, ActionOutcome 819)
- Graph types/merge: `src/lib/graph/types.ts` (NODE_TYPES, EDGE_TYPES),
  `src/lib/graph/mutations.ts:41-75` (first-write-wins),
  `src/lib/graph/attributes/index.ts:145` (ROLLING_ATTRIBUTE_FIELDS)
- Trajectory/decisions (DARK): `src/lib/markers/trajectory.ts`,
  `src/app/(app)/decisions/page.tsx`, `src/lib/actions/lifecycle.ts`
- Rendering/motion: `src/components/graph/use-graph-state.ts`,
  `src/lib/graph/motion.ts`, `src/lib/graph/importance.ts`
- AI/safety: `src/lib/chat/user-context.ts`,
  `src/lib/scribe/tools/recognize-pattern-in-history.ts`,
  `src/lib/scribe/policy/`
- Demo: `prisma/fixtures/synthetic/metabolic-persona.ts`,
  `prisma/fixtures/synthetic/graph-narrative.ts`
- Related plans/brainstorms: `docs/plans/2026-06-08-001-feat-graph-physics-motion-plan.md`,
  `docs/plans/2026-06-06-002-feat-decisions-that-compound-phase-b-plan.md`,
  `docs/plans/2026-04-15-004-feat-health-graph-pivot-plan.md`,
  `docs/brainstorms/2026-06-05-deck-product-gap-requirements.md`
