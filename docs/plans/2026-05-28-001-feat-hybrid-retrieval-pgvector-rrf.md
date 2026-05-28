---
title: "feat: Hybrid Retrieval (pgvector + Graph Traversal + Reciprocal Rank Fusion) for the Health Graph"
type: design
status: proposed
date: 2026-05-28
origin: docs/strategy/cto-architecture-2026-05-12.md
---

# feat: Hybrid Retrieval (pgvector + Graph Traversal + Reciprocal Rank Fusion) for the Health Graph

**Lead Author:** Grok (as CTO-directed lead architect)
**Reviewers:** CTO, Staff+ engineers (scribe + graph + infra)
**Target:** Week 1–2 of CTO architecture brief §8 / §13 (highest-leverage technical initiative).

This is the single production-ready design document for replacing the current weakest layer (pure in-memory JS scans + substring) with a true hybrid retrieval system while preserving every non-negotiable of the existing scribe/MCP discipline.

## Overview

MorningForm's Health Graph is the asset. Today retrieval is the bottleneck that threatens MCP answer quality and future ClinicianBrief credibility as real users accumulate hundreds of nodes (biomarkers over time, symptom_episodes, intervention_events, metric_windows, lab chunks, letters).

Current retrieval (getSubgraphForTopic at src/lib/graph/queries.ts:91, search_graph_nodes at src/lib/scribe/tools/search-graph-nodes.ts:46, list_graph_index + getFullGraphForUser at src/lib/scribe/tools/list-graph-index.ts:46 and src/lib/graph/queries.ts:242) performs:

- Type-filtered full node scan + JS `.filter` substring on canonicalKey (case-insensitive).
- Iterative BFS edge expansion (depth 2–3) entirely in JS after fetch.
- Unconditional full-graph load (nodes + edges) + client-side importance scoring with 200-node cap for the index path.
- No semantic understanding, no vector signals, no provenance-aware ranking beyond SUPPORTS edges.

Demo graphs are tiny (~32–44 nodes). Real users will not stay there.

**This plan delivers** (per CTO brief §2, §10, §13):
- `VectorEmbedding` model (per-SourceChunk pgvector embeddings).
- Embedding pipeline integrated into existing lab/letter/intake chunk write path (`ingestExtraction`).
- Hybrid primitive combining (a) vector similarity on SourceChunk.text, (b) graph traversal from SUPPORTS edges, (c) lexical signals.
- Reciprocal Rank Fusion (RRF) as the fusion operator (reference: isc-tdyar/medical-graphrag-assistant).
- Backward-compatible upgrade of `search_graph_nodes` (and internal paths) so every existing scribe, MCP client, and UI continues to work unchanged.
- Idempotent backfill script + production rollout story that proves better grounding.

Every fact continues to retain `SourceChunk` citation. LLM never sees raw graph — only through audited tools. No diagnostic or treatment language is ever vectorised.

## Current State (Exact Citations)

**Primary retrieval entry points (all post-fetch in-memory):**

- `src/lib/graph/queries.ts:91` — `getSubgraphForTopic`:
  ```ts
  const candidates = await db.graphNode.findMany({ where: { userId, type: { in: spec.types } } });
  const seedRows = candidates.filter((n) => lowerPatterns.some(p => n.canonicalKey.toLowerCase().includes(p)));
  // then for (let hop = 0; hop < spec.depth; hop++) { await db.graphEdge.findMany(...) + another findMany for nodes }
  ```
  All filtering and visited-set logic in JS. SUPPORTS edges added in a second pass.

- `src/lib/graph/queries.ts:242` — `getFullGraphForUser`:
  ```ts
  const [nodeRows, edgeRows] = await Promise.all([
    db.graphNode.findMany({ where: { userId } }),
    db.graphEdge.findMany({ where: { userId } }),
  ]);
  ```
  Used by both `list_graph_index` (MCP) and `GET /api/record` (vault UI). 200-node cap applied in `aggregateRecord` (src/lib/record/aggregate.ts:20).

- `src/lib/scribe/tools/search-graph-nodes.ts:52`:
  ```ts
  const subgraph = await getSubgraphForTopic(...);
  const filtered = subgraph.nodes.filter(n => n.displayName.toLowerCase().includes(q) || n.canonicalKey...);
  ```
  Thin lexical wrapper. No semantic match for "low iron stores" vs. "ferritin 18".

- `src/lib/scribe/tools/list-graph-index.ts:46` and `/api/record/route.ts:35`: identical full-graph pattern + `computeImportance` (src/lib/graph/importance.ts) purely on degree + promoted + recency.

**Data model (prisma/schema.prisma:229–288):** `SourceChunk` has `text`, `offsetStart/End`, `pageNumber`, `metadata`. `GraphEdge` has `fromChunkId` (SUPPORTS provenance). No vectors, no embeddings.

**Ingestion (src/app/api/intake/documents/route.ts + src/lib/intake/pdf-extract.ts:124 + src/lib/graph/mutations.ts):** Excellent chunking already exists (layout-aware, page-aware, MIN_CHUNK_CHARS=5, tiny-fragment folding). Perfect substrate for embeddings.

**No prior vector work:** Confirmed via exhaustive search — zero uses of `vector`, `embedding`, `pgvector`, or RRF anywhere in src/ or docs/ except the strategy brief itself.

**Scale reality:** 18 core node types (exactly as defined at `src/lib/graph/types.ts:10-49`; the cto brief used an aspirational "22"; extensible), 7 edge types, ~30 models total. Real graphs will contain thousands of SourceChunks (multi-year labs + letters + wearable windows + check-ins).

## Strategic Mandate (from docs/strategy/cto-architecture-2026-05-12.md)

- "The graph is the asset. Every other layer either feeds it or queries it."
- Retrieval Layer 3: "Hybrid: graph traversal + vector search + temporal episode index".
- Explicit Week 1-2 item: "pgvector + `VectorEmbedding` + backfill + RRF inside `search_graph_nodes`".
- "Every fact must retain SourceChunk citation."
- "Tool-mediated reasoning: LLM never sees raw graph — only through audited tools."
- Reference: `isc-tdyar/medical-graphrag-assistant` for RRF (copy the primitive, reject the 23-tool sprawl and IRIS).
- Reject: Neo4j, new document tables, diagnostic vectors.

This design is the direct input to `/execute-plan`.

## Non-Negotiables

1. Preserve existing 10-tool catalog signatures, `ScribeAudit`/`MCPAuditEvent` discipline, and wire shapes for `search_graph_nodes`, `get_node_detail`, `list_graph_index`, `get_topic_overview`, etc.
2. All retrieval remains user-scoped at the query layer (no cross-user leakage even on malformed calls).
3. Topic scoping for `search_graph_nodes` etc. remains enforced (via registry patterns + `getSubgraphForTopic` seed or equivalent hybrid filter).
4. Work with current Neon Postgres + Prisma 5.22 (pgvector extension available; `prisma db push` pattern in prior plans).
5. Only embed raw `SourceChunk.text` from user-provided documents (lab_pdf, gp_letter, intake_text, wearable_window, etc.). Never embed compiled `TopicPage.rendered`, scribe outputs, node `attributes`, or any generated diagnostic/treatment language.
6. Output of retrieval tools must be stable or strictly backward-compatible for internal scribes + external MCP clients.
7. Support demo graphs, synthetic fixtures, and real user scale (hundreds of nodes/chunks).

## Proposed Design

### High-Level Data Flow

```mermaid
flowchart TD
    subgraph Ingestion
        PDF[Lab PDF / GP Letter / Wearable / Chat]
        --> Extract[extractPdfText + chunkLabReport<br/>src/lib/intake/pdf-extract.ts]
        --> Ingest[ingestExtraction + transaction<br/>src/lib/graph/mutations.ts]
    end

    Ingest --> WriteChunks[INSERT SourceDocument + SourceChunk rows]
    WriteChunks -->|post-commit| EmbedHook[embedAndStoreChunk<br/>new: src/lib/embeddings/pipeline.ts]
    EmbedHook --> Provider[(OpenAI / Voyage<br/>text-embedding-3-small)]
    Provider -->|1536-d float[]| StoreVec[INSERT VectorEmbedding<br/>sourceChunkId, model, vector]

    StoreVec --> Neon[(Neon Postgres<br/>pgvector extension)]

    subgraph Query
        Tool[search_graph_nodes / hybridSearchNodes] --> EmbedQ[embed(query) → qvec]
        EmbedQ --> VecSearch[pgvector cosine top-K chunks<br/>userId scoped]
        VecSearch --> GraphExpand[FOLLOW SUPPORTS edges → candidate nodes]
        GraphExpand --> TopicFilter[topicKey seed patterns OR full user]
        TopicFilter --> RRF[Reciprocal Rank Fusion<br/>vector + lexical + graph-traversal lists]
        RRF --> StableResult[same wire shape as today]
    end
```

### Embedding Pipeline (Chunking + Cost/Latency Controls)

**Chunking strategy (no new chunker):**
- Use existing `SourceChunk.text` directly (already excellent: layout-heuristic split on blank lines + ALL-CAPS headers, page-aware offsets, tiny-fragment folding, MIN_CHUNK_CHARS=5).
- Supported kinds (SourceDocumentKind): `lab_pdf`, `gp_letter`, `intake_text`, `gp_record`, `discharge_summary`, `referral_letter`, `specialist_letter`, `imaging_report`, `pathology_report`, `at_home_test_result`, `wearable_window`, `checkin`.
- Text size: typical 50–800 chars per chunk → ~15–200 tokens. Cheap to embed.
- Never create vectors for: `TopicPage.rendered`, `Scribe` outputs, synthesized `attributes`, `protocol` nodes, any LLM-generated narrative.

**Provider choice & rationale (Key Decision D3):**
- Default: `openai/text-embedding-3-small` (1536 dim, cheap, widely supported, good medical retrieval quality).
- Alternative (configurable): Voyage-3 or Voyage-3-lite for higher retrieval quality on technical text.
- Access: direct OpenAI SDK (new dep) or Vercel AI Gateway when available for unified observability/cost tracking (aligns with CTO brief §9).
- Env: `OPENAI_API_KEY` (or gateway key). Never fall back to Anthropic for embeddings.
- Batching: embed 50–100 chunks per call where possible.
- Latency budget: <800ms p95 per batch (ingest path); query-time single embed <150ms.
- Cost guardrails: per-user monthly embed budget soft cap (logged); explicit token counting + logging to existing metrics path.

**Embedding storage model:**
- One row per (chunk, model). Supports future model upgrades without deleting history.
- Idempotent: `ON CONFLICT (sourceChunkId) DO UPDATE SET vector=..., model=..., updatedAt=now()` when re-embedding.

**MVP query strategy for Float[] (addresses Float[] + pgvector operator gap):**
While `vector Float[]` is used for Prisma day-1 compatibility, the vector arm in `hybridRetrieveNodes` (PR 4) will **not** rely on native `<->` / cosine operators (those require the `vector` pgvector type post-ALTER). Instead:
- Fetch a bounded candidate set of the user's recent SourceChunks (or all for small graphs) via normal Prisma.
- Compute cosine similarity in JS (or a lightweight raw `unnest` + math CTE for Postgres) on the small set.
- This is fast and correct for the initial scale (hundreds of chunks) and matches the repo's pragmatic "db push + scripts/" bias.
- The sequence diagram and `hybrid-retrieval.ts` skeleton will document a `vectorSearchStrategy: 'js-cosine' | 'native-pgvector'` (default 'js-cosine' until native migration).
- Native `vector(1536)` + `<->` + HNSW is explicitly the follow-up optimization after backfill proves value (see Data Model Changes and PR 4).

### Hybrid Query Path + RRF Scoring

New module: `src/lib/graph/hybrid-retrieval.ts` (pure-ish, testable, Prisma-free where possible).

Core primitive (internal, not a new scribe tool yet):

```ts
export async function hybridRetrieveNodes(
  db: Db,
  userId: string,
  query: string,
  options: {
    topicKey?: string;
    limit?: number;
    vectorK?: number;      // e.g. 50
    lexicalK?: number;
    graphDepth?: number;
    rrfK?: number;         // 60 is literature standard
  }
): Promise<Array<{ node: GraphNodeRecord; score: number; sources: ProvenanceItem[] }>>
```

**Query path (detailed):**

```mermaid
sequenceDiagram
    participant Caller as search_graph_nodes / list_graph_index path
    participant H as hybridRetrieveNodes
    participant E as embeddings/embed
    participant V as pgvector (via $queryRaw or helper)
    participant G as getSubgraphForTopic (existing)
    participant R as rrfFuse

    Caller->>H: query, topicKey?, userId
    H->>E: embed(query)  // single short query, cached in-process for burst
    E-->>H: qvec (number[])

    par Vector arm (MVP: JS cosine on bounded candidates while using Float[]; native <-> only after ALTER in follow-up)
        H->>V: bounded candidate fetch (recent SourceChunks) + JS cosine (or raw unnest math) on Float[] vectors; userId scoped
        V-->>H: top vector chunks + sim
        H->>G: for each chunk, getProvenanceForNodes → nodes via SUPPORTS
    end

    par Lexical arm (cheap)
        H->>G: existing substring filter on displayName/canonicalKey (or ILIKE in future)
    end

    par Graph traversal arm (topic-scoped or whole)
        H->>G: getSubgraphForTopic (or lightweight seed) → nodes with hop-distance score
    end

    H->>R: three ranked lists (vectorNodes, lexicalNodes, graphNodes)
    R->>R: RRF: for each candidate, score += 1 / (rrfK + rank_in_list) across lists that contain it
    R-->>H: sorted unique nodes + fused scores + best-provenance
    H-->>Caller: top-N (stable public shape)
```

**RRF implementation (exact, from reference repo adapted):**

```ts
function rrfFuse(lists: RankedList[], k = 60): FusedList {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    });
  }
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({ id, score }));
}
```

**Topic scoping preserved:** When `topicKey` supplied (as in `search_graph_nodes`), the final result is intersected with (or seeded from) the topic's `relevantNodeTypes` + `canonicalKeyPatterns`. Whole-graph tools (`list_graph_index`) ignore topic and return importance-ranked view (hybrid can optionally boost the "recent" slice with semantic relevance in future PR).

**Fallback & confidence:**
- If no embeddings exist for user yet → fall back to pure current lexical + graph traversal (zero behavior change).
- Low vector recall (fewer than N hits above threshold) → log + surface "low-confidence" signal in audit (future).
- Always surface `citations` via existing `getProvenanceForNodes`.

**Query-time embedding latency & caching (for <420ms p95 target):**
- Single short query embed target: <150ms p95 (realistic for text-embedding-3-small on OpenAI/Vercel).
- Best-effort in-memory LRU per function instance (5-10min TTL, inspired by the lightweight Map-based pattern in `components/mention/node-cache.ts`) for hot paths within a single invocation window; distributed/shared cache (e.g. Upstash/Redis or Vercel KV) explicitly deferred. Log `embedding_cache_hit` metric.
- Burst protection: simple per-user token bucket in hybrid path (implement in PR5/6 hardening). The 420ms end-to-end target (including one embed + vector arm + 2-3 graph queries + RRF + cold-start cases) will be validated on the frozen synthetic graph in PR 6 before 100% rollout. Production canary explicitly gates on measured p95.
- Note: Vercel Functions are ephemeral; in-memory caching provides best-effort relief within invocation windows but does not survive cold starts or instance scaling.

### Backfill Strategy

One-time, idempotent, resumable script: `scripts/backfill-embeddings.ts`.

```mermaid
flowchart TD
    Start[Run script with --model text-embedding-3-small --batch 80] --> Query[SELECT sc.* FROM SourceChunk sc LEFT JOIN VectorEmbedding ve ON ... WHERE ve.id IS NULL AND sc.userId = ? ORDER BY createdAt LIMIT batch]
    Query --> Embed[batch embed via provider (retry 3x, 30s timeout)]
    Embed -->|cost tally + token count| Write[INSERT ... ON CONFLICT DO NOTHING]
    Write --> Progress[log "user X: 1240/3870 chunks (cost $0.0032)"]
    Progress -->|more? | Query
    Progress -->|done| Verify[spot-check cosine on 5 known pairs + grounding test]
```

- Run per-user or global (with --user flag for safety).
- **Preferred persistence:** lightweight Prisma `EmbeddingBackfillState` model (or reuse existing job pattern if present in other plans) with `lastProcessedChunkCreatedAt`, `userId`, `model`, `totalTokens`, `totalCostUsd`, `status`. Script writes an auditable batch row (style of MCPAuditEvent) on every batch. CLI state file is fallback only for one-off ops runs. Additive `EmbeddingBackfillState` model included in this PR's schema change (db push safe; no data impact). Exact `prisma generate && db push` step + runbook commands documented in `docs/runbooks/backfill-embeddings.md` (owned by this PR).
- Safe to run multiple times / concurrently (idempotent writes).
- Dry-run mode + cost estimate first.
- After backfill, a one-time `ANALYZE` + (later) `CREATE INDEX ON ... USING hnsw (vector vector_cosine_ops)` for production perf.

## Data Model Changes

**Exact Prisma addition** (add after `model SourceChunk` block, before `model GraphNode`):

```prisma
model VectorEmbedding {
  id            String      @id @default(cuid())
  sourceChunkId String      @unique(map: "VectorEmbedding_sourceChunkId_key")
  sourceChunk   SourceChunk @relation(fields: [sourceChunkId], references: [id], onDelete: Cascade, map: "VectorEmbedding_sourceChunkId_fkey")
  model         String      // "openai/text-embedding-3-small" | "voyage-3" etc.
  dimensions    Int
  // Float[] chosen for immediate Prisma compatibility + testability (MVP).
  // Native pgvector (vector(1536)) + HNSW + <-> cosine operators enabled via ALTER in follow-up after PR 6 backfill.
  // MVP query arm uses JS-side cosine (or raw unnest math) on bounded candidates while Float[] (see Hybrid Query Path).
  vector        Float[]
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  @@index([sourceChunkId])
  @@index([model, createdAt])
}
```

**Update `model SourceChunk`** (add one line in the relation section):

```prisma
model SourceChunk {
  ...
  embeddings    VectorEmbedding[]
  ...
}
```

**Migration approach (Neon + Prisma db push pattern):**

1. `pnpm prisma generate && pnpm prisma db push` (dev / staging — adds table + FKs).
2. Production: run the following SQL once (idempotent) via Neon SQL editor or `psql` against pooled URL:
   ```sql
   -- PR 1 migration SQL (docs/migrations/2026-05-28-enable-pgvector.sql)
   -- Ownership: explicitly created + documented in PR 1. Run once per Neon project (UK + US replicas) via SQL Editor or `psql` on pooled connection before or after `prisma db push`.
   CREATE EXTENSION IF NOT EXISTS vector;

   -- Optional later (after data volume justifies):
   -- ALTER TABLE "VectorEmbedding" ALTER COLUMN vector TYPE vector(1536) USING vector::vector;
   -- CREATE INDEX vector_embedding_hnsw ON "VectorEmbedding" USING hnsw (vector vector_cosine_ops);
   ```
3. For native vector type (future PR): add `vector Unsupported("vector(1536)")` with comment and a separate migration that does the ALTER + re-embeds a cohort.

**No breaking changes** to any existing table or index. `VectorEmbedding` is append-only from the perspective of ingestion.

## Before / After for Critical Tools & Paths

### `search_graph_nodes` (src/lib/scribe/tools/search-graph-nodes.ts)

**Before:**
- Calls `getSubgraphForTopic` (full type scan + JS filter + BFS).
- Then pure JS `.includes` on displayName/canonicalKey.
- Result: lexical only, no semantics, quadratic risk on large graphs.

**After (PR 5):**
- Calls `hybridRetrieveNodes(..., topicKey)` (or thin wrapper).
- Inside: vector arm (pgvector) + lexical arm (kept for exact match) + graph arm (existing seed + traversal).
- RRF fusion.
- Final filter + slice + map to exact same `SearchGraphNodesResultItem[]` shape.
- `truncated` and `topicKey` unchanged.
- When no embeddings: identical old code path (feature flag or auto-detect).

MCP and internal scribes see zero diff in JSON contract.

### `list_graph_index` + `/api/record` path

**Before:**
- Unconditional `getFullGraphForUser` (all nodes + edges) + `getLatestSupportCapturedAt` + `aggregateRecord` + `computeImportance` (degree + promoted + recency).
- 200-node cap applied post-importance.

**After (this design, conservative):**
- No change to the full load for the index itself (small-to-medium graphs; importance scoring remains authoritative for "what to show first in the vault").
- Hybrid retrieval is used **inside** any subsequent drill-down (`search_graph_nodes`, `recognize_pattern_in_history`, etc.) and for agent discovery flows.
- Future PR (post this plan): optional `semanticBoost` flag on `list_graph_index` that injects a vector-relevance component into the top-N selection for "recent activity" or a new "semantically relevant" section. Kept out of MVP to minimize blast radius on vault UI.
- `RecordIndex` wire shape and 200-cap behavior unchanged.

The "list_graph_index path" improvement is indirect but powerful: agents using MCP now get far higher-quality answers when they follow up `list_graph_index` with `search_graph_nodes` on a discovered topic.

### Internal `getSubgraphForTopic`

**Before/After:** Remains the gold-standard topic seed + BFS traversal primitive. Hybrid retrieval **calls into it** for the graph-traversal arm and for final scoping. No behavior change; becomes one high-signal input to RRF rather than the sole retrieval mechanism.

## Key Decisions (with Strong Rationale)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Embed **only** `SourceChunk.text` (raw user source material). Never nodes, never compiled pages, never scribe output. | Directly satisfies "every fact retains SourceChunk citation" + "no diagnostic claims in vectors". Provenance is structural via existing SUPPORTS edges. |
| D2 | RRF (k=60) as the sole fusion operator in v1. No learned reranker, no weighted sum. | Simple, proven in medical RAG references, no training data required, deterministic, easy to debug/adversary-test. Weighted sum requires tuning that we don't have signal for yet. |
| D3 | OpenAI `text-embedding-3-small` (1536d) as default provider. Voyage as pluggable alternative. | Lowest cost + latency for MVP. 3-small is retrieval-grade. Avoids introducing another Anthropic dependency for a capability they don't offer. Gateway path left open. |
| D4 | `Float[]` storage + raw query path initially; native `vector` + HNSW as follow-up optimization. | Gets us to production value in Week 1–2 without fighting Prisma type system on day 1. Native switch is a low-risk ALTER + re-embed of one cohort. |
| D5 | Synchronous fire-and-forget embed on ingest (with strong retry + logging) for MVP. No new queue. | Ingestion volume is low (users upload labs a few times/month). Matches existing "prisma db push" simplicity bias. Queue (Vercel Queues) deferred per CTO brief out-of-MVP. |
| D6 | No new public scribe tool in this plan. Hybrid is internal implementation detail behind `search_graph_nodes`. | Preserves the audited 10-tool surface exactly. New "semantic_search" tool can be added later behind the same catalog discipline. |
| D7 | Backfill is an explicit, auditable, cost-estimating script — not automatic on deploy. | Production safety: operators see exact token $ cost and row counts before mutating production data. Dry-run first. |
| D8 | Topic scoping still enforced via existing registry patterns + final filter (not "vector search everything then filter"). | Maintains the strong "LLM only ever sees topic-relevant subgraph" contract that prevents context poisoning. |

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Vector recall failure** (confidently citing wrong passage on near-duplicate or ambiguous lab text) | Medium | High (clinician trust) | RRF always mixes with lexical + graph traversal (never pure vector). Confidence threshold + "low semantic confidence" audit field. Adversarial fixture suite (PR 6) with "ferritin 18" vs "ferritin normal" variants. Fallback to pure old path while embeddings < N for user. |
| **Embedding cost runaway** (thousands of chunks, frequent re-embeds on model changes) | Low | Medium | Per-chunk token logging + monthly per-user cap (soft). Backfill script has explicit `--dry-run --estimate-cost` and per-user mode. Model column enables cheap "upgrade cohort" without full re-embed. |
| **Migration pain / extension not enabled on all Neon branches** | Medium | Medium | PR 1 produces exact copy-paste SQL + runbook. `scripts/ensure-pgvector.ts` healthcheck on startup in non-prod. Staging & prod share the same one-time SQL step. |
| **pgvector perf cliff at 10k+ chunks / user** | Low (Year 1) | High | HNSW index + `vector_cosine_ops` in follow-up PR after backfill. Current design uses K=50–80 ANN; for small graphs exact is fine. Monitor via new `embedding_search_latency_ms` metric. |
| **Tool output drift** breaking MCP clients or internal scribes | Very Low | Critical | Zero changes to public result interfaces in PR 5. All hybrid work happens behind the existing handler. Contract tests (existing + new snapshot) gate the PR. |
| **Backfill corrupts or duplicates data** | Low | Medium | Idempotent `ON CONFLICT DO NOTHING`. Transactional per-batch. Full audit log of every embedded chunkId + model + cost. Reversible (delete rows for a model). |
| **Adversarial / poisoned chunks** (user uploads garbage that looks like medical text) | Medium | Low | Embeddings are read-only signals; they never become "facts". Only SUPPORTS edges from trusted ingestion create nodes. Chunk text is still user data under GDPR. |

## Rollout & Testing Strategy (Proving Better Grounding)

**Phased (matches 7-PRs DAG below):**

1. **PR 1–3 (Foundation):** Schema + embeddings lib + ingest hook. All behind a `HYBRID_RETRIEVAL_ENABLED` env flag (default false). Ingest path exercises embedding without affecting any query.
2. **PR 4 (Primitives):** Unit + property tests on RRF, vector arm (mocked), graph arm. Synthetic fixture with 200+ chunks across 3 topics.
3. **PR 5 (search_graph_nodes integration):** Contract + snapshot tests unchanged. New integration test: "hybrid returns semantically relevant nodes that pure lexical misses".
4. **PR 6 (Backfill + Hardening):** Run backfill on demo user + 2 synthetic heavy users. Grounding-rate instrumentation (tie into existing 2026-04-21-001 metric): measure "fraction of tool-returned nodes that have a SourceChunk citation within top-3 provenance" before vs after on a fixed query suite.
5. **PR 7 (Production):** Enable flag on staging → 5% canary (users with >50 chunks) → 100%. Success criteria:
   - 0 regressions in existing scribe/MCP integration tests.
   - Grounding rate lift ≥ +18% relative on held-out query set (synthetic + real de-identified fixtures from clinical review).
   - p95 retrieval latency for `search_graph_nodes` < 420ms (including one embed).
   - Zero P0/P1 from /ce:review on vector path.
   - Cost: < $0.08 per active user per month at 1-year data density.

**Adversarial & grounding proof harness (new in PR 6):**
- `src/lib/graph/hybrid-retrieval.adversarial.test.ts` — 12 curated near-miss pairs + "should not retrieve contradictory biomarker" cases.
- Before/after harness that runs the same 40 queries against a frozen 180-node synthetic graph (seeded) and diffs result sets + citation density.
- Metric export: `hybrid_retrieval_grounding_score` (0–1) logged on every tool call when flag enabled.

**Observability added:**
- `embedding_tokens_total`, `embedding_latency_ms`, `hybrid_rrf_score_distribution`, `vector_search_recall_proxy` (fraction of top results also in lexical top-K).

## PR Plan (Execution DAG — 7 Independently Reviewable PRs)

This is a topologically sound, small-batch DAG suitable for direct `/execute-plan` consumption. Each PR is < ~450 net LOC, has clear reviewer scope, and can land independently (with subsequent PRs stacking cleanly). Numbering implies recommended order; explicit "Depends" listed.

**PR 1: Schema + pgvector enablement (foundation, zero behavior change)**
- **Title:** feat: Add VectorEmbedding model + pgvector extension SQL
- **Files affected:** `prisma/schema.prisma` (new model + SourceChunk relation), `docs/migrations/2026-05-28-enable-pgvector.sql` (new, with exact Neon SQL + ownership note), `src/lib/db.ts` (minor healthcheck comment), `src/lib/embeddings/compat.ts` (new: `isPgvectorAvailable()` + env-gated fallback helper), plan doc updates.
- **Dependencies:** None.
- **Description:** Introduces the table + docs/migrations/ dir (the initial retrieval-layer schema foundation). Documents the one-time `CREATE EXTENSION` step for all environments (explicitly assigned ownership to this PR). `prisma generate && db push` clean. No code paths touch it yet. Includes a tiny `ensurePgvector` helper stub + the `compat.ts` skeleton for dev/CI (see Issue 2 resolution). For full hybrid dev: `docker compose up postgres` (or Neon branch) + run the enable SQL once. sqlite default in `env.ts` is tolerated (Float[] table is accepted; hybrid paths force lexical+graph fallback via the compat check). Later additive schema models (e.g. tooling-only tables) are explicitly called out in their delivering PRs and remain safe `db push` operations with no data impact on prior changes.

**PR 2: Embeddings library (provider + pipeline, fully testable)**
- **Title:** feat: Embeddings provider abstraction + pipeline (OpenAI 3-small default)
- **Files affected:** `package.json` + lock (add `openai@^4.52`), `.env.example` (add `OPENAI_API_KEY` + `EMBEDDING_PROVIDER` comment), `src/lib/env.ts` (new optional `OPENAI_API_KEY` + `EMBEDDING_PROVIDER`), `src/lib/embeddings/types.ts`, `src/lib/embeddings/provider.ts` (interface + OpenAI impl + mock), `src/lib/embeddings/pipeline.ts` (embedAndStore, batch 50-100, 3x retry 30s timeout, cost tally, token counting), `src/lib/embeddings/compat.ts` (extends the file created in PR1 with query strategy enum support), `src/lib/embeddings/metrics.ts` (new `EmbeddingMetrics` reusing existing funnel/metrics patterns), `src/lib/embeddings/*.test.ts` (5–7 unit tests with mocks).
- **Dependencies:** PR 1.
- **Description:** No DB writes yet in hot path. Pure library + strong contracts. Supports pluggable providers. Explicit: `OPENAI_API_KEY` (or gateway equiv) follows exact pattern of `ANTHROPIC_API_KEY`. Vercel AI Gateway preferred when available for unified billing/observability. No PII in embed payloads (only raw SourceChunk.text). `EmbeddingMetrics` export for `embedding_tokens_total`, latency, cache hits. Cold-start impact on Vercel ingest/query paths noted and acceptable (low volume). Extends `compat.ts` (created in PR1) with query strategy enum support.

**PR 3: Ingestion integration (embed on chunk write)**
- **Title:** feat: Wire embeddings into ingestExtraction post-commit hook
- **Files affected:** `src/lib/graph/mutations.ts` (after successful chunk insert, fire `embedAndStoreChunk` non-blocking with `.catch(logError)`), `src/app/api/intake/documents/route.ts` (minor observability), new integration test in existing intake test file.
- **Dependencies:** PR 2.
- **Description:** Every new lab/letter/etc. now gets embedded. Feature-flagged (`HYBRID_RETRIEVAL_ENABLED`). Dry-run path for tests. No impact on existing users or MCP.

**PR 4: Hybrid retrieval primitives**
- **Title:** feat: Core hybridRetrieveNodes + RRF + vector + graph arms (internal)
- **Files affected:** `src/lib/graph/hybrid-retrieval.ts` (new, 250 LOC; includes `vectorSearchStrategy` + JS cosine impl + `isPgvectorAvailable` guard), `src/lib/graph/queries.ts` (small additions: vector search helper + provenance helpers remain), `src/lib/embeddings/compat.ts` (shared; created PR1), `src/lib/graph/hybrid-retrieval.test.ts` (property + fixture tests, RRF math, mock vector results, JS cosine cases).
- **Dependencies:** PR 1, PR 2 (for embed helper in tests).
- **Description:** The algorithmic heart. Fully unit-testable. No scribe tool changes. Includes cosine helpers and RRF reference implementation. Explicitly implements the MVP Float[] + JS-cosine (or bounded raw math) strategy until native pgvector type (see Hybrid Query Path section). Adds dev/CI fallback guard.

**PR 5: Upgrade search_graph_nodes (the visible win)**
- **Title:** feat: Replace lexical filter in search_graph_nodes with hybridRetrieveNodes (stable contract)
- **Files affected:** `src/lib/scribe/tools/search-graph-nodes.ts` (core change + fallback), `src/lib/scribe/execute.test.ts` + tool-specific tests (contract + new semantic cases), `src/lib/mcp/tool-adapter.ts` (no change — proof of stability), snapshot tests.
- **Dependencies:** PR 4.
- **Description:** Before/After behavior documented in commit. When no embeddings: identical. Output shape, truncation, topicKey, error modes 100% unchanged. This is the PR that actually improves MCP + internal scribe quality.

**PR 6: Backfill, hardening, instrumentation, adversarial suite**
- **Title:** feat: Backfill script + grounding proof harness + cost metrics
- **Files affected:** `scripts/backfill-embeddings.ts` (new, with --dry-run --user --estimate), new lightweight `EmbeddingBackfillState` model in `prisma/schema.prisma` (or reuse job pattern), `src/lib/graph/hybrid-retrieval.adversarial.test.ts` (new), updates to grounding metric code (tie-in to 2026-04-21-001), `docs/runbooks/backfill-embeddings.md` (new, short + exact command sequence), PR plan + strategy references.
- **Dependencies:** PR 3, PR 5.
- **Description:** The "prove it works" PR. Includes the exact before/after grounding harness that will be used in canary. Backfill is the production migration tool. Explicitly implements the preferred DB-row `EmbeddingBackfillState` persistence for resumability + full audit (see Backfill Strategy section). Additive `EmbeddingBackfillState` model included in this PR's schema change (db push safe; no data impact). Exact `prisma generate && db push` step + runbook commands documented in `docs/runbooks/backfill-embeddings.md` (owned by this PR).

**PR 7: Production enablement + light index-path notes**
- **Title:** chore: Enable hybrid by default + production runbook + list_graph_index future hook
- **Files affected:** Env defaults + Vercel config comments, `src/app/api/record/route.ts` (optional tiny semantic boost stub behind flag for future), final docs, `README.md` (retrieval section), any remaining contract tests.
- **Dependencies:** PR 6.
- **Description:** Flip the flag, update runbooks, add a one-line extension point in the index path for PR 8 (vector-boosted importance). Includes post-deploy verification checklist.

**Total:** 7 PRs. Critical path ~10–14 working days (parallelizable PR 2+3 after 1; PR 4 parallel with 3). Each lands with code review + relevant tests green. The design doc itself lives in the repo and is updated in PR 1/6/7.

## Output Structure (Summary of Changes Across the DAG)

```
prisma/
  schema.prisma                                   # MODIFY (PR 1)
docs/
  migrations/2026-05-28-enable-pgvector.sql       # NEW (PR 1 — explicit ownership; dir creation + README note here)
  plans/2026-05-28-001-feat-hybrid-retrieval-pgvector-rrf.md  # THIS FILE
  runbooks/backfill-embeddings.md                 # NEW (PR 6)
package.json                                      # MODIFY (PR 2)
scripts/
  backfill-embeddings.ts                          # NEW (PR 6)
src/
  lib/
    embeddings/                                   # NEW DIR (PR 2)
      provider.ts, pipeline.ts, types.ts, *.test.ts
    graph/
      queries.ts                                  # MODIFY (PR 4)
      hybrid-retrieval.ts                         # NEW (PR 4)
      hybrid-retrieval*.test.ts                   # NEW (PR 4,6)
      mutations.ts                                # MODIFY (PR 3)
    scribe/tools/
      search-graph-nodes.ts                       # MODIFY (PR 5)
      search-graph-nodes.test.ts                  # MODIFY (PR 5)
  app/api/intake/documents/route.ts               # MINOR (PR 3)
  app/api/record/route.ts                         # MINOR optional (PR 7)
```

## Linked Artifacts

- Upstream: [docs/strategy/cto-architecture-2026-05-12.md](../strategy/cto-architecture-2026-05-12.md) (esp. §2, §8, §10, §12, §13)
- Predecessor: [docs/plans/2026-05-12-001-feat-record-vault-unification-plan.md](../plans/2026-05-12-001-feat-record-vault-unification-plan.md) (explicitly calls this independent)
- MCP server plan: [docs/plans/2026-05-12-002-feat-external-mcp-server-plan.md](../plans/2026-05-12-002-feat-external-mcp-server-plan.md) (tool stability)
- Grounding metric: [docs/plans/2026-04-21-001-feat-grounding-rate-metric-plan.md](../plans/2026-04-21-001-feat-grounding-rate-metric-plan.md)
- Reference RRF: isc-tdyar/medical-graphrag-assistant (hybrid fusion pattern only)
- Existing retrieval: `src/lib/graph/queries.ts`, `src/lib/scribe/tools/search-graph-nodes.ts`, `src/lib/scribe/tool-catalog.ts`, `src/lib/mcp/tool-adapter.ts`
- Ingestion substrate: `src/lib/intake/pdf-extract.ts`, `src/lib/graph/mutations.ts`

---

**End of design.** Ready for CTO review and `/execute-plan` handoff. All non-negotiables addressed. Every citation is to real lines in the 2026-05-28 codebase. 7 PRs are small, reviewable, and topologically safe.

*This document (the canonical copy) lives at the path above. Temporary working copies may exist in /tmp for review tooling.*
