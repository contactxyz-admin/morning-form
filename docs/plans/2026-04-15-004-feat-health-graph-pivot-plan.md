---
title: "feat: Health Graph pivot — import-first knowledge graph with topic pages"
type: feat
status: active
created: 2026-04-15
origin: docs/brainstorms/2026-04-15-health-graph-pivot-requirements.md
---

## Problem

MorningForm pivots from a check-in + wearable dashboard to a **health-record-first knowledge graph** — a Digital Product Passport for the body. Users port their health data in once (lab PDFs, existing wearable streams, free-text medical history, GP-record exports) and the product compiles it into a typed graph of nodes (symptoms, biomarkers, conditions, medications, interventions, source documents) and edges (SUPPORTS for provenance, associative, temporal). Topic pages are the primary UI; an explorable graph view is secondary; provenance is first-class.

**Current state** (per repo scan): strong health-ingestion backbone exists (`src/lib/health/*` — 8 providers via Terra + direct OAuth, canonical metric registry, normalization into `HealthDataPoint`, raw payload capture, idempotent suggestions rules engine). **Absent**: graph tables, LLM wiring (no Anthropic/OpenAI SDK in codebase), PDF upload + extraction, vector/embedding store, document chunking, graph rendering, topic-page templates. The health pipeline is the substrate; everything above it is net-new.

See origin: `docs/brainstorms/2026-04-15-health-graph-pivot-requirements.md` for the 23 committed requirements (R1–R23), scope boundaries, and decisions.

## Scope Boundaries

- **In scope for v1:**
  - Graph schema + query layer + LLM client infrastructure
  - Import-first intake flow with hybrid fallback (R4, R5, R7, R9)
  - Lab PDF ingestion + extraction into biomarker nodes with provenance (R8)
  - GP-record import path via patient-exported documents (R8)
  - Three full topic pages: Iron, Sleep & recovery, Energy & fatigue (R12)
  - Tiered action plans (Understanding / Do now / Discuss with clinician) + GP prep output (R13)
  - Daily brief (wearable-informed, secondary) (R14)
  - Health Graph view as secondary surface (R15)
  - Inline provenance on every topic-page claim (R16)
  - Regulatory copy/disclaimer pass (R17, R18, R19)
  - Phased absorb of existing check-ins and protocols as graph inputs (R21, R22)
  - First-login migration for existing users

- **Out of scope for v1:**
  - Direct NHS-linked API integration (GP Connect / IM1 / equivalent) — R10
  - Full topic pages for inflammation, cardiometabolic, hormones, gut (substrate only) — R12
  - New wearable integrations — the existing five are sufficient (R11)
  - Clinician-facing product — R13 delivers GP prep *for the user to take*, not a clinician app
  - Mobile-native apps — web-first
  - Deletion of existing check-in / protocol surfaces — reframe, don't remove (R20, R21, R22)
  - Pricing model / paywall boundaries — product decision, not engineering (R23 planning-only)
  - Vector/embedding store — deferred; v1 retrieval is direct graph-scoped subgraph injection

## Requirements Trace

Every implementation unit cites which brainstorm requirement(s) it addresses.

| Unit | Addresses | Summary |
|---|---|---|
| U1 | R1, R2, R3 | Graph schema (Node, Edge, SourceDocument, SourceChunk, TopicPage) |
| U2 | All | LLM client (Anthropic SDK, retry, structured output) |
| U3 | R1, R2, R16 | Graph query layer (subgraph retrieval, provenance tracing) |
| U4 | R7, R9 | Import-first intake UI (upload + free-text + structured fallback) |
| U5 | R2, R4, R9 | Intake extraction → typed graph nodes with provenance |
| U6 | R8 (lab PDFs) | Lab PDF ingestion + LLM-based biomarker extraction |
| U7 | R8 (GP record) | GP-record import pipeline (NHS App patient exports) |
| U8 | R12, R13, R16 | Per-topic compile pipeline (prompt, cache, provenance citations) |
| U9 | R12 (Iron) | Iron status topic page (pilot — prove pipeline end-to-end) |
| U10 | R12 (Sleep) | Sleep & recovery topic page (wearable-informed) |
| U11 | R12 (Energy) | Energy & fatigue synthesis page (graph-native) |
| U12 | R13 (GP prep) | GP appointment prep output (printable/shareable) |
| U13 | R15, R16 | Health Graph view (React Flow + provenance drill-down) |
| U14 | R14 | Daily brief surface (lightweight, wearable-informed) |
| U15 | R21 | Reframe check-ins as graph input nodes |
| U16 | R22 | Reframe protocols as intervention nodes with outcome tracking |
| U17 | — | First-login migration for existing users |
| U18 | R17, R19 | Copy + disclaimer pass (intended-purpose framing) |
| U19 | R18 | Prompt guardrails + post-generation linter |

## Architecture

Three-layer structure, modelled on Karpathy's LLM Wiki pattern:

1. **Raw sources** (immutable) — `SourceDocument` rows (lab PDFs, GP exports, intake text, wearable windows) + `SourceChunk` rows (addressable spans within each document for provenance).
2. **The graph** (compiled, LLM-written) — `GraphNode` + `GraphEdge` tables. `SUPPORTS` edges connect chunks to nodes so every node is traceable. Associative edges connect nodes (symptom → biomarker, biomarker → intervention). Temporal edges capture longitudinal change.
3. **Topic pages** (rendered views) — `TopicPage` rows cache compiled per-topic output; regenerated on node-change invalidation.

The LLM is the reasoning/presentation layer — it does extraction (raw → nodes/edges with provenance) and rendering (graph subgraph → topic-page prose with inline citations). It does not own business logic or graph mutation outside these two boundaries.

Retrieval for topic-page generation is **direct subgraph injection** — no vector store in v1. For each topic, a deterministic query pulls the relevant subgraph (all iron-tagged nodes + their SUPPORTS chunks + associative edges two hops out) and injects it into the prompt. Vector search is deferred until graph size or retrieval quality forces it.

## Patterns to follow

- **Provider client structure** (`src/lib/health/libre.ts`, `src/lib/health/dexcom.ts`) — typed errors, `fetchWithRetry` with jittered backoff, zod schema validation on response bodies. LLM client (U2) inherits this shape.
- **Session-gated credential resolution** (`resolveLibreCredentials`, `resolveDexcomToken` in `src/lib/health/sync.ts`) — fail closed on missing/expired/undecryptable tokens.
- **Canonical registry pattern** (`src/lib/health/canonical.ts`) — stable string keys mapped to typed metadata. Graph node types (`symptom`, `biomarker`, `condition`, `medication`, `intervention`, `lifestyle`, `source_document`) use the same registry approach.
- **Idempotent generator pattern** (`src/lib/suggestions/engine.ts` — `ensureTodaysSuggestions` upserts keyed on `(userId, date, kind)`) — topic-page compilation is idempotent on `(userId, topicId, graphRevision)`.
- **Zod-validated structured LLM output** — every LLM call returns a zod-parsed object; parse failure → typed error, not silent degradation.
- **Vitest fetch-mock** (`src/lib/health/libre.test.ts`) — LLM client real-path tests use the same pattern.

## Implementation Units

### Phase A — Foundations

### Unit 1 — Prisma schema: graph + source documents + topic pages
**Files:** `prisma/schema.prisma`, `prisma/migrations/<new>/migration.sql`
**Patterns to follow:** existing `HealthConnection` / `HealthDataPoint` schema style; canonical registry pattern.
**Approach:**
- `SourceDocument` (id, userId, kind: `lab_pdf` | `gp_record` | `intake_text` | `wearable_window` | `checkin` | `protocol`, sourceRef, capturedAt, raw bytes or ref to object storage path, metadata JSON)
- `SourceChunk` (id, sourceDocumentId, index, text, offsetStart, offsetEnd, pageNumber nullable, metadata JSON) — addressable spans for provenance
- `GraphNode` (id, userId, type enum, canonicalKey, displayName, attributes JSON, confidence, promoted boolean, createdAt, updatedAt)
- `GraphEdge` (id, userId, type: `SUPPORTS` | `ASSOCIATED_WITH` | `CAUSES` | `CONTRADICTS` | `TEMPORAL_SUCCEEDS`, fromNodeId, toNodeId, fromChunkId nullable, weight, metadata JSON)
- `TopicPage` (id, userId, topicKey: `iron` | `sleep_recovery` | `energy_fatigue`, status: `stub` | `full`, rendered JSON containing the three tiers, graphRevisionHash, updatedAt)
- Indices on `(userId, type)` for nodes/edges; `(userId, topicKey)` unique on TopicPage.
- Migration from SQLite is non-destructive; existing tables untouched. Migration to Postgres for production is a separate ops task, not in this plan.

**Execution note:** Test-first for query helpers, not the schema itself.
**Test scenarios:** schema valid (`prisma validate`), migration applies clean against a fresh DB.
**Test files:** none direct (covered by U3 query tests).
**Verification:** `prisma migrate dev` succeeds locally; `tsc --noEmit` clean; generated Prisma client exports the new types.

### Unit 2 — LLM client infrastructure (Anthropic SDK)
**Files:** `src/lib/llm/client.ts`, `src/lib/llm/client.test.ts`, `src/lib/llm/errors.ts`, `src/lib/env.ts`
**Patterns to follow:** `src/lib/health/libre.ts` verbatim for error classes + `fetchWithRetry` + backoff + timeout. Session-gated secret access like `resolveLibreCredentials`.
**Approach:**
- `@anthropic-ai/sdk` dependency. Default model: `claude-opus-4-6` for extraction and topic-page generation; `claude-sonnet-4-6` for lightweight daily-brief generation.
- `LLMClient.generate<T>(opts: { prompt, schema: ZodType<T>, model, maxTokens, temperature }): Promise<T>` — structured-output path using Anthropic's tool-use for schema-enforced JSON.
- Typed errors: `LLMAuthError` (401), `LLMRateLimitError` (429, with retryAfterSeconds), `LLMTransientError` (5xx / network), `LLMValidationError` (zod parse failure with raw model output captured for debugging).
- Bounded retry: max 3 attempts, jittered backoff (200/400/800 ms base + random jitter), 30s per-attempt timeout (longer than provider clients because extraction prompts are larger).
- Env: `ANTHROPIC_API_KEY` (required in prod, deterministic mock fallback in dev via `MOCK_LLM=true` that returns canned responses). Mock mode emits a visible warning.

**Execution note:** Test-first for the error-handling branches. Happy-path test uses a mocked `fetch` on the Anthropic API surface.
**Test scenarios:**
- 401 → `LLMAuthError`
- 429 with `retry-after` → `LLMRateLimitError` carries `retryAfterSeconds`
- 5xx transient → retries up to 3, then throws `LLMTransientError`
- Malformed response (non-JSON or schema-mismatch) → `LLMValidationError` with raw body
- Happy path → zod-parsed typed object returned; asserts correct model name and structured-output tool shape on outbound call
- `MOCK_LLM=true` → returns canned response without calling Anthropic, logs warning

**Verification:** All tests green; `tsc --noEmit` clean; live-API smoke test under `scripts/llm-smoke.ts` (manual, documented in comment).

### Unit 3 — Graph query layer
**Files:** `src/lib/graph/queries.ts`, `src/lib/graph/queries.test.ts`, `src/lib/graph/mutations.ts`, `src/lib/graph/mutations.test.ts`, `src/lib/graph/types.ts`
**Patterns to follow:** Prisma transaction pattern used in `src/lib/health/sync.ts` for compound writes.
**Approach:**
- Queries: `getNode(id)`, `getSubgraphForTopic(userId, topicKey, depth = 2)`, `getProvenanceForNode(nodeId)` returns list of `{ chunk, document }`, `getNodesByType(userId, type)`.
- Mutations: `addNode(userId, input)` with canonical-key deduplication (same type + canonicalKey → upsert, merge attributes), `addEdge(userId, input)`, `addSourceDocument(userId, input)`, `addSourceChunks(documentId, chunks[])` — all in a single transaction; partial failure rolls back.
- Graph-revision hash: deterministic hash of `(node count, edge count, max(updatedAt))` per user. Used by TopicPage cache invalidation in U8.
- Concurrency: LLM-driven extraction can generate duplicate node proposals in parallel; dedupe is canonicalKey-based. Tests cover concurrent writes.

**Execution note:** Test-first for deduplication + subgraph-retrieval logic.
**Test scenarios:**
- Add node with new canonicalKey → inserts
- Add node with existing canonicalKey → upsert, attributes merge without overwriting non-null fields
- Subgraph retrieval respects depth limit, includes SUPPORTS edges, returns chunks
- Concurrent addNode with same canonicalKey → exactly one row (unique constraint)
- Provenance retrieval returns chunks in source-document order
- Graph-revision hash changes when any node/edge changes, stable otherwise

**Verification:** All tests green; `tsc --noEmit` clean.

### Phase B — Ingestion

### Unit 4 — Import-first intake UI
**Files:** `src/app/(app)/intake/page.tsx`, `src/app/(app)/intake/upload/page.tsx`, `src/app/(app)/intake/history/page.tsx`, `src/app/(app)/intake/essentials/page.tsx`, `src/components/intake/*`
**Patterns to follow:** existing assessment flow components (`src/components/assessment/*`) for multi-step patterns, Card components, Framer Motion transitions.
**Approach:**
- Landing screen: "Bring your health data here" CTA → three-tab surface: **Upload** (drag-drop or select for lab PDFs, GP exports, any medical PDF), **Your story** (free-text medical history textarea), **Essentials** (structured fallback form: current meds, diagnoses, allergies, goals).
- Each tab writes to the same intake session state (Zustand store). User can complete any subset in any order; "Finish intake" button available once essentials complete.
- File upload uses standard HTML multipart POST to `/api/intake/documents` (handler in U6); no third-party uploader SDK.
- Loading/progress indicators during extraction (U5, U6, U7 run on submit).

**Execution note:** No test-first — this is UI; covered by E2E later. Unit tests on the Zustand store reducer.
**Test scenarios:**
- Store: adding a document, adding history text, submitting essentials, partial state persists across tab switches
- Form validation: required essentials fields enforced at Finish
- Upload handler receives file and posts to API

**Verification:** Manually run intake end-to-end in dev; store unit tests green.

### Unit 5 — Intake extraction pipeline
**Files:** `src/lib/intake/extract.ts`, `src/lib/intake/extract.test.ts`, `src/lib/intake/prompts.ts`, `src/app/api/intake/submit/route.ts`, `src/app/api/intake/submit/route.test.ts`
**Patterns to follow:** LLM client pattern from U2, graph mutations from U3. `ensureTodaysSuggestions` idempotency pattern from `src/lib/suggestions/engine.ts`.
**Approach:**
- Intake submission handler persists free-text + essentials → `SourceDocument(kind: intake_text)` + chunks.
- Extraction prompt (in `prompts.ts`): takes intake text + essentials JSON + existing user graph subgraph (for dedupe context), outputs a typed `ExtractedGraph` (list of proposed nodes with canonicalKey suggestions, list of edges with offsets back to the source chunks). Uses Claude Opus 4.6.
- Zod schema validates every node proposal: `{ type, canonicalKey, displayName, attributes, supportingChunkIds: string[] }`. Every node MUST have ≥1 supporting chunk (R2) — extraction prompt instructed; schema enforces.
- Writes: one transaction. Creates/upserts nodes (dedup by canonicalKey), creates SUPPORTS edges to the chunks, creates associative edges. Emits partial-graph completion event.
- Tentative topic stubs: after extraction, run a deterministic check — for each v1 topic (iron, sleep, energy), is there ≥1 relevant node? If yes, create `TopicPage(status: stub)` row.
- Idempotent on `(userId, intakeSessionId)` — re-submission upserts.

**Execution note:** Test-first for the extraction→write pipeline. Mock LLM returns canned typed output.
**Test scenarios:**
- Happy path: intake text + essentials → LLM returns 5 nodes, 3 edges → graph contains them all, each node has SUPPORTS edges to correct chunks
- LLM returns node without `supportingChunkIds` → `LLMValidationError`, no writes
- LLM returns duplicate canonicalKey → single node, attributes merged
- Re-submission with same sessionId → idempotent
- User with existing graph: extraction includes existing subgraph in prompt context (verify prompt construction)
- Tentative stub creation: iron-related node present → TopicPage row created with status `stub`
- Partial LLM failure (transient) → transaction rolls back, user can retry

**Verification:** All tests green; live-LLM smoke test documented.

### Unit 6 — Lab PDF ingestion + extraction
**Files:** `src/app/api/intake/documents/route.ts`, `src/lib/intake/pdf-extract.ts`, `src/lib/intake/pdf-extract.test.ts`, `src/lib/intake/lab-prompts.ts`
**Patterns to follow:** LLM client from U2; graph mutations from U3. Error-handling shape from `src/lib/health/libre.ts`.
**Approach:**
- Upload endpoint accepts PDF, stores to local object path (dev: `./uploads/<userId>/<docId>.pdf`; prod: S3-compatible path behind an abstraction — deferred to ops, interface-only here) and creates `SourceDocument(kind: lab_pdf)`.
- Extraction: `pdf-parse` (npm) for text-layer extraction first; if text layer is empty or near-empty (<200 chars), fall back to OCR via `tesseract.js` (CPU-only, slower — acceptable for v1). OCR flagged as "deferred for v2 quality pass" in a `// TODO(quality)` comment if quality is poor on test PDFs.
- Chunk the extracted text by visual section heuristics: page breaks, all-caps headers, blank-line boundaries. Write chunks with `offsetStart/offsetEnd` and `pageNumber`.
- LLM extraction prompt: "Extract biomarkers. For each: `{ canonicalKey, value, unit, referenceRangeLow, referenceRangeHigh, flaggedOutOfRange, collectionDate, supportingChunkIds }`." Uses Claude Opus 4.6. Zod schema validates unit/range types.
- Biomarker nodes written with canonicalKey from the biomarker registry (e.g., `ferritin`, `haemoglobin`, `hba1c`). SUPPORTS edges back to source chunks.
- Promotion check: after biomarker ingestion, any topic stub whose promotion threshold is met → promote to `status: full` and enqueue compile (U8).

**Research tasks embedded:**
- Validate extraction quality against 5 sample UK lab formats: NHS summary, Medichecks, Thriva, Bupa, Randox. Capture test PDFs under `fixtures/lab-pdfs/` (synthetic, no real user data).

**Execution note:** Test-first for the extraction → graph-write flow with mocked LLM output; fixture-based tests for PDF parsing.
**Test scenarios:**
- Text-layer PDF happy path: 12 biomarkers extracted, each has correct value/unit/reference range, each SUPPORTS edge points to the right chunk
- Image-only PDF → OCR fallback path invoked; test validates fallback trigger
- Malformed PDF → error surfaced, no partial writes
- Out-of-range biomarker flagged correctly (boolean attribute set)
- Reference-range normalization: unit mismatch between lab and canonical registry → conversion applied; unconvertible → biomarker stored with explicit unit + warning attribute
- Promotion: a user with a stub-iron topic page uploads a ferritin-containing PDF → TopicPage promoted to `full`
- Duplicate upload of same PDF → document deduped by content hash; no duplicate biomarker nodes

**Verification:** All tests green on fixture set; manual verification on one real anonymized PDF per format.

### Unit 7 — GP-record import pipeline
**Files:** `src/lib/intake/gp-record-extract.ts`, `src/lib/intake/gp-record-extract.test.ts`, `src/lib/intake/gp-record-prompts.ts`, `src/app/api/intake/documents/route.ts` (shared with U6)
**Patterns to follow:** U6 pipeline shape.
**Approach:**
- Detection: upload endpoint content-sniffs — filename hints (`scr`, `summary`, `medical-record`), keyword heuristics (NHS headers, GP Connect XML markers), or an explicit user-selected "type" on upload.
- Two format paths v1:
  - **PDF** (patient-exported summary from NHS App or equivalent): same text-extract path as U6, but a different LLM prompt focused on conditions, medications, allergies, consultations, events. Output shape: `{ conditions[], medications[], allergies[], events[] }` each with canonicalKey + effectiveDate + SUPPORTS chunks.
  - **Structured JSON** (FHIR-compatible export where available): bypass LLM, direct mapping to graph nodes via a typed FHIR resource adapter. Only FHIR `Condition`, `MedicationStatement`, `AllergyIntolerance`, `Observation` in v1 scope.
- FHIR support is opportunistic — if the NHS App patient export surfaces FHIR JSON for some users, it's preferred; otherwise PDF path is the default.

**Research tasks:**
- Confirm what NHS App patient exports actually produce for UK users today — PDF only, or structured too. Document findings in `docs/research/nhs-app-export-formats.md`. [Needs research]

**Execution note:** Test-first for the PDF extraction path; FHIR path is mechanical mapping with Zod schemas.
**Test scenarios:**
- PDF path happy: GP summary PDF → 3 conditions, 5 meds, 2 allergies extracted with correct SUPPORTS chunks
- FHIR JSON happy: a synthetic FHIR Bundle → nodes written correctly, no LLM call made
- Detection: content sniffing correctly routes PDF vs JSON paths
- Conflict handling: if a user uploads a lab PDF that overlaps with an existing GP-record biomarker, both SUPPORTS edges land on the same biomarker node (dedup by canonicalKey)
- Malformed FHIR → rejection with typed error, no partial writes

**Verification:** All tests green on synthetic fixtures; real-NHS-export verification deferred to a manual post-deploy check.

### Phase C — Topic Pages

### Unit 8 — Per-topic compile pipeline
**Files:** `src/lib/topics/compile.ts`, `src/lib/topics/compile.test.ts`, `src/lib/topics/registry.ts`, `src/lib/topics/prompts/*.ts` (one per topic)
**Patterns to follow:** Suggestions engine idempotency (`ensureTodaysSuggestions`). LLM client from U2. Subgraph retrieval from U3.
**Approach:**
- `TopicRegistry`: declarative per-topic config. Each entry: `{ topicKey, displayName, relevantNodeTypes[], canonicalKeyPatterns[], promotionThreshold, compilePrompt, linterFn }`.
- `compileTopic(userId, topicKey)`:
  1. Compute graph-revision hash
  2. If `TopicPage(userId, topicKey).graphRevisionHash === currentHash` and `rendered` non-null → return cached
  3. Otherwise: `getSubgraphForTopic(userId, topicKey, depth=2)` → inject into compile prompt → LLM returns typed three-tier output (`{ understanding: Section, whatYouCanDoNow: Section, discussWithClinician: Section }`) where each Section has `{ heading, bodyMarkdown, citations: { nodeId, chunkId, excerpt }[] }`
  4. Run linter (`linterFn` — from U19) against output; if any guardrail fires, reject with typed error and do NOT persist
  5. Write to `TopicPage(rendered, graphRevisionHash, updatedAt)`
- Rendering is per-user; caches expire on any graph mutation.
- Background worker (Next.js route handler invoked on graph mutation) enqueues recompile; UI reads current `rendered` + shows "updating" indicator if `graphRevisionHash` mismatch.

**Execution note:** Test-first for cache invalidation and linter integration.
**Test scenarios:**
- Cached hit: same graphRevision → no LLM call
- Cache miss: graph mutated → LLM called, new rendering persisted
- Linter rejection: prompt returns output containing "take 14mg iron daily" → linter fires, no persistence, typed error
- Missing citations: section claims a fact with no `citations` entry → linter fires
- Stub topic: status === 'stub' → no compile; UI shows stub state
- Parallel compiles for same (userId, topicKey) → exactly one write wins (unique constraint); other returns winner's output

**Verification:** All tests green; live-LLM smoke test on iron-fixture user.

### Unit 9 — Iron status topic page (pilot)
**Files:** `src/app/(app)/topics/iron/page.tsx`, `src/lib/topics/prompts/iron.ts`, `src/lib/topics/registry.ts` (entry), `src/components/topics/TopicPageLayout.tsx`, `src/components/topics/ThreeTierSection.tsx`, `src/components/topics/ProvenanceCitation.tsx`
**Patterns to follow:** Card components, existing page-layout patterns in `src/app/(app)/protocol/`.
**Approach:**
- This is the pilot — end-to-end proof that compile pipeline + UI works.
- Iron prompt focuses on ferritin, haemoglobin, transferrin saturation, MCV, symptom patterns (fatigue, breathlessness, restless legs), dietary factors, menstrual context where applicable.
- Prompt explicitly instructs: "Do not recommend doses or drug names. Recommend lifestyle actions in 'What you can do now'. Put clinical questions in 'Discuss with a clinician'."
- UI: three-section layout. Each citation is clickable → opens a drawer showing the supporting chunk with its source document reference and date.
- "Discuss with a clinician" tier renders the GP prep output from U12 inline as a collapsible card with "Print / share" action.

**Execution note:** Integration test that exercises the full pipeline (fixture graph → compile → render → citation drill-down).
**Test scenarios:**
- Iron page renders three tiers with correct headings
- Each citation in `Understanding` tier opens the right chunk
- Stub state: no ferritin node → page shows upload prompt, not a generated narrative
- Promoted state: user uploads ferritin-containing PDF → page refreshes with full content
- Regression: linter blocked output → page shows error state with retry, not broken content

**Verification:** All tests green; manual verification in browser with fixture user + real LLM call.

### Unit 10 — Sleep & recovery topic page
**Files:** `src/app/(app)/topics/sleep-recovery/page.tsx`, `src/lib/topics/prompts/sleep-recovery.ts`, `src/lib/topics/registry.ts` (entry)
**Patterns to follow:** U9.
**Approach:**
- Prompt incorporates wearable-derived nodes (HRV, RHR, sleep stages from `HealthDataPoint` via graph nodes created in migration U17). 7-day + 30-day rolling windows surfaced as attributes.
- Same three-tier structure. Lifestyle actions emphasize sleep hygiene, wind-down routines, caffeine timing, exercise timing. Clinical questions cover sleep apnoea screening, iron + restless legs overlap (cross-link to iron page), thyroid.

**Test scenarios:**
- Wearable-only user (no labs) → page renders with HRV + sleep data; "Understanding" references wearable windows as citations; action tier is coherent
- Lab + wearable user → evidence merged; citations include both
- No wearable connected → page shows connection prompt instead of generated narrative

**Verification:** All tests green; browser verification with a fixture user who has 30+ days of Whoop data.

### Unit 11 — Energy & fatigue synthesis page
**Files:** `src/app/(app)/topics/energy-fatigue/page.tsx`, `src/lib/topics/prompts/energy-fatigue.ts`, `src/lib/topics/registry.ts` (entry)
**Patterns to follow:** U9, U10. This is the graph-native synthesis proof — its prompt takes a wider subgraph (depth 3) spanning iron, sleep, thyroid, glucose, mood, medications, symptoms.
**Approach:**
- Prompt: "Synthesize likely drivers of the user's energy/fatigue from the provided subgraph. Reference cross-domain relationships (e.g., low ferritin + high nocturnal HRV drop → consider both iron and sleep domains). Do not speculate beyond the supplied evidence."
- UI shows a mini "Contributing factors" sidebar listing the other topic pages feeding this synthesis, linking to them.

**Test scenarios:**
- Multi-domain user: iron-deficient + low HRV + high glucose → synthesis page cites all three with citations; Contributing Factors sidebar lists Iron and Sleep pages
- Single-domain user: only iron data → synthesis still renders but flags narrow evidence
- Empty user: no relevant data → page shows "We don't have enough to synthesize yet — complete intake or upload a lab report"

**Verification:** All tests green; browser verification.

### Unit 12 — GP appointment prep output
**Files:** `src/lib/topics/gp-prep.ts`, `src/lib/topics/gp-prep.test.ts`, `src/components/topics/GPPrepCard.tsx`, `src/app/api/topics/[topic]/gp-prep/print/route.ts`
**Patterns to follow:** U8 compile pipeline.
**Approach:**
- GP-prep output generated during topic compile (U8) — embedded in the `discussWithClinician` section as a sub-structure: `{ questionsToAsk: string[], relevantHistory: string[], testsToConsiderRequesting: string[], printableMarkdown: string }`.
- Print endpoint returns formatted HTML for print-to-PDF (browser-native) or share-link (copy-to-clipboard).
- Prompt constraint: questions are patient-voiced ("I'd like to understand why my ferritin is low and whether iron supplementation is appropriate"), not clinical directives.

**Test scenarios:**
- Iron topic: GP prep contains 3-5 questions, relevant history pulls from user's actual graph (not generic), tests-to-request lists plausible follow-ups (e.g., "full iron studies including transferrin saturation")
- Print endpoint returns valid HTML with metadata (patient name, date, topic)
- Copy-to-share produces a shareable markdown block

**Verification:** All tests green; manual print test.

### Phase D — Graph View & Daily Brief

### Unit 13 — Health Graph view
**Files:** `src/app/(app)/graph/page.tsx`, `src/components/graph/GraphCanvas.tsx`, `src/components/graph/NodeDetail.tsx`, `src/components/graph/ProvenancePanel.tsx`, `src/app/api/graph/route.ts`
**Patterns to follow:** Seam's single-endpoint pattern (`GET /topics/:topicId/graph`) adapted as `GET /api/graph`.
**Approach:**
- `reactflow` dependency. Force-directed layout via `reactflow`'s built-in physics + `d3-force` helper.
- Node types visualised by color/shape: biomarker (blue circle), symptom (amber circle), condition (red hex), medication (green pill shape), intervention (purple diamond), source document (grey folder icon).
- Clicking a node opens the detail panel: node attributes + provenance list (all chunks that SUPPORT it, with source document + date).
- Soft cap: ~200 rendered nodes. Beyond that, cluster by node type + only expand on zoom/filter (v1 quality gate — if a single user exceeds 200 nodes, design a clustering update in v1.1).
- Provisional nodes (confidence < threshold) rendered with a dashed border.

**Test scenarios:**
- API returns correct shape (nodes + edges + node-type counts)
- Render with 50 fixture nodes — no visual regression on key layouts
- Click node → provenance panel shows chunks in source-document order
- Filter by type: only biomarker nodes visible when filter applied
- Empty graph state: onboarding prompt to complete intake

**Verification:** Integration tests on API; Playwright smoke test on render. Manual verification with dense fixture graph.

### Unit 14 — Daily brief
**Files:** `src/app/(app)/page.tsx` (home), `src/lib/brief/compile.ts`, `src/lib/brief/compile.test.ts`, `src/components/brief/DailyBrief.tsx`
**Patterns to follow:** Suggestions engine idempotency. LLM client with `claude-sonnet-4-6` (lighter model for daily output).
**Approach:**
- Daily brief compiles once per user per day on first home-load or via cron. Idempotent on `(userId, date)`.
- Input: last 7 days of wearable-derived graph nodes + any new graph mutations since yesterday's brief.
- Output: 2-4 short sentences. Example: "HRV trended 12% below your 30-day baseline last night — third night in a row. Consider protecting tomorrow's sleep window. (See Sleep & recovery.)"
- Linter (U19) applies — no drug names, no clinical directives.
- UI: home card, tappable → deep-links into the relevant topic page where mentioned.

**Test scenarios:**
- Idempotent on same-day repeat generation
- No wearable data → brief gracefully degrades to "Complete intake to see your daily brief"
- LLM output with drug name → linter rejects, shows fallback
- Linked topic page referenced → deep-link correct

**Verification:** All tests green; manual browser check.

### Phase E — Phased Absorb & Migration

### Unit 15 — Reframe check-ins as graph input nodes
**Files:** `src/lib/checkins/to-graph.ts`, `src/lib/checkins/to-graph.test.ts`, `src/app/api/checkins/route.ts` (modify existing)
**Patterns to follow:** existing CheckIn model + submission handler in `src/app/api/checkins/`.
**Approach:**
- Keep the existing CheckIn table and submission UI. On submission, an after-write hook creates corresponding symptom/mood/energy/lifestyle graph nodes (or updates existing ones with new temporal edges) with SUPPORTS edges back to the CheckIn row (treated as a SourceDocument of kind `checkin`).
- Temporal edges: a new mood node for today TEMPORAL_SUCCEEDS yesterday's mood node, so the graph captures change.
- No UI change in v1 — check-ins still live where they are; graph absorbs them silently.

**Test scenarios:**
- Submit a morning check-in with mood=3, energy=4 → corresponding nodes exist, with TEMPORAL_SUCCEEDS edge to yesterday's nodes
- Repeat submission for same date → upserts, no duplicate nodes
- Existing historical check-ins not present in graph until U17 backfills them

**Verification:** All tests green; integration check in dev with a new check-in.

### Unit 16 — Reframe protocols as intervention nodes
**Files:** `src/lib/protocols/to-graph.ts`, `src/lib/protocols/to-graph.test.ts`, `src/app/api/protocol/*/route.ts` (modify existing write paths)
**Patterns to follow:** U15.
**Approach:**
- Protocol items → intervention nodes. ProtocolAdjustment → temporal edges capturing change over time.
- No outcome-tracking edges in v1 (too much to infer reliably); v1.1 can correlate biomarker changes following intervention dates.

**Test scenarios:**
- Add protocol item → intervention node created with SUPPORTS back to ProtocolItem row
- Update protocol adjustment → new edge, old node preserved (immutable history)

**Verification:** All tests green.

### Unit 17 — First-login migration for existing users
**Files:** `src/lib/migration/backfill-graph.ts`, `src/lib/migration/backfill-graph.test.ts`, `src/app/(app)/layout.tsx` (trigger hook)
**Patterns to follow:** Idempotent generator pattern.
**Approach:**
- Lazy migration on first post-pivot login per user. Idempotent, marker row on User table: `graphMigratedAt`.
- Conversion:
  - `HealthDataPoint` rows → biomarker/metric nodes, one per unique `(provider, metric)` + TEMPORAL_SUCCEEDS chain per-metric time-series. SUPPORTS → `RawProviderPayload` rows (treated as SourceDocuments of kind `wearable_window`).
  - `CheckIn` rows → nodes per U15 logic.
  - `ProtocolItem` / `ProtocolAdjustment` → nodes per U16 logic.
  - `AssessmentResponse` / `StateProfile` → intake_text source document + nodes via the U5 extraction pipeline run once historically.
- Backfill is chunked (100 rows per chunk) and runs async in a background queue — first login shows a "setting up your graph" state while in progress; home unlocks when complete.
- Failure handling: per-chunk transaction; a failed chunk is retried up to 3 times, then flagged on a `graphMigrationErrors` table for manual intervention. User is not blocked — partial graph usable.

**Test scenarios:**
- User with 90 days of HealthDataPoint: backfill creates biomarker nodes per unique metric, each with correct TEMPORAL_SUCCEEDS chain
- User with check-ins: corresponding nodes created
- Idempotent: re-run backfill → no duplicate nodes
- Chunk failure → flagged, other chunks continue
- User with no historical data → marker set, no nodes

**Verification:** All tests green; manual backfill against a seeded user with 90 days of mock health data.

### Phase F — Regulatory & Guardrails

### Unit 18 — Copy + disclaimer pass
**Files:** `src/components/ui/disclaimer.tsx`, `src/app/(app)/layout.tsx`, `src/app/(marketing)/*` (if marketing surface exists), topic-page layouts (U9–U11)
**Approach:**
- Stated intended-purpose copy placed in:
  - App settings / about page
  - Footer of every topic page
  - Onboarding consent screen
  - Sign-up marketing copy
- Copy follows this frame: "MorningForm is a health information, interpretation, and decision-support service. It helps you understand your health data in context, identify low-risk lifestyle actions, and prepare for conversations with your clinician. It is not a medical device and does not replace clinical advice."
- Persistent topic-page disclaimer: "This content is for information only. Always discuss test results and symptoms with a clinician."
- No test scenarios — this is text. Verification is product + legal review.

**Verification:** Copy review checklist signed off by product and (where applicable) legal before launch. Grep confirms no drug-name or imperative-directive patterns in static copy.

### Unit 19 — Prompt guardrails + post-generation linter
**Files:** `src/lib/llm/linter.ts`, `src/lib/llm/linter.test.ts`, `src/lib/llm/guardrail-fixtures.ts`
**Patterns to follow:** U2 error types.
**Approach:**
- Linter is a pure function: `lint(output: string, context: { topicKey?, surface: 'topic'|'brief'|'gp_prep' }): LintResult` where `LintResult = { passed: boolean, violations: string[] }`.
- Checks (all implemented as ordered rules):
  - **Drug-name denylist**: curated list of common drug/supplement names + dosage-unit patterns (`\d+\s?(mg|mcg|iu|g)\b`). Any match → violation.
  - **Imperative clinical directive denylist**: patterns like `start|stop|take|discontinue|increase|decrease\s+(your\s+)?(medication|dose|dosage)` → violation.
  - **Diagnostic claim denylist**: patterns like `you have\s+(condition)`, `this is\s+(diagnosis)` → violation for non-Understanding tiers.
  - **Citation presence** (for topic-page output): every claim-bearing sentence in Understanding tier must have a citation reference in the output structure. Enforced via schema + this linter cross-check.
  - **Tier-appropriateness**: "What you can do now" must not reference clinician actions; "Discuss with a clinician" must not give lifestyle-only actions.
- Linter integrated into U8 compile pipeline: violation → no persistence → retry once with remedial prompt appended; two failures → log + surface error state in UI.
- Prompt-side guardrails: every LLM prompt template (extraction + topic-page + GP-prep + daily brief) includes a "What you must not do" section before the task description. U2 test exercises that the prompts contain these sections.

**Test scenarios:**
- Drug name ("ferrous sulfate 14mg") → violation
- Imperative ("start iron supplementation") → violation in non-clinician-tier
- Dose pattern ("20 mg") → violation
- Missing citation → violation
- Clean output → passes
- Tier cross-check: "What you can do now" mentioning "ask your GP" → violation (wrong tier)
- Linter integrated with compile: blocked output → no TopicPage write

**Verification:** All tests green; extensive fixture coverage committed under `src/lib/llm/guardrail-fixtures.ts` with examples from real UK clinical language that must be caught.

## Dependencies and Sequencing

```
Phase A (Foundations)
  U1 (schema) ─┬─> U3 (graph query layer)
               └─> U2 (LLM client)

Phase B (Ingestion) — after A
  U3 + U2 ─┬─> U5 (intake extraction)
           ├─> U6 (lab PDF)
           └─> U7 (GP record)
  U4 (intake UI) — parallel to U5/U6/U7

Phase C (Topic Pages) — after B
  U3 + U2 + U19 ─> U8 (compile pipeline)
  U8 ─┬─> U9 (Iron — pilot)
      ├─> U10 (Sleep)
      └─> U11 (Energy)
  U8 ─> U12 (GP prep, embedded in U8 output structure — built inline with U8)

Phase D
  U3 ─> U13 (Graph view) — parallel to C
  U2 + U8 ─> U14 (Daily brief)

Phase E — can start after A
  U1 + U3 ─┬─> U15 (check-ins → graph)
           ├─> U16 (protocols → graph)
           └─> U17 (first-login migration) — depends on U5 too for intake backfill

Phase F
  U19 (linter) ─ needed by U8; build early in C
  U18 (copy) — any time; launch gate
```

**Critical path:** U1 → U2 → U3 → U8 → U9. Iron page validates the full stack end-to-end; U10/U11/U12/U13/U14 are parallelisable after U8 exists.

**Recommended execution order:** Phase A fully → Phase B units U5+U6 first (defer U7 until NHS format research lands), UI U4 in parallel → Phase C starting with U19 linter → U8 → U9 (validate end-to-end) → U10, U11, U12 (parallel) → Phase D in parallel with late C → Phase E (U15/U16 parallel, U17 last) → Phase F launch gate (U18).

## Risks

- **LLM cost and latency.** Topic-page compile is per-user per-graph-revision; a heavy uploader might trigger 3+ compiles per day. Mitigation: caching via graphRevisionHash; daily-brief uses Sonnet (cheaper); extraction prompts targeted with only the relevant subgraph context.
- **Extraction quality on real UK lab PDFs.** Fixtures are synthetic — real-world PDFs from Medichecks, Thriva, Bupa, Randox may have layout quirks that break extraction. Mitigation: U6 embeds a research task and OCR fallback; ship iron first and iterate on the corpus before Sleep/Energy.
- **Regulatory drift.** Any prompt change risks producing SaMD-classifiable output (drug name, dose, directive). Mitigation: linter (U19) runs on every LLM output; prompt templates are immutable without code-review + copy-review sign-off.
- **Migration load on first login.** Users with years of wearable history could generate tens of thousands of data points. Mitigation: chunked backfill with progress UI; partial graph is usable.
- **React Flow performance at scale.** 200-node cap is a heuristic. Dense users may hit it. Mitigation: v1 ships with clustering-by-type fallback spec; v1.1 may need pre-computed layouts server-side.
- **Stripe subscription PR (#15) divergence.** The pivot reshapes subscription model (R23). Parked correctly per user decision; must be revisited before unpausing.

## Deferred to Implementation

- **LLM cost observability** — lightweight logging of token usage per surface; revisit after 2 weeks of real traffic.
- **Prompt versioning** — when prompts mature, version them so we can A/B and rollback. v1 ships one version per surface.
- **Postgres migration** — SQLite is fine for dev and the initial deploy. Production-scale Postgres migration is a separate ops task.
- **S3 / object storage abstraction** — v1 uses local filesystem; interface is designed for swap-in.
- **Vector store** — deferred until retrieval quality forces it.
- **Rate limiting on upload / extraction** — protect against abuse once any user-facing throttling signal appears.
- **Real GP-record format detection** — U7 embeds the research task; findings land in `docs/research/nhs-app-export-formats.md` before U7 ships.
- **Biomarker registry seed** — extension of existing `canonical.ts` pattern to ≥40 UK-common lab biomarkers. Built during U6 extraction.

## Implementation-Time Unknowns

- Does `pdf-parse` handle all 5 UK lab formats cleanly, or does one specific format require a different library (`pdfjs-dist` with custom text-layer handling)? Discoverable only during U6 fixture work.
- Is Anthropic structured-output tool-use the right mechanism, or should we use JSON mode? Prompt prototyping during U2 will decide.
- Does the React Flow `200-node` soft cap hold for a user with 2+ years of historical biomarker panels? Discoverable during U17 backfill testing.
- How does the NHS App patient-export actually surface data in 2026? U7 research task.

## Scope Boundary Verification

Cross-checked against origin brainstorm:

- R10 (no direct NHS API in v1) — respected; U7 is patient-export path only.
- R11 (no new wearable integrations) — respected; only existing 5 consumed.
- R12 (three full pages, others substrate) — respected; only Iron/Sleep/Energy get topic-page units.
- R18 (no drug names / dosages / imperatives in action plans) — enforced by U19 linter + prompt guardrails.
- R20 (Health Graph is primary surface) — U4 intake and U9–U11 topic pages become the primary journey; U13 graph view is secondary.
- R21 / R22 (phased absorb, don't delete) — U15/U16 preserve existing surfaces and silently enrich the graph.
- R23 (unified subscription) — respected as a planning note; Stripe PR #15 revisited post-pivot.

No requirements unaddressed. No scope creep beyond R1–R23.

## Next Steps

- `/ce:work` this plan, starting with Phase A (U1 → U2 → U3 sequentially since U3 depends on U1 and U2's types).
- Before U7 implementation: dispatch the NHS App export-format research task.
- Before U18 launch gate: copy review with product + legal.
