---
title: "feat: Ingestion & graph taxonomy — full-coverage data-point audit and schema extensions"
type: feat
status: complete
created: 2026-04-19
origin: conversational (ingestion coverage brief, 2026-04-19)
parent: docs/plans/2026-04-15-004-feat-health-graph-pivot-plan.md
siblings:
  - docs/plans/2026-04-17-001-feat-navigable-health-record-plan.md
  - docs/plans/2026-04-18-001-feat-clinical-scribes-in-content-plan.md
---

## Problem

Today the graph's typed vocabulary was sized for the v1 topic triad (iron / sleep / energy) and for three ingestion surfaces (free-text intake, UK lab PDFs, wearable streams via `HealthDataPoint`). The moat thesis for MorningForm is broader than that triad: "the NHS record gives you the spine, but the private winner owns the missing layers — continuous signals, structured context, intervention tracking, and specialist-grade interpretation." For that thesis to hold, every data point a user can plausibly bring us — from the NHS GP summary to a Whoop sleep stage to a Medichecks apo B to a stool calprotectin — has to land as a **graph-addressable, provenance-cited, topic-compilable** element.

This plan does **not** build new connectors. It does the precondition work: audit what the 10 NHS GP-record buckets and the 8 "whitespace" buckets from the brief imply for our typed node/edge/source/biomarker vocabulary, then propose the additive schema extensions so any future connector — NHS App export, Apple Health, Patients Know Best pull, private-lab uploads, consumer symptom diaries, wearable-window promotion — can write into a shape the topic-compile and graph-view surfaces already understand.

Every proposal is additive. No node type is renamed, no edge type is removed, no canonical-key grammar change. The plan is "grow the vocabulary to match the data points the moat requires," not "restructure what's shipped."

See origin brief: the long-list of NHS/GP data (identity, problems, medications, allergies, immunisations, observations, consultations, correspondence, referrals, summary) plus the eight whitespace categories (continuous wearable, patient-generated symptoms, lifestyle/exposure, private/consumer diagnostics, interpretation, treatment execution, cross-institution continuity, data-present-but-unusable).

Parent plan: [docs/plans/2026-04-15-004-feat-health-graph-pivot-plan.md](docs/plans/2026-04-15-004-feat-health-graph-pivot-plan.md) — U1 (schema) and U7 (GP-record import) are the nearest touchpoints. This plan supersedes the implicit attribute-shape decisions in U1 with a documented contract and extends U7's planned output-shape definition.

## Scope Boundaries

**In scope:**
- Inventory of every data point in the origin brief, each mapped to one of: already-covered / extend attribute contract / extend enum / new node type / new edge type / out-of-graph.
- Additive schema extensions to `src/lib/graph/types.ts`, `prisma/schema.prisma`, `src/lib/intake/biomarkers.ts`, and extraction prompts so each data point has a single canonical landing shape.
- Attribute-shape contracts (TypeScript interfaces + Zod schemas) per node type, so extractors emit a consistent shape instead of free-form `Record<string, unknown>`.
- Canonical-key naming conventions for the new node-type families (`allergy:*`, `immunisation:*`, `encounter:*`, `referral:*`, `procedure:*`, `observation:*`).
- Source-document `kind` enum extensions covering NHS correspondence formats and private/at-home diagnostics.
- Biomarker-registry additions for the ~10 private-lab analytes the brief implies.
- Migration path (data, Prisma schema, TypeScript type).
- Canonical-key conventions for ingestion-time dedup so repeated imports of the same underlying record converge.

**Out of scope:**
- New connectors (NHS App patient export, Apple Health Records, Patients Know Best, Medichecks, symptom-diary apps, adherence trackers). Connectors come after the vocabulary lands.
- LLM prompt updates for new extractors (e.g. an allergy-extraction system prompt). Tracked as deferred ingestion units, not built here.
- Topic-page templates for the new categories (immunisations-as-a-topic, encounters-as-a-timeline, etc.). Topic-page work is handled per U8–U11 in the parent plan.
- Wearable stream → `metric_window` promotion logic. The attribute contract is defined here; the promotion job is a separate future unit.
- Changes to `HealthDataPoint` table (stays the continuous raw stream store). This plan only defines the bridge shape.
- FHIR resource mapping. Listed in parent plan U7; this plan leaves FHIR scope alone and aligns node-type names so mapping is mechanical when U7 lands.
- Any user-facing UI work. The graph view and topic pages consume the new types via existing rendering paths.
- Regulatory copy review for new categories. Plan-time note only; goes through U18's existing lint/linter pipeline.

## Requirements Trace

Every implementation unit cites which origin-brief bucket(s) it addresses.

| Unit | NHS buckets | Moat buckets | Summary |
|---|---|---|---|
| T1 | — | — | Attribute-shape contracts on all existing node types (baseline for all extensions) |
| T2 | 4 (allergies), 5 (immunisations) | — | New node types: `allergy`, `immunisation` |
| T3 | 7 (consultations), 9 (referrals/procedures) | — | New node types: `encounter`, `referral`, `procedure` |
| T4 | 6 (results/observations) | 1 (continuous wearable) | New node type: `observation`; attribute contract for `metric_window` stream promotion |
| T5 | 8 (documents/correspondence) | 4 (private diagnostics), 7 (cross-institution) | `source_document.kind` enum expansion + `sourceRef` schema for cross-institution continuity |
| T6 | 6 (results — private panels) | 4 (private diagnostics) | Biomarker-registry additions for private-lab analytes |
| T7 | — | 2 (patient-generated symptoms), 3 (lifestyle/exposure) | Structured symptom episodes + lifestyle/exposure subtyping |
| T8 | 3 (medication adherence) | 6 (treatment execution) | `intervention_event` node type + `OUTCOME_CHANGED` edge type for adherence and outcome tracking |
| T9 | — | — | Canonical-key dedup grammar update across the new families |
| T10 | — | — | Prisma migration + Zod accessor update + type export audit |

**Explicitly not covered by taxonomy extensions:**

| Bucket | Reason |
|---|---|
| NHS 1 (identity/admin) | Belongs on `User`, `HealthConnection`, session/auth primitives. Not graph content. |
| NHS 10 (summary care record) | A narrow view of meds + allergies + adverse reactions — covered by existing `medication` + new `allergy`. No new primitive. |
| Moat 5 (interpretation layers) | The compiled output of `TopicPage` + clinical scribe audits. Not graph nodes — it's the render target. |
| Moat 8 (data-present-but-unusable) | Already handled by `source_document` + `source_chunk` + extraction. This is an ingestion-quality problem, not a taxonomy gap. |

## Architecture

Three principles shape every extension:

1. **Addition over mutation.** Every change in this plan is either a new enum value, a new node/edge type, a new optional attribute field, or a new row-shaped table. No renames, no type deletions. Rolling back any individual unit leaves the schema consistent.

2. **Attribute contracts are Zod, persisted as JSON string (per D5 of the parent plan).** `GraphNode.attributes` is still `String?`; each node-type family gets a Zod schema in `src/lib/graph/attributes/<type>.ts`, exported from `src/lib/graph/types.ts`. Callers serialise on write, parse on read. Unknown fields are preserved (Zod `.passthrough()` where extensibility matters, `.strict()` where it doesn't).

3. **Canonical-key grammar stays `^[a-z0-9][a-z0-9_]*$`.** Namespacing comes from the node `type`, not colon-prefixes in the key. An allergy to penicillin is `{ type: 'allergy', canonicalKey: 'penicillin' }`, not `{ type: 'allergy', canonicalKey: 'allergy:penicillin' }`. Colons in keys break the existing regex (per D7).

Layered against that, the proposed data shape looks like this:

- **Substrate (identity, billing, session).** Stays on `User` / `Session` / `HealthConnection`. Never a graph node.
- **Raw sources.** `SourceDocument` + `SourceChunk` (immutable). This plan extends `kind` enum and formalises `sourceRef` schema.
- **Structured health primitives.** `GraphNode` + `GraphEdge` with attribute contracts. Expands from 10 to 15 node types, from 5 to 7 edge types.
- **Continuous streams.** `HealthDataPoint` rows. Unchanged. A separate promotion job (deferred) folds statistically-meaningful windows into `metric_window` nodes with the new attribute contract from T4.
- **Rendered views.** `TopicPage`. Unchanged; new topic keys can be added per the topic registry when matching content lands.

## Key Technical Decisions

### D1 — Node-type proliferation over attribute-encoded subtyping

**Decision.** Add distinct node types for `allergy`, `immunisation`, `encounter`, `referral`, `procedure`, `observation`, `intervention_event`. Do not encode these as `condition` subtypes via `attributes.subtype`.

**Rationale.** The subgraph retrieval layer (U3, parent plan) filters by `type` and `canonicalKey` patterns. Topic registry entries declare `relevantNodeTypes[]`. Using a subtype field forces every caller to either read `type + attributes.subtype` (leaking schema into queries) or over-retrieve and filter client-side. Node-type proliferation is cheap — `GraphNode.type` is already `String` without DB-level enum constraint, and the TypeScript `NODE_TYPES` tuple costs one line per addition.

**Rejected alternatives.**
- *Subtype on `condition`.* Reject: topic retrieval breaks; an "iron" topic pulling conditions would also pull immunisations unless every call layers in a subtype filter.
- *Single `clinical_event` supertype.* Reject: loses the semantic distinction between "a consultation happened" and "a procedure was performed" at query time; regulatory linter can't scope rules to procedure-only.

### D2 — Attribute contracts per node type, enforced at write time

**Decision.** `src/lib/graph/attributes/` exports one Zod schema per node type (`medicationAttributesSchema`, `allergyAttributesSchema`, etc.). `addNode` and `ingestExtraction` validate `attributes` against the schema for the given type before serialising. Extractors emit typed shapes, not `Record<string, unknown>`.

**Rationale.** The current contract treats `attributes` as "anything JSON-serialisable," which is why three shipped callers produce three different shapes for medication dose. Topic-compile can't reason about dose/frequency consistently. A Zod gate at the mutation boundary fixes that without changing the database column type.

**Rejected alternatives.**
- *Per-column extraction (e.g. `Medication.dose`).* Reject: defeats the generic graph shape; every new node type forces a migration.
- *Loose TypeScript types only.* Reject: extraction is LLM-written; only runtime validation catches drift.

### D3 — Source-document `kind` extensions are open enum, validated at ingestion

**Decision.** `SOURCE_DOCUMENT_KINDS` grows from 6 to ~15 values. `SourceDocument.kind` stays `String` at the DB level. The TypeScript tuple is the single source of truth. Unknown kinds at read time decode to a sentinel `'unknown'` rather than throwing.

**Rationale.** New connectors (NHS App export formats, Apple Health, Patients Know Best) will surface document kinds we don't anticipate. A closed DB enum forces a migration per format; a tuple-level check at the ingestion seam catches the ones we care about while keeping forward-compat for experimental kinds.

### D4 — `sourceRef` becomes a structured schema, not a free-form string

**Decision.** `SourceDocument.sourceRef` keeps the `String?` column but carries a Zod-typed JSON string with shape `{ system: SourceSystem, recordId?: string, externalUrl?: string, pulledAt: string (ISO) }`. `SourceSystem` is a new enum: `'nhs_app' | 'patients_know_best' | 'apple_health' | 'terra' | 'private_lab:<slug>' | 'user_upload' | 'assistant_entry'`.

**Rationale.** Cross-institution continuity (moat bucket 7) requires knowing which system a record came from without inferring from `kind`. Same record re-imported from a different system should dedup via `(userId, contentHash)` — the structured `sourceRef` makes the origin auditable without re-uploading.

**Rejected alternative.**
- *Free-form `sourceRef: string`.* Reject: already shipped; hard to dedup across systems, not surface-able in the UI.

### D5 — Adherence and outcome-tracking use edges, not attribute mutation

**Decision.** Intervention adherence is modelled as `intervention_event` nodes linked back to an `intervention` node via a new `INSTANCE_OF` edge. Outcome change is modelled as a new `OUTCOME_CHANGED` edge from the `intervention_event` node to the biomarker/symptom it affected, with `weight` denoting effect-size polarity and `metadata: { beforeValue, afterValue, effectiveDate }`.

**Rationale.** Treating adherence as a mutation of the `intervention` node loses history: "did the user actually take this for 6 weeks" can't be answered without timestamps per event. Promoting each event to its own node gives natural TEMPORAL_SUCCEEDS chains, per-event SUPPORTS provenance, and a clean target for topic-compile to reason about "what changed after the intervention."

**Rejected alternatives.**
- *Attribute log array on `intervention` node.* Reject: breaks attribute-contract write-validation (D2); unbounded attribute growth clobbers JSON column; no per-event provenance.
- *Separate `AdherenceLog` table outside the graph.* Reject: outside the subgraph-retrieval layer, so topic-compile can't see it without bespoke joins.

### D6 — Observation vs biomarker split is mandatory

**Decision.** Blood pressure, pulse, temperature, respiratory rate, oxygen saturation, weight, height, BMI, waist, body-fat-percent are NOT biomarkers in the registry sense. They land as `observation` nodes with `canonicalKey` from a small vital-signs registry and `attributes: { value, unit, measuredAt, context? }`. `biomarker` is reserved for lab analytes with reference ranges.

**Rationale.** Treating BP as a biomarker bloats the biomarker registry with entries that behave differently (multi-value systolic/diastolic, home-measured rather than lab-drawn, no reference range in the same clinical sense). Splitting keeps the registry focused, lets the UI render different visualisations, and keeps "Show me my latest labs" queries uncontaminated by vitals.

**Rejected alternative.**
- *Biomarker with a `subtype: vital` attribute.* Reject: same reasoning as D1 — leaks subtype into queries.

## Patterns to follow

- **Node-type enum tuple:** `src/lib/graph/types.ts::NODE_TYPES` — add new entries, keep alphabetised within their semantic cluster.
- **Attribute-contract module shape:** model after the lab-biomarker attribute pattern in `src/lib/intake/biomarkers.ts` — `readonly` entries, `satisfies` over a type, lookup helpers that never throw on unknowns.
- **Canonical-key conventions:** match `src/lib/intake/extract.ts::CANONICAL_KEY_RE` (`/^[a-z0-9][a-z0-9_]*$/`). No colons, no dashes, no camelCase.
- **Ingestion contract:** `IngestExtractionInput` in `src/lib/graph/types.ts` is the single LLM-to-graph handoff shape. New node types and edge types land here, with type-level subset checks as in `src/lib/intake/extract.ts` (`_INTAKE_EDGE_SUBSET_CHECK`).
- **Zod passthrough vs strict:** match the shipped extraction schemas — strict for fields with known semantics, `.passthrough()` for free-form attributes where forward compatibility matters.

## Data-Point Inventory

### NHS bucket 1 — Identity & administrative

| Data point | Current coverage | Proposal |
|---|---|---|
| Name, DOB, sex/gender, NHS number, address | `User` fields / out of scope | No graph representation. Identity never becomes graph content. |
| GP practice, responsible GP, registration status | Not represented | Add to `User` or a new `UserProfile` model (deferred — not graph content). |
| Appointment history, encounter type | Partial — covered via T3 `encounter` node type | See T3. |
| Date/time of entry, authoring clinician | Captured on `SourceDocument.capturedAt` + new `sourceRef.authorClinician?` per D4 | See T5. |

### NHS bucket 2 — Problem list / diagnoses

| Data point | Current coverage | Proposal |
|---|---|---|
| Active problems, coded diagnoses, long-term conditions | `condition` node exists | T1 attribute contract: `{ status: 'active' \| 'past' \| 'resolved', onsetDate?, recordedDate?, resolvedDate?, sourceAuthority: 'self_reported' \| 'clinician_confirmed' \| 'nhs_coded', codeSystem?: 'SNOMED' \| 'ICD10', code? }`. |
| Issue status + dates | Not captured as structured attribute | See T1 row above. |
| Condition-related notes | Lands in `source_chunk` via document extraction | No taxonomy change. |

### NHS bucket 3 — Medication

| Data point | Current coverage | Proposal |
|---|---|---|
| Current, repeat, acute medications | `medication` node exists | T1 attribute contract: `{ dose?, frequency?, route?, startedAt?, stoppedAt?, status: 'current' \| 'past' \| 'as_needed', source: 'prescribed' \| 'otc' \| 'supplement' \| 'unknown' }`. |
| Medication reasons | Captured via ASSOCIATED_WITH / CAUSES edges to `condition` nodes | No taxonomy change; extraction prompt update deferred. |
| Prescribed/dispensed/administered | `attributes.status` + future intervention_event node for administration | See T8. |
| Adverse drug reactions | Edge from `medication` to new `allergy` node via `CAUSES` edge | See T2. |
| Past medication history | Same `medication` node with `status: 'past'` | See T1 row above. |

### NHS bucket 4 — Allergies and safety

| Data point | Current coverage | Proposal |
|---|---|---|
| Drug allergies, non-drug allergies, adverse reactions, sensitivities | **No node type** | **T2 — new node type `allergy`** with attribute contract `{ reactantClass: 'drug' \| 'food' \| 'environmental' \| 'other', reaction: string, severity: 'mild' \| 'moderate' \| 'severe' \| 'life_threatening' \| 'unknown', confirmedBy?: 'self_reported' \| 'clinician_confirmed', firstNotedAt?, lastReactedAt? }`. `canonicalKey` = reactant slug (`penicillin`, `peanut`, `pollen_grass`). |
| Summary safety info (in SCR) | No separate primitive needed; covered by `allergy` nodes + `medication` status | See T2. |

### NHS bucket 5 — Immunisations

| Data point | Current coverage | Proposal |
|---|---|---|
| Routine immunisations, vaccine events, COVID history | **No node type** | **T2 — new node type `immunisation`** with attribute contract `{ administeredAt: ISO_DATE, lotNumber?, manufacturer?, doseNumber?: number, series?: 'primary' \| 'booster', locationCode?, routeOfAdmin?: 'intramuscular' \| 'subcutaneous' \| 'oral' \| 'nasal' \| 'other' }`. `canonicalKey` = vaccine slug (`mmr`, `covid19_pfizer`, `influenza_seasonal`, `tetanus_dtap`). |

### NHS bucket 6 — Results, investigations, observations

| Data point | Current coverage | Proposal |
|---|---|---|
| GP test results, coded lab investigations | `biomarker` node + `BIOMARKER_REGISTRY` (45 analytes) | T6 extension — add ~10 private-lab analytes. |
| Blood pressure, pulse, temperature, heart rate, respiratory rate, SpO2, weight, height, BMI, waist | **No node type (`biomarker` misfit per D6)** | **T4 — new node type `observation`** with small `VITAL_SIGNS_REGISTRY`: `bp_systolic, bp_diastolic, pulse_resting, temperature_core, respiratory_rate, spo2, weight, height, bmi, waist_circumference, body_fat_percent`. Attribute contract `{ value: number, unit: string, measuredAt: ISO_TIMESTAMP, context?: 'clinic' \| 'home' \| 'wearable' \| 'self' }`. |
| Home BP series, weight trends | Raw stream in `HealthDataPoint` | T4 — define `metric_window` attribute contract `{ metric: CanonicalMetric, windowStartAt, windowEndAt, aggregation: 'mean' \| 'median' \| 'max' \| 'min' \| 'stddev' \| 'range', n: number, value: number, unit: string, baselineRef?: { value: number, derivedFrom: string } }`. |

### NHS bucket 7 — Consultations / encounters

| Data point | Current coverage | Proposal |
|---|---|---|
| Face-to-face, telephone, indirect encounters | **No node type** | **T3 — new node type `encounter`** with attribute contract `{ modality: 'face_to_face' \| 'telephone' \| 'video' \| 'indirect' \| 'other', clinicianDisplay?, serviceDisplay?, startedAt: ISO_TIMESTAMP, endedAt?: ISO_TIMESTAMP, summary?: string, linkedDocumentId?: string }`. `canonicalKey` = `encounter_<ISO_DATE>_<slug>` (e.g. `encounter_2026_03_12_gp`). Extraction treats each extracted encounter as a distinct node. |
| Appointment notes, clinician interactions | `source_chunk` body + ASSOCIATED_WITH edges to mentioned `condition` / `medication` | See T3. |
| Recent encounter summaries | Query by `encounter` nodes ordered by `attributes.startedAt` | No new primitive. |

### NHS bucket 8 — Documents & correspondence

| Data point | Current coverage | Proposal |
|---|---|---|
| Outpatient letters, discharge summaries | `source_document.kind` has `gp_record` only | **T5 — enum extension.** Add `'gp_letter', 'discharge_summary', 'referral_letter', 'specialist_letter', 'imaging_report', 'pathology_report'`. |
| Incoming correspondence from other providers | Same enum extension | See T5. |
| Uploaded documents | Existing `source_document` + `source_chunk` | No change. |

### NHS bucket 9 — Referrals & procedures

| Data point | Current coverage | Proposal |
|---|---|---|
| Outbound referrals | **No node type** | **T3 — new node type `referral`** with attribute contract `{ referredAt: ISO_DATE, serviceDisplay: string, status: 'pending' \| 'accepted' \| 'seen' \| 'discharged' \| 'declined' \| 'unknown', outcomeNote?, linkedEncounterId? }`. `canonicalKey` = `referral_<service_slug>_<ISO_DATE>`. |
| Coded procedures, consultation-linked actions | **No node type** | **T3 — new node type `procedure`** with attribute contract `{ performedAt: ISO_DATE, procedureDisplay: string, codeSystem?: 'SNOMED' \| 'OPCS4', code?, outcomeNote?, linkedEncounterId? }`. `canonicalKey` = `procedure_<procedure_slug>_<ISO_DATE>`. |

### NHS bucket 10 — Summary care record

Covered by `medication` (current meds) + new `allergy` (allergies + past reactions). No new primitive.

### Moat bucket 1 — Continuous & high-frequency wearable data

| Data point | Current coverage | Proposal |
|---|---|---|
| Sleep stages, HRV, RHR, SpO2 trends, glucose curves, respiratory trends, step/activity trends, body composition trends, VO2 max, strain, training readiness | Raw stream in `HealthDataPoint`; bridging to graph today is ad hoc | T4 — formalise `metric_window` attribute contract (see NHS bucket 6 row). No change to `HealthDataPoint` shape. Define `CanonicalMetric` enum extending the existing `canonical.ts` registry. |
| Menstrual cycle, hydration, environmental (air quality, sun, temperature) | Raw stream; may not be in `HealthDataPoint` today | Extension of `canonical.ts` registry + `metric_window` promotion. Not blocking this plan — contract shape in T4 covers the ingest vocabulary. |

### Moat bucket 2 — Patient-generated symptom intelligence

| Data point | Current coverage | Proposal |
|---|---|---|
| Symptom chronology, severity over time, triggers, relievers, functional impairment, flare patterns | `symptom` node exists (single canonical) | **T7 — structured episodes.** Extend `symptom` attribute contract: `{ severityScale: '0_10' \| 'qualitative', defaultSeverity?: number, commonTriggers?: string[], commonRelievers?: string[], qualityOfLifeImpact?: 'none' \| 'mild' \| 'moderate' \| 'severe' }`. **New node type `symptom_episode`** for time-bounded instances: `{ onsetAt: ISO_TIMESTAMP, resolvedAt?: ISO_TIMESTAMP, severityAtPeak?: number, durationMinutes?: number, triggers?: string[], relievers?: string[], notes? }`. `canonicalKey` = `episode_<ISO_DATETIME>`. Linked to parent `symptom` node via new edge type `INSTANCE_OF`. |
| Food correlations, medication side-effect logs, bowel/migraine/fatigue diaries, mood/cognition | `mood`, `energy` nodes (symptom-adjacent) | Same `symptom_episode` shape covers diary-style entries. `mood` and `energy` gain the same attribute contract — rolling into the symptom-episode structure by making those node types eligible parents of `INSTANCE_OF` edges. |

### Moat bucket 3 — Lifestyle & exposure

| Data point | Current coverage | Proposal |
|---|---|---|
| Diet, macros/micros, caffeine timing, alcohol, nicotine | `lifestyle` node exists (free-form) | **T7 — subtyping via canonicalKey families.** Name convention: `diet_<descriptor>` (e.g. `diet_high_protein`), `caffeine_pattern`, `alcohol_pattern`, `nicotine_use`, `supplement_<slug>`. Attribute contract per sub-family lives in `src/lib/graph/attributes/lifestyle.ts` as a discriminated union keyed on `lifestyleSubtype`. |
| Sauna, cold, sun, travel, shift work, stress, parenting load | Same `lifestyle` node | Same subtyping — `exposure_sauna`, `exposure_cold`, `travel_pattern`, `shift_work`, `stress_load`. |
| Air quality, mold, environmental exposure | Not represented | Same family: `exposure_air_quality`, `exposure_mold`, `exposure_environmental`. Values land in `attributes.timeSeries` or via `metric_window` if continuous. |
| Supplement stack | Covered ambiguously — lands as `medication` with `source: 'supplement'` OR `lifestyle` | T1 clarification: **supplements live on `medication` with `source: 'supplement'`**, not `lifestyle`. Taken, dosed, discontinued — medication mechanics apply. |

### Moat bucket 4 — Private & consumer diagnostics

| Data point | Current coverage | Proposal |
|---|---|---|
| Private blood panels (Medichecks, Thriva, Randox, Randox, Function Health) | `biomarker` node + `BIOMARKER_REGISTRY` | **T6 — registry additions:** `apolipoprotein_b`, `lipoprotein_a`, `homocysteine`, `hscrp`, `omega_3_index`, `vitamin_b12_active`, `free_testosterone`, `dhea_sulfate`, `igf_1`, `reverse_t3`. |
| At-home finger-prick tests, stool tests, microbiome panels | Partial (fits `biomarker` for single analytes) | T5 — `source_document.kind`: add `'at_home_test_result', 'microbiome_panel', 'stool_panel'`. Analyte-level extraction stays in `biomarker` nodes + registry. Microbiome diversity indices (Shannon, Simpson) as `biomarker` entries; taxa-level abundance deferred (needs a different node type, out of scope). |
| Consumer DNA reports (23andMe, ancestry + health) | **Not represented** | T5 — `source_document.kind: 'genetics_report'`. Variant-level representation deferred — not in this plan's scope (needs a distinct `genetic_variant` node type that is complex to model safely given regulatory posture). |
| Fertility tracking, semen analysis | Partial (may fit `observation` or `biomarker`) | T4/T6 — fertility biomarkers (sperm concentration, motility, morphology, AMH, FSH, LH) join the biomarker registry; basal body temp, cycle day join the vitals registry as `observation`. |
| DEXA, body-composition scans | **Not represented** | T5 — `source_document.kind: 'body_composition_scan', 'dexa_scan'`. Derived values (bone density Z-score, lean mass, visceral fat) join the vitals registry as `observation` entries. |
| Private MRI/CT reports | **Not represented** | T5 — `source_document.kind: 'imaging_report'` (shared with NHS bucket 8). Findings land as free text in `source_chunk`; structured representation deferred. |
| Specialist consults outside NHS | T3 — covered by `encounter` node with `sourceRef.system: 'private_provider:<slug>'` | See T3 + T5. |
| Private prescriptions, compounding pharmacy | Covered by `medication` + provenance | No new primitive; extraction prompt should capture `attributes.source: 'private_prescription'`. |
| Longevity / functional-medicine panels | Same as private blood panels | Covered by T6 biomarker registry + T5 source-document kind `'longevity_panel'`. |

### Moat bucket 5 — Context-rich interpretation layers

Not graph content. This is the topic-compile output (`TopicPage.rendered`) plus the clinical-scribes layer (`Scribe` / `ScribeAudit` tables). No taxonomy change.

### Moat bucket 6 — Treatment execution

| Data point | Current coverage | Proposal |
|---|---|---|
| Adherence: did the user take / buy / finish / stop | **No primitive** | **T8 — new node type `intervention_event`** with attribute contract `{ eventKind: 'started' \| 'taken_as_prescribed' \| 'missed_dose' \| 'dose_changed' \| 'stopped' \| 'side_effect', occurredAt: ISO_TIMESTAMP, notes?, selfReportedCompliance?: number (0–1) }`. Linked to parent `intervention` / `medication` via **new edge type `INSTANCE_OF`**. |
| Tolerated / worsened / improved after change | Edge from event to affected biomarker/symptom | **T8 — new edge type `OUTCOME_CHANGED`** with `weight` denoting effect polarity (−1..1) and `metadata: { beforeValue?, afterValue?, valueUnit?, effectiveDate, confidence: 'user_reported' \| 'measured' }`. |
| Completed scan / attended referral / repeated test | Covered via new `referral.status` attribute (T3) + `procedure.performedAt` (T3) | No additional primitive. |
| Followed diet advice | Covered by `intervention_event` linked to the `lifestyle` node (parent `lifestyle` is an intervention-capable type) | See T8; extend `INSTANCE_OF` edge validity to `lifestyle` and `medication` parents. |

### Moat bucket 7 — Cross-institution continuity

| Data point | Current coverage | Proposal |
|---|---|---|
| Same record available in multiple portals | `SourceDocument` dedup by `(userId, contentHash)` | **T5 — structured `sourceRef` (D4).** Same record from two systems surfaces as one graph contribution but retains both audit trails via new `SourceDocumentAlias` table: `{ sourceDocumentId, system: SourceSystem, recordId?, pulledAt }`. |
| Knowing which portal a record came from | `SourceDocument.sourceRef: String?` (free-form today) | T5 — structured schema. |

### Moat bucket 8 — Data present but unusable

Already addressed by `source_document` + `source_chunk` + LLM extraction. Extraction quality is a prompt problem (parent plan U5/U6/U7), not a taxonomy problem.

## Implementation Units

### T1 — Attribute-shape contracts on existing node types
**Files:** `src/lib/graph/attributes/` (new dir), `src/lib/graph/attributes/index.ts`, `src/lib/graph/attributes/condition.ts`, `.../medication.ts`, `.../symptom.ts`, `.../biomarker.ts`, `.../lifestyle.ts`, `.../intervention.ts`, `.../mood.ts`, `.../energy.ts`, `.../metric_window.ts`, `src/lib/graph/attributes.test.ts`, `src/lib/graph/mutations.ts` (validate-at-write hook), `src/lib/graph/types.ts` (re-export attribute types).
**Patterns to follow:** `src/lib/intake/biomarkers.ts` (typed registry), `src/lib/intake/extract.ts::ExtractedGraphSchema` (Zod discipline), `src/lib/health/canonical.ts` (metric registry).
**Approach:**
- One Zod schema per node type. Use `.passthrough()` for families that will grow (`medication`, `lifestyle`, `symptom`); `.strict()` for well-bounded ones (`biomarker`, `metric_window`).
- Export a discriminated union `NodeAttributesSchema = z.discriminatedUnion('nodeType', [...])` keyed on `nodeType: NodeType` for callers that need type-narrowed reads.
- `addNode` and `ingestExtraction` in `mutations.ts` look up the schema by `type`, validate `attributes`, throw `NodeAttributesValidationError` on mismatch (new typed error in `src/lib/graph/errors.ts`).
- Ship typed accessor `parseNodeAttributes<T extends NodeType>(type: T, json: string | null): AttributesFor<T>` so callers get compile-time-safe attribute reads.
- Existing rows: legacy attributes that don't match the new schema are tolerated on **read** (logged warning, returned as `{ _unvalidated: true, raw: <object> }`) but rejected on **write**. Migration window: one release.

**Execution note:** Test-first on the validation seam (write-rejects, read-tolerates, discriminated-union narrowing). Extraction-prompt updates come in follow-up plan, not here.
**Test scenarios:**
- Write a `medication` node with `{ dose: '500mg', frequency: 'daily', source: 'supplement' }` → persisted verbatim.
- Write a `medication` node with `{ source: 'prescribed', invalid_field: true }` using `.passthrough()` → persisted (passthrough preserves `invalid_field`).
- Write a `biomarker` node with `{ value: 'low' }` (string where number expected) → `NodeAttributesValidationError`, nothing persisted.
- Read a pre-existing `medication` row with malformed `attributes` JSON → returned as `{ _unvalidated: true }` and warning logged, no throw.
- `parseNodeAttributes('medication', json)` returns a value whose TypeScript type is `MedicationAttributes | UnvalidatedAttributes`.
- `ingestExtraction` with a mixed payload where one node fails validation → whole transaction rolls back (no partial graph write).

**Verification:** All tests green. `src/lib/graph/mutations.ts` diff is strictly additive; no existing tests regress.

### T2 — New node types: `allergy`, `immunisation`
**Files:** `src/lib/graph/types.ts` (add to `NODE_TYPES` tuple), `src/lib/graph/attributes/allergy.ts`, `.../immunisation.ts`, `src/lib/graph/attributes.test.ts`, `src/lib/graph/attributes/allergy-registry.ts` (optional reactant slug registry), `src/lib/graph/attributes/immunisation-registry.ts` (vaccine slug registry).
**Patterns to follow:** T1 attribute-contract pattern; `BIOMARKER_REGISTRY` shape for the slug registries.
**Approach:**
- `NODE_TYPES` additions: `'allergy'`, `'immunisation'`.
- Per D2, attribute schemas enforce shape at write. Canonical-key grammar unchanged.
- Allergy reactant registry is seed-scale (~30 common drugs / foods / environmental). Registry is open — unknown reactants still write as long as `canonicalKey` matches the grammar. Registry provides `displayName` + `reactantClass` defaults.
- Immunisation vaccine registry is seed-scale (~15 routine UK vaccines) with same open-enum pattern.

**Execution note:** Test-first on the attribute schemas and registry lookups.
**Test scenarios:**
- Write `{ type: 'allergy', canonicalKey: 'penicillin', attributes: { reactantClass: 'drug', reaction: 'hives', severity: 'moderate' } }` → round-trips through Zod.
- Invalid severity value → `NodeAttributesValidationError`.
- Unknown reactant (`canonicalKey: 'esoteric_compound_42'`) → writes successfully; `reactantClass` must be provided explicitly.
- `{ type: 'immunisation', canonicalKey: 'covid19_pfizer', attributes: { administeredAt: '2026-03-15', doseNumber: 3, series: 'booster' } }` → round-trips.
- Subgraph retrieval helper `getSubgraphForTopic` receives a request with `relevantNodeTypes: ['allergy']` → returns only allergy nodes.

**Verification:** All tests green; `NODE_TYPES` tuple exported correctly; no downstream consumers of `NODE_TYPES` break (TypeScript compilation passes on the full repo).

### T3 — New node types: `encounter`, `referral`, `procedure`
**Files:** `src/lib/graph/types.ts`, `src/lib/graph/attributes/encounter.ts`, `.../referral.ts`, `.../procedure.ts`, `src/lib/graph/attributes.test.ts`.
**Patterns to follow:** T1/T2.
**Approach:**
- `NODE_TYPES` additions: `'encounter'`, `'referral'`, `'procedure'`.
- Canonical-key conventions: date + slug (e.g. `encounter_2026_03_12_gp`, `referral_cardiology_2026_01_04`, `procedure_ecg_2026_02_10`). Document in `types.ts` as JSDoc comment and enforced lightly by extraction prompts (not by the canonical-key regex).
- All three types carry a `linkedDocumentId` attribute that refers to the `SourceDocument.id` where they were extracted from (not an edge — a direct reference, because the document is always the "from" side of the SUPPORTS edge already, this is a user-facing navigation affordance).

**Execution note:** Test-first on the attribute schemas; defer extraction-prompt work.
**Test scenarios:**
- Write a fully-populated `encounter` node → round-trips.
- Write a `referral` with `status: 'pending'` and no `linkedEncounterId` → accepted.
- Write a `procedure` with an unknown `codeSystem` → `NodeAttributesValidationError` (strict enum).
- Subgraph retrieval for a topic that includes `relevantNodeTypes: ['encounter', 'referral']` → returns both, preserves edge relationships to `condition` / `medication`.

**Verification:** All tests green; TypeScript compiles across the repo.

### T4 — New node type `observation` + `metric_window` attribute contract
**Files:** `src/lib/graph/types.ts`, `src/lib/graph/attributes/observation.ts`, `src/lib/graph/attributes/metric_window.ts`, `src/lib/graph/attributes/vital-signs-registry.ts`, `src/lib/health/canonical.ts` (extend if needed to cover all stream metrics referenced by `metric_window`), `src/lib/graph/attributes.test.ts`.
**Patterns to follow:** `BIOMARKER_REGISTRY` shape; `src/lib/health/canonical.ts` for `CanonicalMetric`.
**Approach:**
- `NODE_TYPES` addition: `'observation'`.
- `VITAL_SIGNS_REGISTRY`: `bp_systolic, bp_diastolic, pulse_resting, temperature_core, respiratory_rate, spo2, weight, height, bmi, waist_circumference, body_fat_percent`. Each entry: `{ canonicalKey, displayName, unit, context: 'vital' | 'body_composition' | 'cardiorespiratory' }`.
- `metric_window` attributes formalised per D6-adjacent section above. Enforces `metric` is a `CanonicalMetric` and `aggregation` is one of the enumerated values.
- Separate from `biomarker` entirely. Topic-compile retrieval can now include `observation` without pulling lab analytes.

**Execution note:** Test-first on the registries and schemas.
**Test scenarios:**
- Write `{ type: 'observation', canonicalKey: 'bp_systolic', attributes: { value: 124, unit: 'mmHg', measuredAt: '2026-03-15T09:00:00Z', context: 'home' } }` → round-trips.
- Unknown vital-sign `canonicalKey` outside registry → write succeeds but registry lookup returns `undefined`; caller displays the raw canonical key.
- Write a `metric_window` with `aggregation: 'percentile'` (not in enum) → rejected.
- Write a `metric_window` whose `windowEndAt` is before `windowStartAt` → rejected (Zod `.refine`).
- Retrieval filter: query `relevantNodeTypes: ['observation']` returns observations without biomarker pollution.

**Verification:** All tests green; `VITAL_SIGNS_REGISTRY` covered by registry-lookup tests.

### T5 — Source-document `kind` enum + structured `sourceRef` + cross-institution alias
**Files:** `src/lib/graph/types.ts` (`SOURCE_DOCUMENT_KINDS` extension), `src/lib/graph/source-ref.ts` (new), `src/lib/graph/source-ref.test.ts`, `prisma/schema.prisma` (new `SourceDocumentAlias` model), `prisma/migrations/<timestamp>_source_document_aliases/migration.sql`, `src/lib/graph/mutations.ts` (extend `addSourceDocument` to accept `aliases`).
**Patterns to follow:** D4 decision above; existing Prisma migration style in `prisma/migrations/`.
**Approach:**
- `SOURCE_DOCUMENT_KINDS` additions: `'gp_letter', 'discharge_summary', 'referral_letter', 'specialist_letter', 'imaging_report', 'pathology_report', 'at_home_test_result', 'microbiome_panel', 'stool_panel', 'genetics_report', 'body_composition_scan', 'dexa_scan', 'longevity_panel', 'private_lab_panel'`.
- `SourceRef` Zod schema (D4): `{ system: SourceSystem, recordId?, externalUrl?, pulledAt: ISO_DATETIME, authorClinician? }`.
- `SourceSystem` enum: `'nhs_app' | 'patients_know_best' | 'apple_health' | 'terra:<provider>' | 'private_lab:<slug>' | 'user_upload' | 'assistant_entry'`.
- **`SourceDocumentAlias`** new Prisma model:
  ```prisma
  model SourceDocumentAlias {
    id               String         @id @default(cuid())
    sourceDocumentId String
    sourceDocument   SourceDocument @relation(fields: [sourceDocumentId], references: [id], onDelete: Cascade)
    system           String
    recordId         String?
    pulledAt         DateTime
    createdAt        DateTime       @default(now())
    @@unique([sourceDocumentId, system, recordId])
    @@index([sourceDocumentId])
  }
  ```
- On second import of an already-known document (dedup hit on `(userId, contentHash)`): if the `sourceRef.system`/`recordId` differs from any existing alias, upsert a new `SourceDocumentAlias` row. Audit trail preserved without re-writing graph nodes.
- Update `SourceDocumentKind` TypeScript accessor to decode unknown-kind values as sentinel `'unknown'` (D3).

**Execution note:** Migration is additive (new table, nullable columns stay as they are). Test-first on alias dedup and `sourceRef` validation.
**Test scenarios:**
- Import a lab PDF from user upload → one `SourceDocument`, one `SourceDocumentAlias { system: 'user_upload' }`.
- Re-import the same PDF (hash collision) with `sourceRef.system: 'patients_know_best'` → no new `SourceDocument`, one additional `SourceDocumentAlias` added.
- `SourceRef` with an unknown system like `private_lab:medichecks` → validates (pattern-based validation allows `private_lab:*` and `terra:*` namespaces).
- `SourceRef` with invalid `pulledAt` (not ISO) → rejected.
- Unknown `source_document.kind` at read time → decodes to `'unknown'` without throwing.

**Verification:** All tests green; Prisma migration applies cleanly against the current dev DB; no impact on existing `SourceDocument` rows.

### T6 — Biomarker registry additions
**Files:** `src/lib/intake/biomarkers.ts` (additive entries), `src/lib/intake/biomarkers.test.ts` (new test cases), `src/lib/intake/lab-prompts.ts` (if analyte listing is prompt-referenced).
**Patterns to follow:** The existing registry shape is the pattern.
**Approach:**
- Add entries for: `apolipoprotein_b`, `lipoprotein_a`, `homocysteine`, `hscrp`, `omega_3_index`, `vitamin_b12_active`, `free_testosterone`, `dhea_sulfate`, `igf_1`, `reverse_t3`, `ft4_free_thyroxine` alias variants if needed.
- Add category extension if needed: `'cardiac_risk'` for apoB / Lp(a) (optional — could fit under `lipid`).
- Fertility biomarkers if already mentioned by the brief: `sperm_concentration`, `sperm_motility_progressive`, `sperm_morphology_normal`, `amh`, `fsh`, `lh`.
- Microbiome diversity: `microbiome_shannon_diversity`, `microbiome_simpson_diversity` (single-value indices; taxa-level deferred).
- Each entry gets alias coverage (at least 2 common aliases per entry).

**Execution note:** No execution-posture signal; straightforward data addition. Write alias-matching test cases for each new entry.
**Test scenarios:**
- `resolveBiomarker('Apolipoprotein B')` → returns `apolipoprotein_b` entry.
- `resolveBiomarker('Lp(a)')` → returns `lipoprotein_a` entry.
- `resolveBiomarker('hs-CRP')` → returns `hscrp` entry (not `crp`).
- `BIOMARKER_CANONICAL_KEYS` length grew by exactly the number of new entries.

**Verification:** All tests green; no alias collision regressions (existing `resolveBiomarker` tests still pass).

### T7 — Structured symptom episodes + lifestyle subtyping
**Files:** `src/lib/graph/types.ts` (`NODE_TYPES` += `'symptom_episode'`), `src/lib/graph/attributes/symptom.ts` (extended), `src/lib/graph/attributes/symptom_episode.ts` (new), `src/lib/graph/attributes/lifestyle.ts` (discriminated union by `lifestyleSubtype`), `src/lib/graph/attributes.test.ts`.
**Patterns to follow:** T2 attribute contracts; Zod discriminated union (existing examples in `src/lib/intake/extract.ts`).
**Approach:**
- `NODE_TYPES` addition: `'symptom_episode'`.
- `symptom` attribute contract extended with: `severityScale`, `commonTriggers`, `commonRelievers`, `qualityOfLifeImpact`. Backward-compat: all fields optional.
- `symptom_episode` node represents one time-bounded instance. Linked to parent `symptom` via **new edge type** `INSTANCE_OF` (introduced in T8; T7 declares the edge as used, T8 adds it to `EDGE_TYPES`).
- `lifestyle` attribute contract becomes a discriminated union on `lifestyleSubtype`: `'diet' | 'caffeine' | 'alcohol' | 'nicotine' | 'supplement' | 'sauna' | 'cold_exposure' | 'travel' | 'shift_work' | 'stress' | 'exposure_air_quality' | 'exposure_mold' | 'exposure_environmental' | 'exercise_program' | 'other'`. Per-subtype schema captures the fields specific to that subtype.
- Supplement-as-medication clarification (T1 decision): extraction prompts must land supplements on `medication` with `source: 'supplement'`, not on `lifestyle`. Enforce by a unit test on the extraction output (future prompt work; this plan ships the schema shape that makes the enforcement possible).

**Execution note:** Test-first for the symptom/episode parent-child representation and the lifestyle discriminated union.
**Test scenarios:**
- `symptom` node: `{ canonicalKey: 'fatigue', attributes: { severityScale: '0_10', commonTriggers: ['poor_sleep', 'over_exertion'] } }` → round-trips.
- `symptom_episode` node: `{ canonicalKey: 'episode_2026_03_12_1445', attributes: { onsetAt: '2026-03-12T14:45:00Z', severityAtPeak: 7, durationMinutes: 180, triggers: ['caffeine'] } }` → round-trips.
- `lifestyle` with `lifestyleSubtype: 'diet'` and subtype fields `{ pattern: 'high_protein', avgProteinGramsPerDay: 140 }` → round-trips.
- `lifestyle` with `lifestyleSubtype: 'caffeine'` and mismatched subtype fields → rejected.
- Attempting to set `lifestyleSubtype: 'supplement'` → rejected with clear error pointing callers to use `medication` + `source: 'supplement'`.

**Verification:** All tests green; extraction-prompt follow-up tracked as a deferred item.

### T8 — Intervention-event node type + adherence/outcome edges
**Files:** `src/lib/graph/types.ts` (`NODE_TYPES` += `'intervention_event'`; `EDGE_TYPES` += `'INSTANCE_OF'`, `'OUTCOME_CHANGED'`), `src/lib/graph/attributes/intervention_event.ts`, `src/lib/graph/edge-validation.ts` (new — enforces edge-type endpoint rules), `src/lib/graph/edge-validation.test.ts`.
**Patterns to follow:** T2/T3 attribute contracts; `_INTAKE_EDGE_SUBSET_CHECK` pattern from `src/lib/intake/extract.ts` for edge-type coverage tests.
**Approach:**
- `NODE_TYPES` addition: `'intervention_event'`.
- `EDGE_TYPES` additions: `'INSTANCE_OF'`, `'OUTCOME_CHANGED'`.
- **Edge-endpoint validation table.** `edge-validation.ts` exports a typed map `EDGE_ENDPOINT_RULES: Record<EdgeType, { validFromTypes: NodeType[], validToTypes: NodeType[] }>`. `INSTANCE_OF` only from `intervention_event` → `{intervention | medication | lifestyle}`. `OUTCOME_CHANGED` only from `intervention_event` → `{biomarker | symptom | observation | metric_window}`. `SUPPORTS` from `source_document` → any (unchanged). `TEMPORAL_SUCCEEDS` between same-type nodes. `ASSOCIATED_WITH` / `CAUSES` / `CONTRADICTS` unchanged (no endpoint restriction).
- `addEdge` enforces the rule; violations throw `EdgeEndpointViolation` in `src/lib/graph/errors.ts`.
- **Existing edges are grandfathered on read** but rejected on write (one-release window, same pattern as T1 attribute contracts).

**Execution note:** Test-first on the endpoint rule table — every new edge type has rejection and acceptance cases.
**Test scenarios:**
- `INSTANCE_OF` from `intervention_event` → `medication` → accepted.
- `INSTANCE_OF` from `intervention_event` → `biomarker` → `EdgeEndpointViolation`.
- `OUTCOME_CHANGED` from `intervention_event` → `symptom` with `weight: 0.6, metadata: { beforeValue: 7, afterValue: 3, effectiveDate: '2026-03-20' }` → accepted.
- `OUTCOME_CHANGED` from `biomarker` → `symptom` → rejected (only `intervention_event` is a valid `from`).
- Subgraph retrieval: including `intervention_event` in `relevantNodeTypes` returns the adherence history for the topic's linked interventions.
- Type-level test: `EDGE_TYPES` tuple drives `EDGE_ENDPOINT_RULES` keys — removing an edge type without updating the rules fails to compile.

**Verification:** All tests green; `ingestExtraction` handles the new edge types end-to-end via fixture.

### T9 — Canonical-key dedup grammar for the new families
**Files:** `src/lib/graph/canonical-keys.ts` (new), `src/lib/graph/canonical-keys.test.ts`.
**Patterns to follow:** `CANONICAL_KEY_RE` from `src/lib/intake/extract.ts`.
**Approach:**
- `CANONICAL_KEY_RE` unchanged.
- Ship `canonicalKeyFor(type, input)` helper family — one function per node type that generates a canonical key from a free-form string in a way that dedup works across imports. Examples:
  - `canonicalKeyFor('encounter', { date: '2026-03-12', serviceDisplay: 'GP surgery' })` → `encounter_2026_03_12_gp_surgery`.
  - `canonicalKeyFor('allergy', 'Penicillin V')` → `penicillin` (strips variant names via a small alias table).
  - `canonicalKeyFor('immunisation', 'Pfizer COVID-19 (3rd dose)')` → `covid19_pfizer` (dose number lives in attributes, not the key).
  - `canonicalKeyFor('symptom_episode', { onsetAt: '2026-03-12T14:45:00Z' })` → `episode_2026_03_12_1445`.
- Helpers are advisory for extractors — the LLM can emit any key that matches the regex, but using `canonicalKeyFor` in deterministic paths (structured imports, seed data, FHIR adapters per parent U7) ensures consistent keys across runs.

**Execution note:** Small utility unit; straightforward string-manipulation tests.
**Test scenarios:**
- Same encounter imported twice with slightly different `serviceDisplay` → same canonical key when normalised via the helper (case-insensitive match against a small stopword list).
- `canonicalKeyFor('allergy', 'peanut')` and `canonicalKeyFor('allergy', 'Peanuts')` → both `peanut`.
- All generated keys pass `CANONICAL_KEY_RE`.

**Verification:** All tests green.

### T10 — Prisma migration + type-export audit
**Files:** `prisma/schema.prisma` (adds `SourceDocumentAlias` only — all other changes are in-column JSON), `prisma/migrations/<timestamp>_source_document_aliases/migration.sql`, `src/lib/graph/index.ts` (ensure every new type, schema, and helper is re-exported), `src/lib/graph/types.ts` final audit.
**Patterns to follow:** existing migrations in `prisma/migrations/`.
**Approach:**
- Single new table: `SourceDocumentAlias` per T5. No other schema change (all node/edge expansions use the existing JSON `attributes`/`metadata` columns).
- Run `prisma migrate dev --name source_document_aliases` on a developer branch (Neon per parent plan D5) to generate the migration SQL; review for correctness before commit.
- Re-export audit: `src/lib/graph/index.ts` exports every new attribute schema, edge-validation helper, and canonical-key helper so consumers don't reach into attribute-subpaths.
- Update `IngestExtractionInput` if needed to accept the new node/edge types (the existing shape already takes `NodeType` / `EdgeType` from the exported tuples, so adding to the tuples flows through automatically — verify).

**Execution note:** No execution-posture signal. Straightforward migration + re-export sweep.
**Test scenarios:**
- Fresh dev DB: `prisma migrate deploy` + seed → no errors.
- TypeScript compilation passes across the repo with the new `NODE_TYPES` / `EDGE_TYPES` values.
- `IngestExtractionInput` accepts a payload containing every new node type and edge type end-to-end in a fixture test.

**Verification:** All tests green; Prisma migration reviewed and committed; `src/lib/graph/index.ts` re-exports every new public surface.

## System-Wide Impact

### Parent plan coordination
- **U1 (parent plan).** U1 already landed most of the schema; this plan extends the TypeScript-level vocabulary and adds `SourceDocumentAlias`. U1's `User.graphRevision` counter bumps on every `INSTANCE_OF` / `OUTCOME_CHANGED` edge write (enforced by existing `addEdge` code path).
- **U5 / U6 / U7 (parent plan).** Extraction units will need prompt updates to emit the new node types and edge types. Those prompt updates are **deferred** from this plan — they are ingestion work, not taxonomy work. This plan produces the shape contracts so prompt updates can be validated against them.
- **U8 (parent plan).** Topic-compile retrieval queries take `relevantNodeTypes: NodeType[]`. New types flow in automatically. Topic registry entries may want to declare new `relevantNodeTypes` (e.g. the iron topic benefits from `intervention_event` for adherence context). Registry updates are a separate change; this plan makes the shape available.
- **U19 (parent plan).** Post-generation linter rules may want to expand (e.g. "don't emit dose recommendations for `immunisation` nodes"). Left to U19 owner — this plan produces the type surface the linter can reason about.

### Sibling-plan coordination
- **Navigable record plan** (`docs/plans/2026-04-17-001-feat-navigable-health-record-plan.md`). The navigable UI consumes `GraphNode[]` + `GraphEdge[]` generically. New types render as additional chips / rows with appropriate icons — handled as sibling-plan follow-up, not here.
- **Clinical scribes plan** (`docs/plans/2026-04-18-001-feat-clinical-scribes-in-content-plan.md`). Scribes filter by `topicKey`; expanded node vocabulary gives scribes richer context without schema collision. Scribe audit schema does not change.

### Agent-native parity
Every new node type is a data shape — there is no user-facing feature with a UI affordance that needs a parallel agent tool in this plan. When ingestion prompts start emitting the new types (deferred), agent-tool parity is a per-prompt-unit concern.

## Dependencies and Sequencing

```
T1 (attribute contracts baseline)
 ├── T2 (allergy, immunisation)
 ├── T3 (encounter, referral, procedure)
 ├── T4 (observation, metric_window contract)
 ├── T6 (biomarker registry additions)
 └── T7 (symptom_episode, lifestyle subtyping) ── depends on T8 for INSTANCE_OF edge
        │
        └── T8 (intervention_event, INSTANCE_OF, OUTCOME_CHANGED)
T5 (source-doc kind + sourceRef + alias table) — independent of T1; can ship in parallel
T9 (canonical-key helpers) — after T2/T3/T7 for family coverage
T10 (Prisma migration + re-export audit) — last
```

Recommended execution order: **T1 → T5 (parallel) → T2 → T3 → T4 → T6 → T8 → T7 → T9 → T10.**

## Risks

### High
- **Attribute-contract migration breaks existing rows.** Mitigated by read-tolerant parsing in T1 (`_unvalidated` sentinel). All existing writes stop as soon as T1 ships; a one-release observation window catches callers producing off-contract attributes.
- **Edge-endpoint rules break existing `ASSOCIATED_WITH` / `CAUSES` writes.** Mitigated by keeping those three edge types unrestricted in `EDGE_ENDPOINT_RULES` (T8) — only the new `INSTANCE_OF` and `OUTCOME_CHANGED` rules are strict.

### Medium
- **Canonical-key collisions between families.** An allergy `canonicalKey: 'iron'` collides with a biomarker `canonicalKey: 'iron'` in human-readable contexts, though the DB uniqueness is `(userId, type, canonicalKey)`, so there's no DB-level clash. Mitigation: canonical-key families in T9 recommend type-family prefixes in display (not in the stored key) to avoid confusion.
- **Lifestyle discriminated union grows fast.** Adding a new subtype requires a new Zod schema arm. Mitigated by the `'other'` catchall subtype for low-frequency additions.

### Low
- **Topic registry falls out of date as new node types land.** Cost is invisible nodes in topic pages, not a correctness issue. Surfaced via graph-health-check (parent U19) eventually.

### Parked
- FHIR resource mapping (parent U7). This plan aligns node-type names with FHIR resource names where sensible (`condition`, `medication`, `allergy`, `immunisation`, `procedure`, `encounter`, `observation`). Genuine FHIR adapter work is parent-plan territory.

## Deferred to Implementation

- Extraction-prompt updates for `allergy`, `immunisation`, `encounter`, `referral`, `procedure`, `observation`, `intervention_event`, `symptom_episode` — prompt work is ingestion scope, not taxonomy scope. Each new prompt unit cites this plan for the shape contract.
- Topic-registry additions for an immunisations topic or encounters timeline — product decision, not taxonomy.
- `metric_window` promotion job (wearable stream → graph node) — needs a plan of its own; this plan defines the target shape only.
- `HealthDataPoint → metric_window` idempotency rules — comes with the promotion-job plan.
- Private-lab connector adapters (Medichecks CSV, Thriva PDF structured output, Function Health API) — each a separate ingestion plan. This plan ensures their output has a landing shape.
- Genetics / variant node type (`genetic_variant` with risk annotations) — regulatory-sensitive; out of scope.
- Microbiome taxa-level abundance node type — out of scope; current plan ships diversity indices as `biomarker` entries only.

## Implementation-Time Unknowns

- Exact severity-at-peak scale for `symptom_episode`: 0–10 vs. qualitative `mild | moderate | severe`. Start with 0–10 (resolved at implementation — the 0–10 scale survives aggregation better than ordinal labels).
- Whether lifestyle discriminated-union should use `.strict()` per-arm or `.passthrough()`. Start with `.passthrough()` for extensibility; tighten when usage patterns stabilise.
- Whether `encounter.clinicianDisplay` should be PII-tagged. Likely yes — add to the compliance-redaction map in `src/lib/compliance/` when T3 lands.

## Scope Boundary Verification

- No new ingestion connector is built. ✔
- No new LLM prompt shipped. ✔
- No UI component added. ✔
- All schema changes additive. ✔
- No existing node type, edge type, or source kind removed or renamed. ✔
- Parent plan units U1–U20 remain valid; this plan updates their attribute-shape dependencies only. ✔

## Next Steps

- Execute via `/ce:work` starting with T1.
- After T10 lands, open a follow-up plan for extraction-prompt updates that emit the new vocabulary. That plan supersedes parent-plan U5/U6/U7 prompt sections incrementally.
- After extraction plans land, open connector plans per private-provider or NHS-source in priority order (NHS App export → Apple Health Records → Patients Know Best → private-lab CSV/PDF uploads).
