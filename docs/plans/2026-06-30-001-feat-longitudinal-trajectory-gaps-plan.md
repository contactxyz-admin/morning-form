---
title: "feat: Close the longitudinal-trajectory gap — graph-native temporal/causal edges, authed longitudinal surfaces, descriptive trend layer"
type: feat
status: active
date: 2026-06-30
origin: docs/brainstorms/2026-06-10-longitudinal-health-graph-design.md
---

# feat: Close the longitudinal-trajectory gap (DT-Transformer thesis)

## Overview

MorningForm's thesis treats model health as a **longitudinal trajectory**, not a
set of snapshots. Since the June-10 brainstorm, the *data substrate* for that
thesis has largely shipped: dated `observation` instance nodes are written on
lab ingest with `INSTANCE_OF` edges to the stable `biomarker` concept
(`src/lib/intake/lab-observations.ts`), `buildMarkerTrajectory` reassembles a
real multi-point series, `panel-diff` + `classifyChange` compute "what changed",
and the demo graph has an as-of time scrubber. Three gaps still keep trajectory
thinking from reaching authed users, and this plan closes them **in order**:

1. **Phase 1 — temporal/causal edges are latent.** `TEMPORAL_SUCCEEDS` and
   `OUTCOME_CHANGED` are defined in `types.ts`, endpoint-validated in
   `edge-validation.ts`, and drawn in `visual-encoding.ts`, but **no ingestion
   path writes either** (verified: zero non-test, non-type-def writes).
   Trajectories exist as a query-time reassembly, not as graph structure.
2. **Phase 2 — longitudinal features are demo-only or flag-dark for authed
   users.** The as-of scrubber (`firstSeenAt`/`asOfEpoch`) is supplied only by
   the demo adapter; the per-marker clinical-interpretation matrix runs on the
   demo and (since plan 2026-06-17-003) the authed *source-detail* page, but not
   the main authed record graph; the dated series + panel diff are not injected
   into the chat context digest; and there are no thin authed read APIs for a
   single marker's trajectory or an arbitrary panel diff.
3. **Phase 3 — there is no forward-looking trend layer.** Direction is computed
   only two-point (`classifyChange`); nothing reads a marker's last N dated
   points to describe *direction + momentum + since-when*, and no
   `trend-description` judgment kind or false-causality forbidden-phrase pattern
   exists to keep such output descriptive and safe.

The non-negotiable constraint throughout: **stay descriptive and
non-diagnostic.** No diagnosis, causation, treatment/dose directives,
probabilities, or risk scores. Any forward-looking output is a *direction with
explicit uncertainty*, never a predicted value or likelihood. New surfaces ship
behind the existing strict-`=== 'true'` flags; flag-off is byte-for-byte current
behaviour.

## Problem Frame

(see origin: `docs/brainstorms/2026-06-10-longitudinal-health-graph-design.md`,
§1.3, §3, §7, §9, §10; the brief that commissioned this plan.)

The brainstorm's headline ("lab values are structurally collapsed to one value
per marker") **is now fixed** — observation instances are written on ingest and
read back behind `LONGITUDINAL_GRAPH_ENABLED`. What remains is the trajectory
*reaching the graph as structure* and *reaching authed users as surfaces*, plus
the safe forward-looking layer the brainstorm explicitly deferred to its
Phase 1–3 roadmap (§10).

### Verified current state (brief claims reconciled against the code)

| Brief claim | Verified reality | Where |
|---|---|---|
| `TEMPORAL_SUCCEEDS`/`OUTCOME_CHANGED` defined, validated, drawn, never written | **TRUE.** Zero write sites; only type-def/validation/encoding + comments | `types.ts:50-61`, `edge-validation.ts:44-63`, `visual-encoding.ts:241-248` |
| Lab ingest should emit observation instances | **ALREADY SHIPPED.** `buildLabObservationGraphInputs` writes `observation` nodes + `INSTANCE_OF` on ingest | `src/lib/intake/lab-observations.ts:58-98`, `api/intake/documents/route.ts:201` |
| `backfill-observations.ts` to touch | **EXISTS** (creates observation+`INSTANCE_OF`+`SUPPORTS`, idempotent on `obs_<marker>_<yyyy_mm_dd>`); script at `scripts/backfill-lab-observations.ts` | `src/lib/markers/backfill-observations.ts` |
| `ActionOutcome` → emit `OUTCOME_CHANGED` | `ActionOutcome` written **relationally**, no graph edge; `OUTCOME_CHANGED`'s only valid `from` is `intervention_event`, which is **never created** | `api/actions/[id]/outcome/route.ts`, `edge-validation.ts:60-63` |
| `LONGITUDINAL_GRAPH_ENABLED` off by default, strict `=== 'true'` | **TRUE**; gates **reads only** — observation writes are unconditional by design | `src/lib/env.ts:86` |
| Scrubber/`firstSeenAt` demo-only | **TRUE.** Authed `/api/record` has a **prod-parity guard test** asserting it never emits `firstSeenAt`/`interpretation` | `graph-adapter.ts`, `demo-graph-section.tsx`, `api/record/route.test.ts` |
| `clinical-interpretation.ts` "Pure; demo-only" | **STALE.** Pure + surface-neutral; already wired into the authed **source-detail** route (plan 2026-06-17-003 U1–U3) — but NOT the main `/api/record` graph | `src/lib/markers/clinical-interpretation.ts`, `api/record/source/[id]/route.ts` |
| Wire interpretation into `api/record/route.ts` | Main record route applies `change` (`applyChangesToWireNodes`) but **not** `interpret()` | `api/record/route.ts:47-97` |
| `GET /api/markers/[name]/trajectory`, `GET /api/panels/diff` | **MISSING.** Only `GET /api/markers/changes` exists (flag-gated, returns latest-vs-previous `PanelDiff`) | `api/markers/changes/route.ts` |
| Context digest injects dated series + diff | **NO.** `loadBiomarkers` injects latest value only, single date, no series, no diff (and only when `askDeep`) | `src/lib/chat/user-context.ts:315-351` |
| DPIA/consent gate for temporal disclosure | **NO temporal-specific gate.** Only generic `llmConsentAcceptedAt` (412 lazy gate) | `src/lib/llm/consent.ts` |
| `trend.ts` | **MISSING.** `classifyChange` lives in `classify-change.ts` (re-exported by `panel-diff.ts`); two-point only | `src/lib/markers/classify-change.ts:33-48` |
| `trend-description` judgment kind + false-causality patterns | **MISSING.** `JUDGMENT_KINDS` is a closed 5-value enum; per-policy allowlists; no causality patterns | `src/lib/scribe/policy/types.ts:13-19`, `forbidden-phrases.ts` |
| Retest / single-reading surfacing | Retest **loop exists** (`src/lib/retest/`); "single-reading low-confidence" and "trending" surfaces **missing** | `src/lib/retest/draws.ts` |
| GDPR covers `GraphNode`/`GraphEdge` | **TRUE** for both export and delete, guarded by a real structural-completeness test | `account/export.ts:78-106`, `account/delete.ts:207-221` |

## Requirements Trace

From the brief (P = phase):

- **P1.1** — On lab ingest, when a biomarker has ≥2 dated observation instances,
  write `TEMPORAL_SUCCEEDS` between consecutive observations ordered by
  `measuredAt`.
- **P1.2** — When an `Action` reaches `outcome-measured`, emit `OUTCOME_CHANGED`
  from the intervention to the affected biomarker concept, carrying
  `metadata.observedFrom`, `metadata.observedTo`, and a descriptive
  `metadata.rationale`.
- **P1.3** — A `scripts/` backfill that creates `TEMPORAL_SUCCEEDS` for existing
  observation instances; idempotent, keyed by marker + dates.
- **P2.1** — Wire the as-of scrubber into the **authed** graph: a real
  `firstSeenAt` producer for the live user graph, fed through the authed record
  mount + `graph-canvas.tsx`.
- **P2.2** — Make `clinical-interpretation.ts` usable on the live record via an
  authed caller (or extract the safe subset) and wire it into the main
  `/api/record` graph.
- **P2.3** — Add authed `GET /api/markers/[name]/trajectory` and
  `GET /api/panels/diff?from=&to=`.
- **P2.4** — Rollout: keep `LONGITUDINAL_GRAPH_ENABLED`; enable for authed users
  only after tests + DPIA/consent gate; extend the chat context digest with the
  dated series + latest panel diff.
- **P3.1** — A pure, tested trend reader over a marker's last N dated points:
  improving / worsening / stable, with magnitude + since-when, reference-aware.
- **P3.2** — Derived views: "markers trending in the wrong direction" and
  "single-reading low-confidence markers that deserve a retest".
- **P3.3** — Descriptive retest suggestions only ("a repeat test would confirm
  this direction"); never treatment/dose.
- **P3.4** — Register a `trend-description` judgment kind with its own citation
  rules + clinical-advisor sign-off; add false-causality forbidden-phrase
  patterns + an enforcement test.

## Scope Boundaries

- ✅ Additive schema/metadata only. Reuse existing node/edge **types** — no new
  ones. No new tables. No new npm dependencies (no forecasting libs).
- ✅ Every new surface flag-gated; flag-off is byte-for-byte current behaviour.
  Observation/edge **writes** stay unconditional (additive, invisible until a
  read surface renders them) — only **reads** gate, mirroring the established
  `LONGITUDINAL_GRAPH_ENABLED` design.
- ✅ Every new data path verified (not assumed) under GDPR export + delete.
- ❌ **No learned forecasting / DT-Transformer-style prediction model.** No
  predicted numeric values, probabilities, risk scores, or ranked diagnoses. A
  true predictive foundation model is a separate regulatory track — noted as
  Future Work, not built here.
- ❌ No promotion of `Action`/`ActionOutcome` into graph nodes beyond the
  minimal `intervention_event` instance required to satisfy `OUTCOME_CHANGED`'s
  validated endpoint (brainstorm §3.6 keeps decisions relational; the
  `intervention_event` instance is the existing, validated bridge type).
- ❌ No rewrite of the demo scrubber, `panel-diff`, `classifyChange`,
  `clinical-interpretation`, or `motion.ts` — reuse them.

### Deferred to separate tasks

- HeLM per-individual baseline bands (the optional follow-on) — its own plan once
  enough history exists; advisor sign-off + own flag.
- Confidence-over-time decay (brainstorm Phase 2) beyond the single-reading flag
  P3.2 surfaces.
- `symptom_episode` / `encounter` / `referral` / `procedure` population from
  GP-record import (brainstorm Phase 3).
- A continuous (non-2-stop) authed scrubber animation polish if P2.1 ships the
  data wiring first; the eased-fade work is already tracked in 2026-06-17-003 U7.

## Context & Research

### Relevant Code and Patterns

**Phase 1 — edges**
- `src/lib/graph/types.ts:50-61` — `EDGE_TYPES` incl. `TEMPORAL_SUCCEEDS`,
  `OUTCOME_CHANGED`, `INSTANCE_OF`; `NODE_TYPES` incl. `observation`,
  `intervention_event`.
- `src/lib/graph/edge-validation.ts:44-63` — `TEMPORAL_SUCCEEDS` is endpoint-
  **unrestricted** (null/null), so `observation → observation` is valid;
  `OUTCOME_CHANGED` `from ∈ {intervention_event}` only, `to ∈ {biomarker,
  symptom, observation, metric_window}`.
- `src/lib/graph/mutations.ts` — `addNode` (upsert by `(userId,type,canonicalKey)`,
  first-write-wins + date-guarded rolling fields), `addEdge` (validates endpoints
  + dedup by `(userId,type,fromNodeId,toNodeId,fromChunkId)`), `ingestExtraction`
  (atomic doc+chunks+nodes+edges).
- `src/lib/intake/lab-observations.ts:58-98` — `buildLabObservationGraphInputs`
  returns the observation nodes + `INSTANCE_OF` edges appended to the ingest
  payload (the seam to also emit `TEMPORAL_SUCCEEDS`).
- `src/app/api/intake/documents/route.ts:196-249` — the lab ingest path.
- `src/lib/markers/backfill-observations.ts` + `scripts/backfill-lab-observations.ts`
  — the idempotent backfill pattern (`obs_<marker>_<yyyy_mm_dd>`, `tsx` entry,
  `[userId]` optional arg, PrismaClient try/finally). The new `TEMPORAL_SUCCEEDS`
  backfill mirrors this exactly.
- `src/lib/actions/lifecycle.ts` (transitions) + `src/app/api/actions/[id]/outcome/route.ts`
  (writes `ActionOutcome { markerName, beforeValue, beforeAt, afterValue, afterAt }`
  in the `outcome-measured` transaction — the seam to also emit the edge).
- `src/lib/graph/attributes/intervention_event.ts` (carries `occurredAt`),
  `src/lib/graph/canonical-keys.ts` (`intervention_event_<parentKey>_<yyyy_mm_dd>…`
  time-bearing key convention).

**Phase 2 — authed longitudinal surfaces**
- `src/lib/graph/as-of.ts` (pure: `asOfVisibility`, `changeVisibleAsOf`,
  `scrubberStops`), `src/lib/graph/scrubber.ts` (DOM-free UX helpers).
- `src/lib/demo/graph-adapter.ts` (sets `firstSeenAt` from `DemoNode`),
  `src/components/demo/demo-graph-section.tsx:131-167` (computes `stops`,
  `asOfEpoch`, passes to `GraphCanvas`).
- `src/components/graph/graph-canvas.tsx:93-116` — `asOfEpoch?: number|null`
  prop, defaults `null` (authed never sets it today).
- `src/app/api/record/route.ts:47-97` — flag-gated `diffLatestPanels` +
  `applyChangesToWireNodes`; **the place to add `firstSeenAt` and `interpret()`**.
  `src/app/api/record/route.test.ts` — the **prod-parity guard** that must be
  deliberately revised when authed begins emitting `firstSeenAt`/`interpretation`.
- `src/lib/markers/clinical-interpretation.ts:113` — `interpret(canonicalKey,
  change, {value,low,high})`, pure; `MATRIX` covers `ldl/apob/ferritin/hba1c/
  free-testosterone`, others → conservative `clinician_discussion` default.
  Already consumed by `api/record/source/[id]/route.ts` (plan 2026-06-17-003).
- `src/lib/markers/node-change-map.ts` — pure `buildChangeByJoinKey` /
  `applyChangesToWireNodes`, match by `markerJoinKey(canonicalKey, registryKey)`.
- `src/lib/markers/trajectory.ts:71-92` — `buildMarkerTrajectory` (the
  `/api/markers/[name]/trajectory` body); `src/lib/markers/panel-diff.ts:81` —
  `diffLatestPanels` (the `/api/panels/diff` body, generalised to from/to docs).
- `src/lib/chat/user-context.ts:315-351` — `loadBiomarkers` (latest-only);
  injected from `src/lib/chat/turn.ts` when `askDeep`. The seam for the dated
  series + diff digest.
- `src/lib/llm/consent.ts` — `llmConsentGateResponse` (412 lazy gate, generic).

**Phase 3 — trend layer + policy**
- `src/lib/markers/classify-change.ts:33-48` — `classifyChange(before, after,
  low, high) → {direction, classification}`; `ChangeClassification ∈ {improved,
  worsened, stable, unclassified, new}` (reference-aware). The trend reader's
  per-step primitive.
- `src/lib/scribe/tools/recognize-pattern-in-history.ts:78-83` — `SeriesPoint
  {metric, value, unit, timestamp}`; bails `too-little-data` < 3 points.
- `src/lib/scribe/policy/` — `types.ts` (`JUDGMENT_KINDS` closed enum, 5 values),
  `enforce.ts` (judgment-kind gate `:55-79`, citation-density floor `:81-133`,
  `investigation-avenues` structural rule `:99-117`), `forbidden-phrases.ts`
  (dose/imperative/dietary patterns; **no causality patterns**), per-topic
  policies (`iron.ts`, `cardiometabolic.ts`, …) each with `allowedJudgmentKinds`,
  `enforce.test.ts` (the matrix to extend).
- `src/lib/retest/draws.ts` — the retest loop (`Draw` rows, sequence,
  attribution) that P3.2/P3.3 reference descriptively.

### Institutional Learnings

- `docs/plans/2026-06-05-001-feat-ask-deep-phase-a-plan.md` — the **launch-gate
  pattern** for a new judgment kind: DPIA addendum + updated consent screen +
  **clinical-advisor sign-off recorded in the PR** (not a runtime artifact) +
  full enforce matrix green + visual audit + cold-prod walkthrough on a throwaway
  `reuben+tag@` alias, then flag flip. P3.4 + P2.4 follow this verbatim.
- `docs/plans/2026-06-17-003-feat-deferred-graph-items-closeout-plan.md` — the
  authed `interpret()` reuse + flag-gated, **non-fatal `.catch`** pattern, and
  the prod-parity guard discipline. P2.2 extends this from the source page to the
  main graph.
- `docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md`
  — any canvas/visual change (P2.1 authed scrubber) is visual-audit-gated on a
  real record + the live demo.
- `docs/plans/2026-06-08-001` / `2026-06-16-001` — determinism + reduced-motion
  contracts the authed scrubber must preserve (no perpetual motion; reduced-motion
  snaps).

### External References

None. Clinical reference ranges are standard guideline values for advisor
sign-off; all logic is internal and reuses the existing classifier + trajectory.

## Key Technical Decisions

- **`TEMPORAL_SUCCEEDS` is emitted at the same seam that already writes the
  observation instances** (`buildLabObservationGraphInputs` → ingest payload),
  ordered by `measuredAt`, between *consecutive* observations of the same
  biomarker. Because edge dedup keys on `(userId,type,from,to,fromChunkId)` and
  observation nodes dedup on `obs_<marker>_<date>`, re-ingest is idempotent.
- **`OUTCOME_CHANGED` requires an `intervention_event` source endpoint.** Actions
  are relational (and stay so). To honour both the brief and `edge-validation`,
  the `outcome-measured` transition creates a dated `intervention_event` instance
  node (reusing the existing, never-yet-written type + its `occurredAt` attribute
  + the existing time-bearing canonical key) for the action, then writes
  `OUTCOME_CHANGED` from it to the affected `biomarker` concept with
  `metadata.observedFrom/observedTo` (= `ActionOutcome.beforeAt/afterAt`) and a
  **descriptive** `metadata.rationale` ("after the *{label}* action, {marker}
  moved from X to Y over this window; association, not proven cause"). This
  lights up `intervention_event` *and* `OUTCOME_CHANGED` from one change, with no
  new types. Both are written in the same transaction as the `ActionOutcome` row.
- **The new backfill is a sibling script** (`scripts/backfill-temporal-succeeds.ts`
  → `src/lib/markers/backfill-temporal-edges.ts`) mirroring the observation
  backfill: idempotent, keyed by marker + the two observation dates, `[userId]`
  arg, reuses `addEdge`'s dedup as the idempotency backstop.
- **Authed interpretation reuses `interpret()` unchanged** — applied in
  `/api/record` over the same `MarkerChange` the route already computes (value/
  range recoverable from the diff), exactly as the source route does. No new
  engine. The **prod-parity guard test is updated deliberately** (it becomes a
  flag-conditioned assertion: flag-off → no `firstSeenAt`/`interpretation`;
  flag-on → present), so flag-off parity is still machine-enforced.
- **`firstSeenAt` for the authed graph is derived, not stored.** A pure producer
  computes per-node earliest evidence from data the route already has (earliest
  supporting-chunk `capturedAt` / earliest observation `measuredAt`), so the
  scrubber's `scrubberStops`/`asOfVisibility` consume the same shape the demo
  feeds. No schema change.
- **The two new read routes are thin wrappers** over `buildMarkerTrajectory` and
  a from/to generalisation of `diffLatestPanels`; both flag-gated + non-fatal,
  authenticated, scoped to the caller's `userId`.
- **The trend reader is pure and reference-aware**, built *on top of*
  `classifyChange` step-by-step over `SeriesPoint[]` — no new statistics library,
  no linear-regression dependency (a simple direction-aware signed slope +
  consecutive-step agreement). It returns a **direction + magnitude + since-when**,
  never a projected value.
- **`trend-description` is added deliberately, per policy.** It is NOT
  blanket-enabled; each policy that should allow it gets it added to
  `allowedJudgmentKinds`, with a structural citation rule (every trend statement
  cites its dated before/after values, mirroring `investigation-avenues`), plus
  new false-causality forbidden-phrase patterns enforced for *all* kinds.
- **Consent: extend the existing gate's DPIA posture, don't invent a parallel
  one.** The dated-series digest injection (P2.4) is the disclosure trigger the
  brainstorm flags; it is gated by the same `llmConsentAcceptedAt` check plus a
  DPIA addendum recorded before flag-flip (the ask-deep pattern). If the advisor
  requires distinct consent copy for temporal history, capture it as a copy
  change to the existing consent screen — not a new gate mechanism.

## Open Questions

### Resolved during planning
- *Does Phase 1 still need to create observation instances?* → No; already
  shipped. Phase 1 is **only** the temporal/causal edges over the existing
  instances.
- *How to emit `OUTCOME_CHANGED` when Actions are relational?* → Create a dated
  `intervention_event` instance for the action at `outcome-measured` and link
  from it (existing validated `from` type); keep `Action`/`ActionOutcome`
  relational.
- *Is `interpret()` already on authed?* → On the source-detail page only; the
  main record graph still lacks it (P2.2 closes that, not a fresh build).
- *New consent mechanism for temporal disclosure?* → No; reuse
  `llmConsentAcceptedAt` + DPIA addendum + (if advised) consent-copy update.

### For decision (recommendation in brackets)
- **`OUTCOME_CHANGED` target: biomarker concept vs the specific observation
  instance?** The brief says "biomarker concept"; `edge-validation` allows both
  `biomarker` and `observation`. *[Recommend the **concept** per the brief — it's
  the stable identity the graph/AI cite; the `metadata.observedFrom/To` dates
  carry the instance-level provenance. Revisit if a clinician wants the edge to
  land on the exact post-reading.]*
- **Authed scrubber: continuous vs 2-stop first?** *[Recommend shipping the data
  wiring (`firstSeenAt` producer + `asOfEpoch` plumb-through) behind the flag and
  reusing the demo's `scrubberStops` 2-stop UX before any continuous-scrubber
  animation polish — matches the brainstorm §7 "2-stop before continuous".]*
- **Trend window N and minimum points.** *[Recommend N = last 4 dated points,
  minimum 3 to assert a trend (reuse `recognize_pattern_in_history`'s
  `too-little-data` floor); 2 points → "single confirmation, not yet a trend";
  1 point → the single-reading/low-confidence retest surface. Confirm with
  advisor.]*
- **Which policies allow `trend-description`?** *[Recommend the topic policies
  that already allow `pattern-vs-own-history` (iron, cardiometabolic, energy-
  fatigue, sleep-recovery, hormonal-endocrine); exclude `general`. Advisor
  sign-off per policy.]*

## High-Level Technical Design

> Directional guidance for review, not implementation spec.

```
# ── Phase 1 — graph-native temporal/causal edges ─────────────────────────────
lab ingest (api/intake/documents/route.ts → lab-observations.ts):
  obs[] = observation instances (EXISTS) ordered by measuredAt
  edges += INSTANCE_OF (EXISTS)
  edges += TEMPORAL_SUCCEEDS(obs[i] → obs[i+1])  for each consecutive pair  ← NEW
            (idempotent via addEdge dedup; weight=1; fromChunk = later obs chunk)

action outcome-measured (api/actions/[id]/outcome/route.ts, same txn):
  write ActionOutcome (EXISTS)
  ev = addNode(intervention_event, occurredAt=afterAt, key=intervention_event_<action>_<date>) ← NEW
  addEdge(INSTANCE_OF: ev → intervention concept)                                              ← NEW (if concept resolvable)
  addEdge(OUTCOME_CHANGED: ev → biomarker concept,                                             ← NEW
          metadata={ observedFrom: beforeAt, observedTo: afterAt, rationale: descriptive })

backfill (scripts/backfill-temporal-succeeds.ts):
  for each user, each biomarker concept:
    obs = observation instances via INSTANCE_OF, sorted by measuredAt
    addEdge(TEMPORAL_SUCCEEDS) for consecutive pairs   ← idempotent, keyed by marker+dates

# ── Phase 2 — authed longitudinal surfaces ───────────────────────────────────
api/record/route.ts (flag-gated, non-fatal, both additions):
  firstSeenAt[node] = earliest( supporting-chunk capturedAt, observation measuredAt )   ← pure producer
  interpretation[biomarker] = interpret(canonicalKey, change, {value,low,high})         ← reuse engine
  → wire nodes gain firstSeenAt + interpretation  (flag-on only)
record mount + graph-canvas.tsx:
  stops = scrubberStops(nodes); asOfEpoch = stops[idx]   ← reuse demo plumbing for authed
route.test.ts: parity guard becomes flag-conditioned (off→absent, on→present)

new authed routes (flag-gated, non-fatal, userId-scoped):
  GET /api/markers/[name]/trajectory → buildMarkerTrajectory(db,userId,name)
  GET /api/panels/diff?from=&to=     → diffPanels(db,userId,from,to)  (generalised diffLatestPanels)

user-context.ts (when askDeep, flag-gated, consent-gated):
  digest += dated series (buildMarkerTrajectory, capped) + latest PanelDiff summary

# ── Phase 3 — descriptive forward-looking trend layer ────────────────────────
src/lib/markers/trend.ts (pure):
  describeTrend(series: SeriesPoint[], range) →
    { direction: improving|worsening|stable, magnitude, sinceAt, points, confidence:
      single-reading|low|ok }     ← signed, reference-aware, NO projected value
derived views (pure):
  markersTrendingWrongDirection(allSeries) ; singleReadingMarkers(allSeries)
scribe policy:
  JUDGMENT_KINDS += 'trend-description'
  per-policy allowedJudgmentKinds += 'trend-description' (deliberate)
  enforce.ts: trend-description structural rule (cite dated before/after values)
  forbidden-phrases.ts: FALSE_CAUSALITY_PATTERNS (e.g. /\b(caused|fixed|cured|because of)\b …/) ← all kinds
  enforce.test.ts: trend happy-path + causality-rejection + citation-floor cases
```

Safety invariant (the test that guards P3.4): *any output classified
`trend-description` must (a) cite the dated values it describes and (b) contain
no false-causality phrase* — enforced for the whole policy matrix, so "X caused
Y" cannot survive once trends are visible.

## Phased Delivery

### Phase 1 — populate temporal & causal edges (smallest, first)
Make trajectories graph-native. Independently shippable; lights up the existing
`visual-encoding` for `TEMPORAL_SUCCEEDS`/`OUTCOME_CHANGED` with real data.

### Phase 2 — lift longitudinal features to authed users
Authed scrubber data wiring, interpretation on the main record, two thin read
APIs, context-digest extension — behind the flag, gated by DPIA/consent.

### Phase 3 — descriptive forward-looking trend layer
Pure trend reader + derived views + descriptive retest suggestions +
`trend-description` judgment kind + false-causality enforcement.

## Implementation Units

### Phase 1 — graph-native temporal/causal edges

- [ ] **U1: Emit `TEMPORAL_SUCCEEDS` on lab ingest**
  - **Goal:** Consecutive observations of a biomarker (ordered by `measuredAt`)
    are linked event→event.
  - **Requirements:** P1.1
  - **Dependencies:** none
  - **Files:** Modify `src/lib/intake/lab-observations.ts` (append
    `TEMPORAL_SUCCEEDS` edges between consecutive instances in the returned
    payload); confirm `src/app/api/intake/documents/route.ts` passes them through
    `ingestExtraction`; possibly a tiny pure helper
    `src/lib/graph/temporal-succeeds.ts` (pure: `(sortedObsRefs) → edge inputs`).
    Test: `src/lib/intake/lab-observations.test.ts` (+ a pure helper test).
  - **Approach:** Within a single ingest the new panel typically adds one
    instance per marker; the edge connects the *new* instance to the immediately-
    prior one for the same marker (resolve prior from existing instances when the
    payload has only one new draw). `weight=1`; `fromChunkId` = the later
    observation's grounding chunk. Idempotent via `addEdge` dedup.
  - **Test scenarios:** two draws of one marker → one `TEMPORAL_SUCCEEDS`
    new→prior; three draws → two consecutive edges, none skipping; single draw →
    no edge; re-ingest same panel → no duplicate edge (idempotent); endpoint
    validation accepts `observation→observation`.
  - **Verification:** edges exist with correct direction/order; `visual-encoding`
    renders them; suite green.

- [ ] **U2: Emit `OUTCOME_CHANGED` (+ `intervention_event`) on `outcome-measured`**
  - **Goal:** A measured action outcome becomes graph structure: a dated
    `intervention_event` linked `OUTCOME_CHANGED → biomarker` with descriptive
    metadata.
  - **Requirements:** P1.2
  - **Dependencies:** none (parallel-safe with U1)
  - **Files:** Modify `src/app/api/actions/[id]/outcome/route.ts` (in the same
    transaction that writes `ActionOutcome`, create the `intervention_event` node
    + edges); add a pure builder `src/lib/actions/outcome-edges.ts`
    (`(action, outcome) → {node, edges, metadata}`); reuse `addNode`/`addEdge`;
    `src/lib/graph/canonical-keys.ts` for the event key. Test:
    `src/lib/actions/outcome-edges.test.ts` + extend the outcome route test.
  - **Approach:** `intervention_event` `occurredAt = afterAt`, key
    `intervention_event_<actionId-or-label-slug>_<yyyy_mm_dd>`. Resolve the
    `biomarker` concept by `markerName` (skip the edge non-fatally if no concept
    exists — never 500 the outcome write). `metadata.rationale` is descriptive
    and **must not** assert causation; reuse a fixed safe template. If an
    `intervention` concept exists for the action, also link `INSTANCE_OF`.
  - **Test scenarios:** outcome with a resolvable marker → `intervention_event` +
    `OUTCOME_CHANGED` with `observedFrom/observedTo` = before/after dates;
    rationale contains no causal verb; unresolvable marker → outcome still
    written, edge skipped, no throw; re-running the transition is a no-op
    (idempotent key + dedup); endpoint validation accepts
    `intervention_event→biomarker`.
  - **Verification:** edge + node present; rationale passes a causality-pattern
    check (forward-looking to U10); suite green.

- [ ] **U3: Backfill `TEMPORAL_SUCCEEDS` for existing observations**
  - **Goal:** Existing observation instances gain consecutive temporal links.
  - **Requirements:** P1.3
  - **Dependencies:** U1 (shares the pure pair-builder)
  - **Files:** Create `src/lib/markers/backfill-temporal-edges.ts`
    (`backfillTemporalSucceedsForUser(db, userId)`), `scripts/backfill-temporal-succeeds.ts`
    (mirror `scripts/backfill-lab-observations.ts`: `tsx`, `[userId]` arg,
    PrismaClient try/finally, stdout/stderr+exit-1); add a
    `markers:backfill-temporal` npm script. Test:
    `src/lib/markers/backfill-temporal-edges.test.ts`.
  - **Approach:** Per user, per biomarker concept: read instances via
    `INSTANCE_OF`, sort by `measuredAt`, `addEdge(TEMPORAL_SUCCEEDS)` for each
    consecutive pair. Idempotency = `addEdge` dedup keyed by marker + the two
    instance ids.
  - **Test scenarios:** user with 3 instances of a marker → 2 edges; re-run →
    still 2 (idempotent); marker with 1 instance → 0; multiple markers don't
    cross-link.
  - **Verification:** idempotent on re-run; counts correct; suite green.

- [ ] **U4: GDPR coverage verification for the new edges/nodes (Phase 1)**
  - **Goal:** Prove (not assume) the new `TEMPORAL_SUCCEEDS`/`OUTCOME_CHANGED`
    edges + `intervention_event` nodes are exported and deleted.
  - **Requirements:** brief guardrail ("every new data path needs GDPR export +
    delete coverage; verify, do not assume")
  - **Dependencies:** U1, U2
  - **Files:** Extend `src/lib/account/delete.test.ts` and
    `src/lib/account/export.test.ts` seeds to include a `TEMPORAL_SUCCEEDS`, an
    `OUTCOME_CHANGED`, and an `intervention_event` row.
  - **Approach:** These are `GraphEdge`/`GraphNode` rows already covered by the
    transaction + the structural-completeness guard — so the work is making the
    coverage **non-vacuous** by seeding the specific new rows and asserting the
    residue scan finds zero after delete and the export bundle contains them.
  - **Test scenarios:** seeded temporal/outcome edges + intervention_event appear
    in the `record` export domain; after delete, residue scan = 0.
  - **Verification:** both GDPR tests green with the new rows seeded.

### Phase 2 — authed longitudinal surfaces

- [ ] **U5: `GET /api/markers/[name]/trajectory` (thin, flag-gated)**
  - **Goal:** Authed users can read a single marker's multi-point dated series.
  - **Requirements:** P2.3
  - **Dependencies:** none
  - **Files:** Create `src/app/api/markers/[name]/trajectory/route.ts`; test
    colocated. Reuse `buildMarkerTrajectory`, `getSessionUser`, the flag + 412
    consent gate, non-fatal catch.
  - **Approach:** authenticate → `LONGITUDINAL_GRAPH_ENABLED` else 404/empty →
    `buildMarkerTrajectory(prisma, userId, name)` → JSON `{ series }`.
  - **Test scenarios:** flag-off → gated; multi-point marker → ordered series;
    unknown marker → empty; another user's marker never leaks (userId scope).
  - **Verification:** route returns expected series; flag-off parity; suite green.

- [ ] **U6: `GET /api/panels/diff?from=&to=` + `diffPanels` generalisation**
  - **Goal:** Authed users can diff two arbitrary panels.
  - **Requirements:** P2.3
  - **Dependencies:** none
  - **Files:** Extend `src/lib/markers/panel-diff.ts` with
    `diffPanels(db, userId, fromDocId/at, toDocId/at)` factored from
    `diffLatestPanels` (shared `loadPanelInstances` + `classifyChange`); create
    `src/app/api/panels/diff/route.ts`. Tests: extend `panel-diff.test.ts` + route
    test.
  - **Approach:** resolve `from`/`to` to the user's lab `SourceDocument`s
    (validate ownership); reuse the existing instance loader + classifier; invalid
    params → 400; missing panel → empty diff.
  - **Test scenarios:** two valid panels → correct Δ/direction/classification;
    `from`==`to` → all `stable`/`new` as appropriate; foreign docId → rejected;
    flag-off → gated.
  - **Verification:** diff correctness matches `diffLatestPanels` for the latest
    pair; suite green.

- [ ] **U7: Authed `firstSeenAt` producer + scrubber plumb-through**
  - **Goal:** The authed graph supplies `firstSeenAt`, so `scrubberStops`/
    `asOfVisibility` work for live users (2-stop reuse of the demo UX).
  - **Requirements:** P2.1
  - **Dependencies:** none (data-wiring only)
  - **Files:** Create pure `src/lib/record/first-seen.ts`
    (`(nodes, supportRecency, observations) → Map<nodeId, isoDate>`); modify
    `src/app/api/record/route.ts` to attach `firstSeenAt` (flag-on only); modify
    the authed record mount + `src/components/graph/graph-canvas.tsx` consumer to
    compute `stops`/`asOfEpoch` for authed exactly as `demo-graph-section.tsx`
    does; **update `src/app/api/record/route.test.ts`** so the parity guard is
    flag-conditioned (off → absent; on → present). Tests: `first-seen.test.ts`.
  - **Approach:** derive earliest evidence from `getLatestSupportCapturedAt`'s
    inverse (earliest, not latest) + observation `measuredAt`; no schema change.
    Visual-audit-gated (canvas) on a real record + the demo; preserve determinism
    + reduced-motion (snap).
  - **Test scenarios:** node with old chunk + newer observation → earliest wins;
    node with no dated evidence → omitted (renders present, today's behaviour);
    flag-off → no `firstSeenAt` (guard green); stops sorted/deduped.
  - **Verification:** authed scrubber dims/reveals by date; flag-off byte-for-byte
    parity; visual audit attached.

- [ ] **U8: `interpret()` on the main authed record graph**
  - **Goal:** Biomarker nodes on the main `/api/record` graph carry
    `interpretation` (not just `change`), matching the source-detail page.
  - **Requirements:** P2.2
  - **Dependencies:** none (reuses U-shipped engine)
  - **Files:** Modify `src/app/api/record/route.ts` (after
    `applyChangesToWireNodes`, attach `interpret(canonicalKey, change,
    {value,low,high})` per changed biomarker, flag-on + non-fatal); the parity
    guard update in U7 already covers `interpretation`. Tests: extend
    `record/route` test for the flag-on interpretation attach.
  - **Approach:** mirror `api/record/source/[id]/route.ts` exactly; value/range
    from the `MarkerChange`; unknown markers → conservative default (engine
    already handles). No new engine.
  - **Test scenarios:** changed biomarker with a `MATRIX` rule → interpretation
    present; non-matrix marker → conservative default; flag-off → absent; diff
    failure → name-only (non-fatal).
  - **Verification:** authed graph nodes interpretable; flag-off parity; suite
    green.

- [ ] **U9: Context-digest dated series + latest diff (consent/DPIA-gated)**
  - **Goal:** The chat context digest injects the dated lab series + the latest
    panel diff, not just latest values — only with consent and behind the flag.
  - **Requirements:** P2.4
  - **Dependencies:** U6 (diff), existing `buildMarkerTrajectory`
  - **Files:** Modify `src/lib/chat/user-context.ts` (extend `loadBiomarkers`/add
    a `loadDatedSeries` + `loadLatestDiff`, rendered as a bounded section);
    confirm the `llmConsentAcceptedAt` gate covers the turn (it does, via
    `turn.ts`); record the DPIA addendum note. Tests: extend
    `user-context.test.ts`.
  - **Approach:** flag-gated; cap series length per marker; summarise the diff as
    descriptive deltas; **no** trend/causal language here (that's Phase 3, policy-
    enforced). Field-cap + sanitise like the existing digest.
  - **Test scenarios:** flag-on + consent → series + diff appear, bounded; flag-
    off → today's latest-only digest (byte-for-byte); no consent → turn already
    412s before assembly (gate unchanged); injection-fixture turn stays safe.
  - **Verification:** digest contains dated series + diff under the flag; parity
    off; DPIA addendum recorded; suite green.

- [ ] **U10: Rollout gate (DPIA + consent + advisor) — not a flag flip in code**
  - **Goal:** Document and satisfy the launch gate before `LONGITUDINAL_GRAPH_ENABLED`
    is enabled for authed users.
  - **Requirements:** P2.4
  - **Dependencies:** U5–U9
  - **Files:** Plan/checklist doc + (if advised) consent-copy update; no
    behavioural code beyond the flag value.
  - **Approach:** follow the ask-deep launch-gate checklist (DPIA addendum;
    consent copy reviewed for temporal-history disclosure; advisor sign-off
    recorded in the PR; full enforce matrix + suite green; visual audit; cold-prod
    walkthrough on a throwaway alias), then flip via env.
  - **Verification:** checklist complete + recorded; flag flipped only after.

### Phase 3 — descriptive forward-looking trend layer

- [ ] **U11: Pure trend reader `src/lib/markers/trend.ts`**
  - **Goal:** Describe a marker's direction + momentum + since-when over its last
    N dated points — reference-aware, never a projected value.
  - **Requirements:** P3.1
  - **Dependencies:** none (consumes `SeriesPoint[]` + `classifyChange`)
  - **Files:** Create `src/lib/markers/trend.ts` + `trend.test.ts`.
  - **Approach:** `describeTrend(series, {low, high}) → { direction:
    'improving'|'worsening'|'stable', magnitude, sinceAt, pointCount, confidence:
    'single-reading'|'low'|'ok' }`. Direction from a signed, reference-aware slope
    + consecutive-step agreement (reuse `classifyChange` per step); minimum 3
    points to assert improving/worsening, 2 → "confirmation not trend", 1 →
    single-reading. No regression library; no future value.
  - **Test scenarios:** rising-into-range across 3 points → improving + magnitude
    + earliest date; falling-away → worsening; in-range flat → stable; 1 point →
    single-reading; mixed/no-range → stable/unclassified, never a fabricated
    direction; ordering independence.
  - **Verification:** pure, deterministic, node-env tests green.

- [ ] **U12: Derived views — wrong-direction + single-reading retest**
  - **Goal:** "Markers trending in the wrong direction" and "single-reading
    low-confidence markers that deserve a retest" (brainstorm Q4, Q10).
  - **Requirements:** P3.2, P3.3
  - **Dependencies:** U11
  - **Files:** Add `markersTrendingWrongDirection` / `singleReadingMarkers` to
    `src/lib/markers/trend.ts` (or a sibling `trend-views.ts`) + tests; optionally
    surface via a read route reusing the U5/U6 pattern (descriptive only).
  - **Approach:** pure over the user's per-marker series; "wrong direction" =
    `worsening` away from range; single-reading = `confidence:'single-reading'`.
    Retest suggestion text is **descriptive** ("a repeat test would confirm this
    direction") — no treatment/dose; may reference the existing retest loop
    (`src/lib/retest/`) for cadence context, read-only.
  - **Test scenarios:** worsening marker surfaces; improving does not; single-
    reading surfaces with a retest suggestion; suggestion contains no dose/drug/
    imperative (cross-check the forbidden-phrase patterns).
  - **Verification:** views correct; suggestion strings pass the policy scanner;
    suite green.

- [ ] **U13: `trend-description` judgment kind + citation rule**
  - **Goal:** Register the new judgment kind with its own citation discipline.
  - **Requirements:** P3.4
  - **Dependencies:** none (policy), pairs with U11/U12 for content
  - **Files:** Modify `src/lib/scribe/policy/types.ts` (add to `JUDGMENT_KINDS`),
    the relevant per-topic policies' `allowedJudgmentKinds` (deliberate, per
    Open-Question recommendation), `src/lib/scribe/policy/enforce.ts` (structural
    rule: a `trend-description` output must cite the dated values it describes,
    mirroring `investigation-avenues`). Tests: extend `enforce.test.ts`.
  - **Approach:** closed-enum addition + explicit allowlisting + a structural
    citation rule; no blanket enablement; advisor sign-off recorded in the PR.
  - **Test scenarios:** trend statement with cited dated values → accepted;
    uncited trend statement → rejected; a policy that does not allow it → out-of-
    scope routed; citation-density floor still enforced.
  - **Verification:** enforce matrix green; gating correct per policy.

- [ ] **U14: False-causality forbidden-phrase patterns + enforcement test**
  - **Goal:** Block "X caused/fixed/cured Y" phrasing that becomes tempting once
    trends are visible — for **all** judgment kinds.
  - **Requirements:** P3.4
  - **Dependencies:** none (parallel-safe; guards U2's rationale + U11/U12 output)
  - **Files:** Modify `src/lib/scribe/policy/forbidden-phrases.ts` (add
    `FALSE_CAUSALITY_PATTERNS`: e.g. `caused`, `fixed`, `cured`, `because of the
    {intervention}`, `due to taking`, `proves`, attributive "the X fixed your Y").
    Tests: `enforce.test.ts` + a dedicated pattern test.
  - **Approach:** patterns join the existing forbidden-phrase scan (which
    dominates judgment-kind routing), so they reject regardless of kind. Tune to
    avoid false positives on safe associative language ("coincides in time",
    "followed", "associated with") — those must still pass.
  - **Test scenarios:** "your iron supplement fixed your ferritin" → rejected;
    "this improvement followed the action you started; other factors may
    contribute" → accepted; "X caused Y" → rejected; the U2 `OUTCOME_CHANGED`
    rationale template → accepted.
  - **Verification:** causal claims rejected; safe associative phrasing passes;
    suite green.

## System-Wide Impact

- **Interaction graph:** Phase 1 adds edge writes at two existing seams (ingest,
  outcome) + one backfill; the renderer already draws these edge types. Phase 2
  adds `firstSeenAt` + `interpretation` to the authed wire (flag-on), two read
  routes, and a richer digest. Phase 3 is pure readers + policy.
- **Error propagation:** every new authed read + the digest + the
  `OUTCOME_CHANGED` edge are **non-fatal** (degrade to today's behaviour; never
  500 the ingest/outcome/vault path). The trend reader is pure.
- **API surface parity:** `SourceView`/wire nodes gain optional fields (additive);
  the parity guard becomes flag-conditioned (off → byte-for-byte today). New
  routes are additive + flag-gated.
- **Schema:** **no migration** — observation/edge/`intervention_event` writes use
  existing tables and types; all extra data rides `GraphEdge.metadata` /
  `GraphNode.attributes` JSON.
- **GDPR:** new `GraphNode`/`GraphEdge` rows ride existing export+delete coverage;
  U4 makes that coverage non-vacuous for the specific new rows.
- **Unchanged invariants:** demo paths; `classifyChange`/`interpret`/
  `buildMarkerTrajectory`/`panel-diff`/`motion.ts` semantics (reused, not
  modified); determinism + reduced-motion; the descriptive, non-diagnostic safety
  posture (Phase 3 *strengthens* it via false-causality enforcement).

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `OUTCOME_CHANGED` can't originate from a relational `Action` | Create a dated `intervention_event` instance (existing validated `from` type) at `outcome-measured`; keep Action relational (brainstorm §3.6) |
| Authed scrubber breaks the prod-parity guard | Make the guard flag-conditioned (off → absent; on → present) so flag-off parity stays machine-enforced; visual-audit-gated |
| Disclosing temporal history to the LLM is a consent/DPIA trigger | U9 flag-gated + `llmConsentAcceptedAt` + DPIA addendum + (if advised) consent copy; U10 launch gate before flip |
| Trend phrasing drifts into causation/prediction | U11 returns direction only (no value/probability); U13 citation rule + U14 false-causality patterns + enforce matrix; advisor sign-off |
| Edge backfill double-writes | `addEdge` dedup + observation `obs_<marker>_<date>` keys; idempotency asserted by re-run tests |
| Outcome/ingest path latency or failure from edge writes | Same-transaction but non-fatal edge skip on unresolvable concept; never blocks the relational write |
| Adding `trend-description` blanket-enables unsafe topics | Deliberate per-policy allowlisting only; `general` excluded; advisor sign-off per policy |
| Visual regression on the authed canvas (U7) | Visual-audit-gated on a real record + demo; reduced-motion snap; determinism preserved |

## Documentation / Operational Notes

- One flag (`LONGITUDINAL_GRAPH_ENABLED`) governs the authed read surfaces;
  Phase 1 edge **writes** are unconditional (additive). Flip for authed users
  only after the U10 gate.
- Candidate `docs/solutions/` notes: (1) "emit `TEMPORAL_SUCCEEDS`/`OUTCOME_CHANGED`
  at the existing ingest/outcome seams; idempotency rides node-key + edge dedup";
  (2) "authed longitudinal parity reuses `interpret()` + a derived `firstSeenAt`
  producer behind a flag-conditioned parity guard"; (3) "false-causality
  enforcement is the safety pre-req for any visible trend layer".
- Run `npm test` (vitest, real Postgres test DB) after each unit; the enforce
  matrix is the Phase 3 gate.

## Sources & References

- **Origin:** `docs/brainstorms/2026-06-10-longitudinal-health-graph-design.md`
  (§1.3, §3, §7, §9, §10) + the commissioning brief.
- **Prior longitudinal lineage:** `docs/plans/2026-06-10-002-feat-longitudinal-health-graph-plan.md`,
  `2026-06-10-003-feat-temporal-graph-canvas-plan.md`,
  `2026-06-15-001-feat-demo-graph-time-scrubber-plan.md`,
  `2026-06-16-002-feat-clinically-honest-graph-plan.md`,
  `2026-06-17-003-feat-deferred-graph-items-closeout-plan.md` (authed `interpret()`
  reuse + parity guard), `2026-06-05-001-feat-ask-deep-phase-a-plan.md` (judgment-
  kind launch-gate pattern), `2026-06-17-001-feat-return-leg-retest-loop-plan.md`
  (retest loop).
- **Phase 1 code:** `src/lib/graph/{types,edge-validation,visual-encoding,mutations,canonical-keys}.ts`,
  `src/lib/intake/lab-observations.ts`, `src/app/api/intake/documents/route.ts`,
  `src/lib/markers/backfill-observations.ts`, `scripts/backfill-lab-observations.ts`,
  `src/lib/actions/lifecycle.ts`, `src/app/api/actions/[id]/outcome/route.ts`,
  `src/lib/graph/attributes/intervention_event.ts`.
- **Phase 2 code:** `src/lib/graph/{as-of,scrubber}.ts`, `src/lib/demo/graph-adapter.ts`,
  `src/components/demo/demo-graph-section.tsx`, `src/components/graph/graph-canvas.tsx`,
  `src/app/api/record/route.ts` (+ `route.test.ts`), `src/app/api/record/source/[id]/route.ts`,
  `src/lib/markers/{clinical-interpretation,node-change-map,trajectory,panel-diff,classify-change}.ts`,
  `src/lib/chat/{user-context,turn}.ts`, `src/lib/llm/consent.ts`, `src/lib/env.ts`.
- **Phase 3 code:** `src/lib/markers/{trajectory,classify-change}.ts`,
  `src/lib/scribe/tools/recognize-pattern-in-history.ts`, `src/lib/scribe/policy/*`,
  `src/lib/retest/*`.
- **GDPR / tests / schema:** `src/lib/account/{export,delete}.ts` (+ tests),
  `vitest.config.ts`, `vitest.global-setup.ts`, `src/lib/graph/test-db.ts`,
  `prisma/schema.prisma`, `src/lib/graph/attributes/index.ts`.

## Future Considerations (explicitly not built here)

- **HeLM per-individual baseline bands** — compute personal reference bands from
  history and flag movement against the person's own baseline (heavily caveated,
  advisor sign-off, own flag). The main remaining HeLM gap; its own plan.
- **Learned/predictive forecasting (DT-Transformer-style)** — predicting future
  values or probabilities is a separate regulatory track; out of scope.
- **Confidence-over-time decay**, **symptom_episode / encounter / referral /
  procedure population**, **continuous authed scrubber animation polish** —
  brainstorm Phase 2–3 follow-ons.
