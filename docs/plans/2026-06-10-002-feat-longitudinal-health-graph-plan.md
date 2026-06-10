---
title: "feat: Longitudinal health graph — lab marker history as dated observation instances (Phase 0)"
type: feat
status: active
date: 2026-06-10
origin: docs/brainstorms/2026-06-10-longitudinal-health-graph-design.md
---

# feat: Longitudinal health graph — Phase 0 (lab marker history)

## Overview

The graph cannot represent lab history: biomarker nodes are upserted
one-per-marker with first-write-wins attribute merge, so a second blood
panel's values are structurally discarded (`src/lib/graph/mutations.ts:58-74`,
`biomarker` absent from `ROLLING_ATTRIBUTE_FIELDS`). This plan applies the
codebase's own "concept node + dated instance via `INSTANCE_OF`" pattern
(already used by `symptom`/`symptom_episode` and
`intervention`/`intervention_event`) to lab biomarkers, then builds the first
longitudinal surface on top: **"what changed since my last panel"**.

Target demo: user uploads a second blood panel → MorningForm shows which
markers moved, in which direction, against their reference ranges — and the
existing (dark) trajectory/decisions surfaces light up with real multi-point
lab series.

## Requirements Trace

- R1. A second lab upload **adds** a dated reading instead of being discarded;
  the biomarker concept node's "current" picture updates (date-guarded —
  uploading an *older* panel never clobbers a newer current value).
- R2. `buildMarkerTrajectory` returns multi-point **lab** series (today its lab
  arm is structurally capped at 1 point per marker).
- R3. Lab and wearable series for the same marker actually merge (today the
  exact-name join silently fails: `"HbA1c"` ≠ `hba1c_percent`).
- R4. A panel-diff reader computes per-marker change between the two most
  recent panels with **range-relative** classification (toward/away from the
  reference interval) — descriptive, no causal or diagnostic language.
- R5. The diff surfaces in the upload response and as a card on `/decisions`,
  gated by a new `LONGITUDINAL_GRAPH_ENABLED` flag (strict `=== 'true'`).
- R6. Observation instances do not clutter the graph canvas (filtered from the
  `/api/record` wire payload; history surfaces via trajectories/diff instead).
- R7. Already-ingested panels are backfillable into instances (idempotent).
- R8. Flag off → byte-for-byte current behavior on read surfaces. (Instance
  *writes* are additive and unconditional — they are invisible until a read
  surface renders them, and gating writes would create a backfill gap.)

## Scope Boundaries

- ❌ No new Prisma models, node types, or edge types — reuse `observation`,
  `INSTANCE_OF`, `SUPPORTS`.
- ❌ No AI/prompt changes — temporal judgment kinds + context-digest series
  injection are advisor/DPIA-gated (brainstorm §5/§9); separate plan.
- ❌ No graph motion work (pulse-on-change, time scrub) — visual-audit-gated;
  separate plan (extends `2026-06-08-001-feat-graph-physics-motion-plan.md`).
- ❌ No auto-matching of uploads to open actions (Phase B's R9 stays manual).
- ❌ No optimal-range/polarity table — classification is reference-range-
  relative only; in-range directionality (e.g. LDL lower-is-better) is
  deliberately reported as `stable`/direction-only until a clinically
  reviewed polarity table exists.
- ❌ Intake free-text biomarker mentions do not emit instances (narrative
  recall is not a measurement); lab_pdf path only.
- Deferred: demo persona fixture gains dated instances (separate task — the
  demo seed bypasses the ingest path entirely).

## Key Technical Decisions

- **Instance = `observation` node** keyed `obs_<marker>_<yyyy_mm_dd>`
  (matches existing time-bearing key conventions), attributes
  `{ value, unit, measuredAt, context: 'clinic', source: 'lab_pdf' }`
  (fits the existing strict `ObservationAttributesSchema` unchanged),
  `promoted: false`. Same-day re-measurements collapse by key (consistent
  with the trajectory's same-day dedupe).
- **`INSTANCE_OF` rule extension**: `validFromTypes` gains `observation`,
  `validToTypes` gains `biomarker`. Existing pairs untouched.
- **Concept node currency**: `biomarker` joins `ROLLING_ATTRIBUTE_FIELDS`
  with `latestValue`, `latestValueAt`, `flaggedOutOfRange`; the merge gains a
  per-type **date guard** so rolling fields only apply when the incoming
  `latestValueAt` is ≥ the stored one (out-of-order uploads preserved as
  instances, never clobber "current"). `latestValueAt` added to
  `BiomarkerAttributesSchema`.
- **Panel = lab_pdf `SourceDocument`**; instances map to panels via their
  `SUPPORTS` edge `fromDocumentId`, falling back to same-day `measuredAt`
  vs document `capturedAt` (covers backfilled instances with no SUPPORTS).
- **Classification is range-relative**: distance to the reference interval
  decreased → `improved`; increased → `worsened`; in-range both times →
  `stable`; no range → direction only (`unclassified`). Pure functions,
  exhaustively tested.
- **Canvas filter lives in `aggregateRecord`** (it already receives nodes +
  edges): drop observation nodes with an `INSTANCE_OF` edge to a biomarker
  before importance scoring, so instances never consume the 200-node cap.
- **Wearable alias map** is explicit and registry-anchored
  (`src/lib/markers/metric-aliases.ts`), not fuzzy matching — silent wrong
  joins are worse than missing ones.

## Implementation Units

- [x] **U1: Temporal write contract** — `INSTANCE_OF` endpoint extension;
  biomarker rolling fields + date guard in `mergeAttributes`; `latestValueAt`
  in `BiomarkerAttributesSchema`. Tests: edge-validation + mutations (incl.
  out-of-order upload guard).
- [x] **U2: Lab ingest emits instances** — pure
  `buildLabObservationGraphInputs()` in `src/lib/intake/lab-observations.ts`;
  wired into `POST /api/intake/documents` (nodes + INSTANCE_OF edges +
  concept rolling attrs). Tests: builder unit tests + route test proving a
  second panel yields two dated instances and an updated concept value.
- [x] **U3: Trajectory reads instances** — `loadBiomarkerSeries` walks
  `INSTANCE_OF` instances (keeping the legacy concept-value point; same-day
  dedupe collapses overlap); `loadWearableSeries` joins through the alias
  map. Tests: multi-point lab series; alias-map merge; legacy-only fallback.
- [x] **U4: Panel-diff reader** — `src/lib/markers/panel-diff.ts`:
  `diffLatestPanels(db, userId)` + pure `classifyChange()`. Tests: direction,
  range-relative classification, new-marker, no-previous-panel, missing-range.
- [x] **U5: Flag + API surface** — `LONGITUDINAL_GRAPH_ENABLED` in
  `src/lib/env.ts`; `GET /api/markers/changes`; upload response gains
  `changes` when flag on. Tests: route auth/flag/empty/diff paths; flag-off
  byte-identical upload response.
- [x] **U6: Canvas noise control** — filter lab-instance observations in
  `aggregateRecord`. Test: instances excluded from wire nodes/edges + counts,
  vitals observations unaffected.
- [x] **U7: "What changed" card on `/decisions`** — server-rendered card atop
  the timeline (flag-gated, renders only when a previous panel exists).
  *Visual audit + the prod flag-flip remain (gate, per repo convention) — the
  code ships dark behind `LONGITUDINAL_GRAPH_ENABLED`.*
- [x] **U8: Backfill** — `src/lib/markers/backfill-observations.ts` (lib, tested)
  + `scripts/backfill-lab-observations.ts` runner (+ `markers:backfill-observations`
  npm alias); emits instances from existing concept nodes' stored
  value+collectionDate; idempotent by key.

### Remaining before flag flip (not code units)

- Visual audit of the `/decisions` panel-diff card (desktop + mobile) — the
  one gate code review can't cover. The flag stays **off in prod** until then.
- Demo persona fixture: add dated `observation` instances (the seed bypasses
  the ingest path) so the demo shows multi-point lab trajectories. Deferred
  task noted in Scope Boundaries.
- Run the backfill (`markers:backfill-observations`) in prod after the flip so
  existing single-value markers gain their anchor point.

## System-Wide Impact

- Ingest writes ~2× node rows per panel (one instance per biomarker) — well
  inside the 30s transaction budget; instances are excluded from the canvas
  payload so `/record` rendering and the 200-node cap are unaffected.
- `ActionOutcome.beforeValue` resolution (`resolveBeforeValueAtAcceptance`)
  automatically improves: with real lab history it can find the true value at
  acceptance time instead of the single stored value.
- GDPR: no new models — instances are `GraphNode`/`GraphEdge` rows already
  covered by export/delete guards.
- Existing single-value reads (`user-context.ts` biomarker digest, topic
  compile) keep working: concept nodes retain `value`/`collectionDate`
  (first-write-wins) and gain a *current* picture via rolling fields.

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| Out-of-order upload clobbers "current" value | Date guard on rolling merge (U1, tested) |
| Same-day duplicate instances inflate trajectories | Key collapse by `<marker>_<yyyy_mm_dd>` + trajectory same-day dedupe |
| Instances flood the canvas / consume the node cap | `aggregateRecord` filter (U6, tested) |
| Wrong lab↔wearable joins | Explicit alias map; drop-on-conflict unit reconciliation already in `reconcileUnits` |
| Classification reads as medical advice | Range-relative vocabulary only (`improved/worsened/stable` vs reference interval); no causal or diagnostic phrasing; UI copy descriptive |
| Backfill double-runs | Idempotent upsert by canonical key |

## Sources & References

- Origin: `docs/brainstorms/2026-06-10-longitudinal-health-graph-design.md`
- Pattern precedent: T7/T8 in `src/lib/graph/types.ts` (episodes/events),
  `docs/plans/2026-04-19-002-feat-ingestion-taxonomy-coverage-plan.md`
- Surfaces lit up: `docs/plans/2026-06-06-002-feat-decisions-that-compound-phase-b-plan.md`
- Code: `src/lib/graph/{mutations,edge-validation,attributes}`,
  `src/app/api/intake/documents/route.ts`, `src/lib/markers/trajectory.ts`,
  `src/lib/record/aggregate.ts`, `src/app/(app)/decisions/page.tsx`
