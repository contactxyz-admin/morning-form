# MorningForm — Paper vs Code Gap Audit

**Date:** 2026-07-01
**HEAD audited:** `1d140a3` (branch `claude/morningform-paper-code-audit-8r9e6v`)
**Method:** Every status claim below is anchored to a live `file:line` at this HEAD. The brief's "OBSERVED STATE" was treated as a hypothesis to verify, not truth. Where the observed state was stale or wrong, it is flagged **[STALE-CLAIM CORRECTED]** with evidence.

> **Note on paths.** The brief's file hints were partly stale. Real locations at HEAD: the pgvector compat guard is `src/lib/embeddings/compat.ts` (not `graph/compat.ts`); biomarker constants are `src/lib/intake/biomarkers.ts`; clinical interpretation is `src/lib/markers/clinical-interpretation.ts`; dated observations are `src/lib/intake/lab-observations.ts`; the grounding metric is `src/lib/metrics/hybrid-retrieval-grounding.ts`.

---

## 1. Executive summary

**Parity confirmed on the retrieval fundamentals.** Reciprocal Rank Fusion is a faithful Cormack-2009 implementation (`k=60`, rank-only, first-rank-wins dedup, deterministic ties — `src/lib/graph/hybrid-retrieval.ts:87-104`), and the embeddings layer matches Neelakantan-2022 (pluggable provider, `text-embedding-3-small` @ 1536-d, cosine, deterministic mock — `src/lib/embeddings/types.ts:17-20`). These need no action.

**The top real gaps are three.** (1) The vector arm is not ANN — it is a bounded exact JS-cosine scan over each user's **400 most-recent** chunks (`hybrid-retrieval.ts:239`, `getRecentChunkVectors(..., 400)`), on a `Float[]` column (`prisma/schema.prisma:272`), so older evidence is silently unretrievable and there is no sublinear scaling. (2) Global/sensemaking retrieval (GraphRAG/MedGraphRAG) is essentially absent — the graph arm only fires when a `topicKey` is supplied (`hybrid-retrieval.ts:283-287`); Leiden communities, community summaries, map-reduce, gleaning, UMLS, proposition chunking, and 5-level edges do not exist. (3) Reference ranges are one-size UK-adult population bands (`src/lib/intake/biomarkers.ts:54-131`), never age/sex/assay-harmonized; the demographic fields `sexAtBirth`/`ageBand` exist but are wired to nothing (`src/lib/topics/types.ts:77-81`).

**The single cheapest high-impact win is real and confirmed:** personal-baseline anomaly detection (RHRAD/Snyder). The `median7`/`median30`/`std30` math is fully written and tested but is **dead code** — imported only by its own test (`src/lib/suggestions/baselines.ts:64-76`); the live suggestions engine fires on fixed clinical thresholds (`src/lib/suggestions/rules.ts:45,61,76`).

**Two big corrections to the brief.** (a) **B4 temporal edges are NOT "declared-not-built."** `TEMPORAL_SUCCEEDS` and `OUTCOME_CHANGED` now have **live production writers** on the ingest and action-outcome hot paths; only "confidence flat 1.0, never decayed" survives as a true gap. (b) The vector-arm **pgvector SQL does exist** (`docs/migrations/2026-05-28-enable-pgvector.sql`) with a production runbook — the brief's "no CREATE EXTENSION / .sql migrations anywhere" is wrong; the HNSW/`vector(1536)` step is deliberately deferred (commented out), not missing.

**Everything ML/forecasting is genuinely absent** (no torch/tf/onnx/sklearn/xgboost deps; no fitted estimators) — appropriately so at current data scale. One nuance: **TabLLM-style serialization already ships** (labs are rendered to prompt text at `src/lib/chat/user-context.ts:184-229`); only the learned-encoder half of B6 is absent.

---

## 2. Findings table

Gap types: **PARITY** (matches paper) · **FIDELITY-GAP** (present but diverges) · **MISSING-LOAD-BEARING** (should exist for today's product) · **DEFERRED-ROADMAP** (frontier, reasonably unbuilt) · **DEAD-CODE** (present, unreferenced by production).

| # | Method (paper) | Paper spec (checkable) | Code status (file:line) | Gap type | Consequence | Recommendation |
|---|---|---|---|---|---|---|
| A1 | RRF (Cormack 2009) | `Σ 1/(k+rank)`, rank-only, `k=60`, scale-invariant | `rrfFuse(lists,k=60)` `hybrid-retrieval.ts:87-104`; three arms fused `:291`; `rrfK` configurable `:68,207` | **PARITY** | — | **No action.** |
| A2 | Vector arm / ANN (HNSW; pgvector) | Graph-based ANN, tunable M/efConstruction/ef_search, `vector_cosine_ops` over full corpus | Bounded exact scan of 400 newest chunks `hybrid-retrieval.ts:239`; JS cosine `:114-131`, `sim>0.05` floor `:246`; column `Float[]` `schema.prisma:272`; extension SQL exists but ALTER/HNSW commented out `docs/migrations/2026-05-28-enable-pgvector.sql:10,13-14` | **FIDELITY-GAP** (staged) | Evidence older than a user's 400 newest chunks is unretrievable via vector; recall degrades as corpus grows; no sublinear scaling | Backfill → `ALTER … vector(1536)` → `CREATE INDEX … hnsw` → drop the recency cap → set `ef_search`. **M** |
| A3 | GraphRAG (Edge 2024) / MedGraphRAG (Wu 2024) | Entity graph, Leiden communities, community summaries, map-reduce w/ 0-100 scoring, gleaning; UMLS tier, proposition chunking, 5-level edges, tag-merge | Graph arm topic-gated only `hybrid-retrieval.ts:283-287`; whole-graph query → empty graph arm; none of Leiden/summaries/map-reduce/gleaning/UMLS/proposition/5-level/tag-merge exist (repo-wide grep: zero) | **FIDELITY-GAP** + **MISSING-LOAD-BEARING** | Global "what changed across my whole record" questions fall back to vector+lexical only; no hierarchical summarization | Decide explicitly: build a Leiden-communities + community-summaries slice for global queries, or mark out-of-scope. Convert silent degradation → deliberate choice. **L** |
| A4 | RAG grounding (Lewis 2020) | Retrieve-then-generate; grounded-answer rate; passage provenance | Provenance built (`get-node-provenance.ts:38-66`, `sources` chain, `ScribeAudit.citations` `schema.prisma:675`); grounding metric is **log-only** — `console.info` `hybrid-retrieval-grounding.ts:58`; call sites discard return value `search-graph-nodes.ts:73,96` | **FIDELITY-GAP** | An ungrounded answer ships identically to a grounded one; the gap is visible only in server logs | Promote grounding to an enforced threshold + add a small held-out eval set (e.g. MedHallu-style). **M** |
| A5 | Embeddings (Neelakantan 2022) | Contrastive text embeddings, cosine, pluggable provider | `text-embedding-3-small` @1536-d `types.ts:17-20`; `EmbeddingProvider` factory `provider.ts:299-310`; cosine `hybrid-retrieval.ts:114-131`; deterministic FNV mock `provider.ts:227-252` | **PARITY** | — | **No action.** |
| A6 | Clinical ranges (Travison 2017) | Age-decade + obesity-adjusted, assay-harmonized bands; total-T nonobese 19-39 = 264-916 ng/dL; morning fasted; CDC-calibrated | Flat UK-adult bands `biomarkers.ts:54-131` (testosterone `:107,131` has *no* range, unit `nmol/L`); MATRIX = 5 markers only `clinical-interpretation.ts:50`; no age/sex in `compare-to-reference-range.ts:25-63`; `sexAtBirth`/`ageBand` exist but unused `topics/types.ts:77-81` | **FIDELITY-GAP** | 25-yo and 70-yo judged against the same band; testosterone not anchored to harmonized decade bands; interpretation coverage thin | Add age/sex bands (All of Us / UK Biobank / harmonized lit), starting testosterone + SHBG per Travison; wire `ageBand`/`sexAtBirth`; make MATRIX data-driven. **M** |
| A7 | Change detection → RCV | Signed slope over N points; RCV / empirical-Bayes personalized intervals `[buildable-now]` | Two-point distance+direction classifier `classify-change.ts:33-48`; last-vs-previous `panel-diff.ts:81-116`; multi-point `trajectory.ts` has no slope/RCV math (charting reader, flag-gated `:34-36`); `trend.ts` computes endpoint-delta + monotonicity but is **unwired** (tests only); no RCV/CV anywhere | **FIDELITY-GAP** + **MISSING-LOAD-BEARING** | A change is reported only as toward/away-from-range with a raw arrow; users can't be told whether a move exceeds analytical+biological noise | Add a real least-squares signed slope + an RCV test using assay CV; wire `trend.ts` to a surface. Flag only when Δ > RCV. **M** |
| B1 | Personal baselines (RHRAD, Snyder 2021) | Per-user rolling ~30-day baseline; online σ-deviation alerts | `median7`/`median30`/`std30` computed `baselines.ts:64-76` but **dead code** (sole importer `baselines.test.ts:2`); live engine fires fixed thresholds `rules.ts:45,61,76`, 7-day lookback `engine.ts:16` | **DEAD-CODE** + **FIDELITY-GAP** | No personalization, no deviation alerting; users whose personal baseline shifts get nothing unless they cross a fixed clinical line | Wire `baselines.ts` into the engine; alert when `|today − median30| > k·std30`. **S–M** (needs 30-day fetch window). |
| B2 | Lab-MAE (masked autoencoder) | Transformer MAE over time-ordered panels, native missingness; beats MICE/GAIN | Absent (zero MAE/imputation/autoencoder deps or code). Substrate: dated `INSTANCE_OF` observations `lab-observations.ts:58-98`. No sequence exporter | **DEFERRED-ROADMAP** (substrate partial) | No imputation of sparse panels | Offline imputation experiment first; build a lab-panel sequence exporter. Do not ship a model on pass 1. **M–L** |
| B3 | Personalized ranges / future-biomarker (Google 2024) | Joint labs+wearables embedding → future values + per-user ranges (UK Biobank 257K) | Absent (no joint-embedding/prediction model). Ranges are static constants `biomarkers.ts:10,149` | **DEFERRED-ROADMAP** | No personalized ranges or forecasts | Bridge with statistical RCV / empirical-Bayes intervals (A7, no training); learned version later. **L** |
| B4 | Temporal edges & confidence-over-time | Populate temporal/outcome edges; decay confidence for stale, boost on retest | **[STALE-CLAIM CORRECTED]** `TEMPORAL_SUCCEEDS` live writer `intake/documents/route.ts:271` (+ backfill script); `OUTCOME_CHANGED` live writer `actions/[id]/outcome/route.ts:138`; `intervention_event` overlay producer `outcome-edges.ts:101`. **Confidence flat 1.0** `schema.prisma:316`, ratchets up-only `mutations.ts:211`; no decay; no readers except visual styling `visual-encoding.ts:244` | **FIDELITY-GAP** (mostly built) | Temporal substrate is populated but nothing *reads* it for inference/ranking; confidence never weakens with age | Add confidence decay for stale values + a boost on retest; add a reader that consumes `TEMPORAL_SUCCEEDS`. **S** (decay) / **M** (reader). |
| B5 | Next-event / trajectory models (DT-Transformer, Delphi-2M, MOTOR, ETHOS) | Decoder-only next-event over time-ordered events; EHR scaling laws | Absent & appropriate. Labs (`observation` nodes) and wearables (`HealthDataPoint` `schema.prisma:539-554`) are **separate stores**, joined only per-marker at read time `trajectory.ts:71-92`. No unified event token stream | **DEFERRED-ROADMAP** | No generative trajectory capability | Start accumulating a unified draws+wearables event token stream so the option stays open. Don't build the model yet. **L (substrate) / XL (model)** |
| B6 | Multimodal LLM ingestion (HeLM/PaLM-E/TabLLM) | Serialize tabular labs to text; learned modality encoders | **[STALE-CLAIM CORRECTED]** TabLLM-style serialization **already live** — biomarkers → prompt text `user-context.ts:184-192`, trajectory arrow-chain `:218-229`. Learned encoders absent | **PARTIAL** (serialization present; encoders **DEFERRED-ROADMAP**) | Tabular labs already reach the reasoning path as text; no learned image/tabular encoders | Nearest-term already done; PaLM-E-style encoders are later. **No urgent action.** |
| B7 | Agent-over-data (PHIA, Google 2024) | ReAct + code-gen over wearable time series; 84% numeric; 4,000+ benchmark Qs | 10 scribe tools incl. the 4 named `tool-catalog.ts:29-48`; bounded ReAct loop `scribe/execute.ts:20-24`; **no** sandboxed code execution (zero `eval`/`vm`/`new Function`/`isolated-vm`); `recognize_pattern_in_history` returns fixed aggregates `:254-278` | **DEFERRED-ROADMAP** (precursor exists) | No agent-authored numeric computation over time series | Add a sandboxed compute tool over `HealthDataPoint`; reuse PHIA's benchmark for eval. **M–L** |
| B8 | Diagnostic KG + clarifying questions (MedRAG) | Diagnostic KG; clarifying-question generator | Absent; every `diagnosis` hit is a guardrail *forbidding* diagnosis `clinical-interpretation.ts:62`, `llm/linter.ts:128-181` | **DEFERRED-ROADMAP** | No clarifying-question loop | Lower priority than baselines/ranges. **M** |
| B9 | Aging clocks (organ-aging proteome; DunedinPACE) | Proteomic/methylation clocks | Absent; ingestion modalities = free-text history + lab PDFs + fixed wearable registry `health/canonical.ts:28-45`; no omics path | **DEFERRED-ROADMAP** (data-gated) | No aging-clock wedge | Data-partnership-gated (needs proteomics/methylation ingestion). Value is in repeat draws (the slope). **L+** |

---

## 3. Prioritized backlog (impact × inverse effort)

### The ~3 cheapest high-impact wins (do these first)

The brief hypothesized **B1, B4, A6**. Verified verdict: **B1 and A6 confirmed**; **B4 is largely already built** (its edges now have live writers), so its residual is cheap but lower-value. The corrected top-3:

1. **B1 — Wire personal-baseline anomaly detection into the live engine. [effort S–M]**
   The `median7`/`median30`/`std30` math already exists and is tested (`baselines.ts:64-76`); it is pure dead code. This is the highest ROI item in the repo — a whole capability sitting one import away from production.
   *Correction to the brief:* precursors are **not** "none." The live engine fetches a 7-day lookback (`engine.ts:16`, `LOOKBACK_DAYS = 7`), so it cannot compute a 30-day baseline as-is; the fetch window must widen to ≥30 days first. Small, but real.

2. **A6 — Age/sex-specific reference ranges. [effort M]**
   Clinical-correctness gap with the demographic substrate already present but unwired (`sexAtBirth`/`ageBand` at `topics/types.ts:77-81`, zero consumers). Start with testosterone + SHBG per Travison (the paper's headline band, `264-916 ng/dL` for nonobese men 19-39, is entirely absent today — testosterone carries no range at all, `biomarkers.ts:107,131`).

3. **A7 — Signed slope + Reference Change Value. [effort M]**
   The descriptive trend reader (`trend.ts`) is built but unwired; the missing pieces are (a) a real least-squares slope (today's is endpoint-to-endpoint), (b) an RCV test using assay CV, and (c) wiring to a user surface. Converts "any movement" flags into "movement beyond analytical+biological noise."

**Runner-up cheap win — B4 residual (confidence decay). [effort S]** The temporal edges are done; adding time-based confidence decay + a retest boost is mostly-wiring, but its value is capped until a reader consumes the signal (today nothing reads `TEMPORAL_SUCCEEDS`/`OUTCOME_CHANGED` except graph styling). Pair the decay with a reader (M) to realize value.

**Also cheap and high-trust — A4 grounding gate. [effort M]** Promoting the already-computed grounding score from `console.info` to an enforced threshold + a small held-out eval set is a safety/trust win disproportionate to its cost.

### The big roadmap bets (fund deliberately, not opportunistically)

- **B5 — Generative next-event / trajectory foundation model. [effort L substrate / XL model]** Correctly unbuilt at current data scale. The actionable move now is substrate: unify the separate lab (`observation`) and wearable (`HealthDataPoint`) stores into one time-ordered event token stream so the option stays open. Build the model only once data volume justifies the training/eval harness.
- **B2 — Lab-MAE. [effort M–L]** Most-buildable frontier model; run an offline held-out imputation experiment first (substrate exists via dated `INSTANCE_OF` observations). Do not ship into product on pass 1.
- **B3 — Learned personalized ranges / future-biomarker prediction. [effort L]** Bridge with the A7 statistical RCV/empirical-Bayes intervals (no training) first; the learned UK-Biobank-scale version follows.
- **B7 — Agent-over-data (sandboxed compute over time series). [effort M–L]** Precursor (ReAct tool loop) exists; add a sandboxed compute tool and reuse PHIA's public benchmark for eval.
- **B9 — Aging clocks. [effort L+, data-partnership-gated]** Needs a proteomics/methylation ingestion modality that does not exist. High willingness-to-pay, but value is in the slope across repeat draws.
- **A3 — Global sensemaking (Leiden communities + summaries). [effort L]** Biggest retrieval-fidelity build; scope it as an explicit product decision rather than letting the empty-graph-arm degradation stay silent.

---

## 4. Per-recommendation detail (acceptance criteria + effort)

### B1 — Personal-baseline anomaly detection — **S–M**
- **Change:** Widen the suggestions data fetch to ≥30 days; call `computeBaselines` on the per-metric series; emit a suggestion when `|today − median30| > k·std30` (start `k=3`), for metrics with ≥30 days of coverage. Keep fixed-threshold rules as a parallel arm.
- **Acceptance:** A synthetic user whose resting HR sits within all fixed clinical thresholds but jumps `>3·std30` above their `median30` receives a deviation suggestion; a user with <30 days of data receives none (no false alarms on thin history). `baselines.ts` gains a non-test importer in the `engine.ts → rules.ts` chain.
- **Evidence base:** `baselines.ts:64-76` (math), `engine.ts:16,69` (wiring point + lookback), `rules.ts:45,61,76` (existing fixed thresholds).

### A6 — Age/sex reference ranges — **M**
- **Change:** Replace `BiomarkerEntry.referenceRange` (flat `{low,high}`) with demographic-keyed bands (by `sexAtBirth` × `ageBand`), sourced from All of Us / UK Biobank / harmonized literature; begin with testosterone (total + free) + SHBG per Travison. Thread `sexAtBirth`/`ageBand` from `userDisplayContext` into `compare_to_reference_range` and the ingest fallback. Make `clinical-interpretation.MATRIX` data-driven or broaden beyond its 5 markers.
- **Acceptance:** `compare_to_reference_range` returns different bands for the same marker+value across two demographics (e.g. male 19-39 vs 70+); testosterone resolves against the harmonized decade band with a hard `<264 ng/dL` low cut (unit-normalized); a test asserts ranges vary by sex and age band.
- **Evidence base:** `biomarkers.ts:43-131`, `clinical-interpretation.ts:50-99`, `compare-to-reference-range.ts:25-63`, `topics/types.ts:77-81`.

### A7 — Signed slope + RCV — **M**
- **Change:** Add a least-squares signed slope over the N-point series (replacing/augmenting `trend.ts`'s endpoint delta) and an RCV test `RCV = z · √2 · √(CV_A² + CV_I²)` using per-assay analytical CV; flag a marker only when `|Δ| > RCV`. Wire `trend.ts` (+ the new math) into a user-facing surface (it is currently tests-only).
- **Acceptance:** A marker moving within RCV is reported "stable / within noise"; a marker moving beyond RCV is flagged; a monotone 4-point uptrend yields a positive slope with the correct sign. No flag fires purely because `after ≠ before`.
- **Evidence base:** `classify-change.ts:33-48`, `panel-diff.ts:81-116`, `trajectory.ts`, `trend.ts:120-137` (endpoint delta + monotonicity), no RCV/CV in `src/`.

### A4 — Grounding gate + eval harness — **M**
- **Change:** Consume `computeHybridRetrievalGroundingScore` at the answer boundary; below a threshold, degrade gracefully (e.g. "insufficient grounded evidence") instead of answering. Add a small held-out benchmark (grounded-answer rate) run in CI.
- **Acceptance:** A query whose top-3 results lack real `chunkId`+`documentId` does not produce a confident answer; the benchmark reports a grounded-answer rate and fails CI below a floor.
- **Evidence base:** `hybrid-retrieval-grounding.ts:26-58`, `search-graph-nodes.ts:73,96` (log-only today).

### A2 — Native pgvector ANN — **M**
- **Change:** Run the extension SQL (already authored), backfill embeddings, `ALTER TABLE "VectorEmbedding" ALTER COLUMN vector TYPE vector(1536)`, `CREATE INDEX … USING hnsw (vector vector_cosine_ops)`, add a `native-pgvector` consumer in the vector arm (today `getVectorSearchStrategy() === 'native-pgvector'` only *disables* the arm — there is no native query path), set `ef_search`, and drop the 400-chunk recency cap.
- **Acceptance:** Full-corpus ANN retrieval; recall@k measured against the current exact scan on a fixed query set; a query matching an old-but-relevant chunk (beyond the 400 window) now returns it.
- **Evidence base:** `hybrid-retrieval.ts:222-272`, `compat.ts:46-55`, `schema.prisma:270-272`, `docs/migrations/2026-05-28-enable-pgvector.sql:13-14` (ALTER/index commented out).

### B4 — Confidence decay + a temporal-edge reader — **S / M**
- **Change (S):** Decay `GraphNode.confidence` as a function of staleness; boost on retest. (**M**) Add a reader that consumes `TEMPORAL_SUCCEEDS`/`OUTCOME_CHANGED` for ranking or inference (today only `visual-encoding.ts:244` reads them, for line styling).
- **Acceptance:** A node untouched for N months reports confidence < 1.0; a retest raises it; a retrieval/inference surface changes behavior based on a `TEMPORAL_SUCCEEDS` chain.
- **Evidence base:** `schema.prisma:316`, `mutations.ts:211-212,229`, `temporal-succeeds.ts:197`, `outcome-edges.ts:126`, `visual-encoding.ts:244`.

### A3 — Global sensemaking slice — **L** (scope decision first)
- **Change:** Either build Leiden community detection + pre-generated community summaries for whole-graph queries (populating the graph arm when no `topicKey` is present), or explicitly document global sensemaking as out-of-scope.
- **Acceptance:** A no-topic "what has changed across my whole record" query either returns a community-summary-backed answer, or returns a deliberate, documented "not supported" — not a silent vector+lexical fallback.
- **Evidence base:** `hybrid-retrieval.ts:283-287` (empty graph arm off-topic).

---

## 5. Cross-cutting checks (Section C)

### Feature flags / dark capabilities
Central registry `src/lib/env.ts`; every capability flag reads via strict `=== 'true'` and defaults `''` (OFF) **except** `SUPPLEMENT_HANDOFF_ENABLED` which defaults `'true'` (`env.ts:105`).

- **`HYBRID_RETRIEVAL_ENABLED` — effectively default-ON.** The real gate is `isHybridRetrievalEnabled()` (`compat.ts:67-85`): returns `true` whenever an embedding provider is configured (OpenAI key, or mock) and the flag is not explicitly falsey. In-repo signals all point ON in production: `.env.example:29` (`="true"`), `docs/runbooks/hybrid-retrieval-production.md:22`, `README.md:62`. **Caveat:** the literal Vercel production value is not committed and cannot be confirmed from the repo — but no in-repo signal suggests it is off. Read-sites: `hybrid-retrieval.ts:227`, `search-graph-nodes.ts:63`, `mutations.ts:425`, `intake/documents/route.ts:254`.
- **`LONGITUDINAL_GRAPH_ENABLED` — default OFF; gates READS only.** Writes (dated `INSTANCE_OF` observations) are unconditional (`env.ts:79-86`). Reads gated at `markers/changes/route.ts:19`, `markers/[name]/trajectory/route.ts:26`, `panels/diff/route.ts:22`, `record/route.ts:48`, `intake/documents/route.ts:287`, `decisions/page.tsx:97`. **Caveat:** no committed config enables it — only a manual-flip runbook (`docs/runbooks/longitudinal-graph-go-live.md`). From the repo alone, default-off with no evidence it is on in production.
- **Other flags (all default OFF unless noted):** `PGVECTOR_ENABLED` (`env.ts:54`, empty ⇒ available on Postgres), `ASK_DEEP_ENABLED` (`:62`), `CONCIERGE_BOOKING_ENABLED` (`:66`), `DECISIONS_ENABLED` (`:78`, gates the action-outcome lifecycle that writes `OUTCOME_CHANGED`), `RETEST_LOOP_ENABLED` (`:91`), `LIBRE_ENABLED` (`:25`), `SUPPLEMENT_HANDOFF_ENABLED` (`:105`, default ON kill-switch), and `PRIORITY_MARKERS_ENABLED` (read directly via `process.env`, not in the registry).

### Demo-only vs production (do not mistake demo for shipped)
- **`/demo/ask` canned sequences** — `src/lib/demo/ask-sequences.ts` (incl. studio-booking / supply-order cards): "deterministic client-side fiction: no LLM, no DB, no payment." Importers are demo pages only.
- **`/demo/record` time-scrubber** — `src/lib/graph/as-of.ts`. The *module* is reachable from the authed record view (shared `GraphCanvas`), but the scrubber *capability* is demo-only: on the authed path `asOf` is `null`, so visibility short-circuits to "present" (`as-of.ts:34,49`) — byte-for-byte static.
- **Marketing synthetic persona** — `src/lib/demo/persona-summary.ts` feeds both `/demo` and the marketing homepage's `RecordPreview` (`[market]/page.tsx:123`); it is synthetic series, not real user data.
- **Shared, NOT demo:** `classify-change.ts` is production code imported by both the demo and the authed `panel-diff.ts:20` — do not classify it as demo-only.

### Where HEAD has moved past the June-10 design doc
The June-10 brainstorm (`docs/brainstorms/2026-06-10-longitudinal-health-graph-design.md`) marked these PROPOSED; they are **built at HEAD**: dated `INSTANCE_OF` observations (`intake/lab-observations.ts`), the `panel-diff` reader (`markers/panel-diff.ts`), authed trajectory + panel-diff read routes, temporal & causal edges (`TEMPORAL_SUCCEEDS`/`OUTCOME_CHANGED`/`CAUSES`), clinical interpretation on the record, dated series in the chat digest, and a descriptive trend layer with false-causality enforcement (git log `#188`–`#191`). Reads are flag-gated (`LONGITUDINAL_GRAPH_ENABLED`); observation writes are unconditional.

### Referenced docs absent
Both files the brief cites — `docs/strategy/2026-06-30-aligned-research-deep-dive.md` and `docs/strategy/2026-07-01-paper-vs-code-gap-audit-brief.md` — are **not present anywhere in the repo**. The relevant longitudinal design/plan docs that *do* exist are `docs/brainstorms/2026-06-10-longitudinal-health-graph-design.md` and `docs/plans/2026-06-30-001-*.md`.

---

## 6. Stale observed-state claims — corrections log

| Brief claim | Reality at HEAD | Evidence |
|---|---|---|
| A2: "No HNSW / IVFFlat / CREATE EXTENSION / .sql migrations anywhere." | A pgvector `.sql` + README + production runbook **exist**; `CREATE EXTENSION` is live, the `ALTER`/HNSW step is deliberately commented-out/deferred. | `docs/migrations/2026-05-28-enable-pgvector.sql:10,13-14`; `docs/runbooks/hybrid-retrieval-production.md` |
| A2: "`getVectorSearchStrategy()` always returns 'js-cosine'." | Can return `'native-pgvector'` via env override — but there is **no native consumer**, so the override only *disables* the vector arm. Net effect matches, mechanism differs. | `compat.ts:46-55`, `hybrid-retrieval.ts:226` |
| (hybrid-retrieval header) "INTERNAL ONLY in PR4 … search_graph_nodes calls the old path until PR5." | Already wired: `search_graph_nodes` routes through `hybridRetrieveNodes`. The comment is stale. | `search-graph-nodes.ts:63-88` |
| A7: "N-point signed-slope is ABSENT." | `trend.ts` computes an N-point **endpoint-delta** + monotonicity confidence — not a regression slope, and unwired (tests only). Practical conclusion holds; the flat "absent" is imprecise. | `trend.ts:120-137`; sole importers are `trend.test.ts`, `trend-views.test.ts` |
| B4: "`TEMPORAL_SUCCEEDS` and `OUTCOME_CHANGED` are DECLARED-NOT-BUILT (types only, zero writers); event overlays have no producer." | **Both have live production writers**; `intervention_event` overlays have a producer. Only "confidence flat 1.0, never decayed" remains true. | `intake/documents/route.ts:271`; `actions/[id]/outcome/route.ts:138`; `outcome-edges.ts:101,126`; `temporal-succeeds.ts:197` |
| B6: "ABSENT." | TabLLM-style serialization of tabular labs into prompt text is **already live**; only learned encoders are absent. | `chat/user-context.ts:184-229` |
| B1: "Precursors: none." | The live engine's 7-day lookback (`engine.ts:16`) can't compute a 30-day baseline — the fetch window must widen first. Minor, but a real precursor. | `engine.ts:16`; `baselines.ts:64-76` |

---

*All line numbers reflect HEAD `1d140a3`. Retrieval fundamentals (A1, A5) and the temporal-edge writers (B4) were verified first-hand; the remaining items were verified by evidence sweep with the citations above. Where a production value could not be determined from the repo (Vercel env flags), that is stated rather than guessed.*
