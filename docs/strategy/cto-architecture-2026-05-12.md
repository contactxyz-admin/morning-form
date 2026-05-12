---
title: "MorningForm — CTO architecture brief"
date: 2026-05-12
status: active
type: strategy
---

# MorningForm — CTO architecture brief

**Product promise:** *Understand your body through connected context, then speak to clinicians with a complete, evidence-grounded picture.*

**Posture:** Not diagnosis. Context, explanation, preparation, collaboration.

This brief synthesises five reference repos (`wso2/fhir-mcp-server`, `iansinnott/obsidian-claude-code-mcp`, `C-Bjorn/MegaMem`, `isc-tdyar/medical-graphrag-assistant`, `martijn-on-fhir/fhir-mcp`) against the assets already shipped in this codebase. It is the upstream reference for individual implementation plans in `docs/plans/`.

---

## What's already true

This is not greenfield. Shape every plan around these assets:

- Postgres + Prisma; 30 models including `GraphNode` / `GraphEdge` / `SourceDocument` / `SourceChunk` / `TopicPage` / `SharedView` / `Scribe` / `ScribeTool` / `ScribeAudit`.
- Graph schema with 22 node types (FHIR-adjacent: `allergy`, `immunisation`, `encounter`, `referral`, `procedure`, `observation`, plus `symptom_episode` and `intervention_event` as temporal units) and 7 edge types including `OUTCOME_CHANGED`, `INSTANCE_OF`, `CONTRADICTS`, `SUPPORTS`.
- Scribe agent framework with 7 named tools (`search_graph_nodes`, `get_node_detail`, `get_node_provenance`, `compare_to_reference_range`, `recognize_pattern_in_history`, `route_to_gp_prep`, `refer_to_specialist`). Tool names are audit-trail-pinned via `ScribeAudit.toolCalls`.
- Anthropic LLM client at `src/lib/scribe/llm-anthropic.ts`. Audit trail in `ScribeAudit`.
- Health connectors: Apple Health (via Terra), Whoop, Oura, Fitbit, Garmin, Google Fit, Dexcom, Libre. Raw payload retention.
- Lab PDF intake pipeline with biomarker extraction and chunk-citation grounding.
- `SharedView` model with token hashing, scoped redactions, expiry, revocation, view-count — clinician-handoff primitive already half-built.

---

## 1. Architecture (five layers)

```
┌─────────────────────────────────────────────────────────────────┐
│ 5. Surfaces        Vault UI · Clinician brief · MCP server     │
│                    (Claude Desktop/Code/Codex talks to MF)     │
├─────────────────────────────────────────────────────────────────┤
│ 4. Reasoning       Scribe tool catalog (internal + MCP-exposed)│
│                    Specialists · Pattern recognition · GP-prep │
├─────────────────────────────────────────────────────────────────┤
│ 3. Retrieval       Hybrid: graph traversal + vector search +   │
│                    temporal episode index                       │
├─────────────────────────────────────────────────────────────────┤
│ 2. Knowledge       Health Graph: entities + relationships +    │
│                    versioned attributes + provenance chunks    │
├─────────────────────────────────────────────────────────────────┤
│ 1. Ingestion       Lab PDFs · GP/NHS letters · FHIR bundles ·  │
│                    Apple Health · Wearables · Chat capture     │
└─────────────────────────────────────────────────────────────────┘
```

**Opinionated invariants:**
- The graph is the asset. Every other layer either feeds it or queries it. Don't build features that bypass it.
- Every fact has a `SourceChunk` citation. If it can't be cited, it doesn't ship.
- Reasoning is *tool-mediated*. The LLM never directly accesses the graph — it calls named tools the scribe layer audits. Same discipline for internal UI and external MCP clients.
- The MCP server and the internal scribe are the same tool catalog, two transports. One source of truth.

## 2. Data model — additions to the existing 30

- `VectorEmbedding(sourceChunkId, model, dim, vector)` — per-chunk pgvector embeddings.
- `EntityVersion(entityId, validFrom, validTo, attributes JSON, sourceChunkId)` — temporal versioning on all entities (not just `symptom_episode`).
- `ClinicianBrief(id, userId, purpose, status, items[], generatedAt, expiresAt)` — versioned, citable artifact.
- `BriefShare(briefId, sharedViewId, kind: link | fhir_bundle | pdf_export)` — extends `SharedView`.

**Don't add:** a second FHIR-shaped Document table (FHIR is an export format), a separate Memory table (the graph + EntityVersion IS the memory).

## 3. Graph schema

Today's 22-type schema is right. Two refinements:

- Make `OUTCOME_CHANGED` auto-proposed by ingestion (LLM-extracted, user-confirmed). This populates the "what worked for me" graph that compounds into year-2 value.
- Per-edge `confidence` attribute (0–1). Surface in UI when below a threshold.
- `CONTRADICTS` becomes a first-class UX state — two readings that disagree show both, never silently pick a winner.

**Don't add:** SNOMED-CT / ICD-10 as a required ontology mapping (optional metadata, not a blocker); a parallel FHIR-resource-typed graph.

## 4. MCP / tool layer

**The single biggest architectural opportunity in this codebase.** We have 7 stable, audit-trail-pinned scribe tools. Re-expose them as an external MCP server and we instantly become a first-class context provider for Claude Desktop / Code / Codex.

```
                 ┌──────────────────────────┐
                 │  Scribe Tool Catalog     │
                 │  (single source of truth)│
                 └─────────────┬────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Internal scribe │  │  Web UI (/ask)   │  │  External MCP    │
│  (compile-time + │  │  via runChatTurn │  │  server (stdio + │
│  runtime exec)   │  │                  │  │  streamable HTTP)│
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

**Transport:** Streamable HTTP for Claude Desktop / remote; stdio for Claude Code local. Drop SSE.

**Auth:** OAuth 2.1 + PKCE, scope tokens via `SharedView`-style records. `read:topics`, `read:graph`, `read:brief`. No `write:*` in MVP.

**Tools exposed externally (MVP):** all 7 existing scribe tools, plus `get_topic_overview` and `get_clinician_brief` (new wrappers). Write tools deferred.

## 5. Clinician handoff

The surface that justifies the platform to a paying user.

1. **Trigger:** scheduled appointment OR symptom escalation.
2. **Brief generation:** scribe-driven, citing graph + recent activity.
3. **Three artifacts from one source:** Markdown (user reads pre-appointment), FHIR bundle (systems that ingest), single-page PDF (universal fallback).
4. **Scoped share link** via `SharedView`. Token-hashed URL, expiry, revoke, view-count, optional redactions (mental-health, sexual-health, genetic).
5. **Companion mode** during appointment: mark items discussed/deferred/disagreed inline. Generates `encounter` node with `OUTCOME_CHANGED` edges.
6. **Post-visit:** clinician's letter ingests as `gp_letter` / `specialist_letter`. Loop closes.

## 6. User-facing exploration UX

The vault metaphor is right but the **unit is an entity, not a note.** Don't ape Obsidian's file tree; build entity-native navigation.

Three modes, one surface (the `/record` route, absorbing `/graph`):

- **Index-first (default):** topics + recent + entity browser. Lowest-cognitive entry; sparse records still feel substantial.
- **Map mode (toggle):** force-directed graph fills canvas. Existing `GraphCanvas` becomes a mode, not a tab.
- **Timeline mode (future):** horizontal time axis, every `EntityVersion` change plotted. Chronological story view. Needs `EntityVersion` to land first.

Ask is woven inline: every entity has an "Ask about this →" affordance. The `/ask` tab stays, but most asking happens in-context.

Bottom nav: 5 tabs → 4 (drop orphaned `/protocol`; absorb `/graph` into `/record`). Final shape: Home / Record / Ask / You.

## 7. Safety and compliance

Non-negotiable:

- **No diagnostic claims.** Anything resembling "you have X" doesn't ship.
- **No treatment directives.** No dosages, no "start/stop/increase" verbs.
- **No urgent-symptom triage.** Red-flag symptoms → 999/911 interstitial; platform exits the conversation.
- **Every assertion cites `SourceChunk`.** No claims without grounding.
- **Audit trail** on every tool call (internal + MCP).
- **Right-to-export + right-to-delete** as one-button GDPR primitives.
- **Path-A regulatory stance:** tech-first, clinician-network for editorial review, no FDA SaMD / UK MHRA / FTC HBNR territory.

## 8. The 8-week MVP

Calibrated to what's already shipped.

| Week | Step |
|------|------|
| 1–2 | pgvector + `VectorEmbedding` + `EntityVersion` + hybrid retrieval inside `search_graph_nodes` |
| 3–4 | Vault UX unification (`/record` absorbs `/graph`; index + map modes; entity detail; Ask weaving) |
| 5–6 | `ClinicianBrief` + Markdown/PDF/FHIR export + scoped share via `SharedView` |
| 7 | External MCP server (streamable HTTP + stdio + OAuth 2.1 + scope tokens) |
| 8 | Clinical review (UK GP + US PCP) + pen test + private beta |

**Out of MVP:** FHIR ingestion from GP/NHS systems, MCP write tools, multi-language, real-time wearable streaming.

## 9. Production-grade architecture (Year 1+)

- **Infra:** Vercel Functions on Fluid Compute; Neon Postgres (UK + US regions) via Vercel Marketplace; pgvector; Vercel Blob (encrypted-at-rest); Vercel Queues for ingestion; Anthropic AI Gateway for LLM calls (fallback, observability).
- **Data:** Per-tenant schema once we cross ~5k users (GDPR + residency).
- **Reasoning:** Tool catalog grows (`get_appointment_history`, `summarize_lab_panel`, `compare_to_population_norm`, `suggest_questions_for_appointment`); specialist scribes grow (dermatology, GI, mental-health, dermatology); background `OUTCOME_CHANGED` proposer.
- **MCP:** Read tools → write tools (consent-gated) → bidirectional clinician portal (NHS Spine, US EHR FHIR endpoints).
- **Moat:** Year-N users have year-N timelines no competitor can synthesize from scratch. The brief format becomes "the document a GP wishes every patient brought."

## 10. Parts of the reference repos worth copying

| Repo | What to copy | Why |
|---|---|---|
| `wso2/fhir-mcp-server` | Streamable-HTTP transport pattern + Docker Compose dev stack | Production-ready transport boilerplate |
| `wso2/fhir-mcp-server` | 7-tool naming convention | Familiar verbs = adoption |
| `iansinnott/obsidian-claude-code-mcp` | Dual-transport (stdio + HTTP) | Day-one Claude Code AND Claude Desktop |
| `C-Bjorn/MegaMem` | Episodic temporal model | Apply to ALL entity types via `EntityVersion` |
| `C-Bjorn/MegaMem` | Content-hash sync-skip pattern | Idempotent re-ingestion |
| `isc-tdyar/medical-graphrag-assistant` | RRF for hybrid retrieval | Right primitive for combining graph + vector |
| `isc-tdyar/medical-graphrag-assistant` | Per-edge confidence scoring | Trust signal in graph |
| `martijn-on-fhir/fhir-mcp` | FHIR R4 doc-provider as MCP resource | Clinician-side agents understand bundle shape |

## 11. Parts we should NOT copy

| Repo | What to skip | Why |
|---|---|---|
| `wso2/fhir-mcp-server` | SMART-on-FHIR OAuth | Overkill; scope tokens are right |
| `wso2/fhir-mcp-server` | FHIR resources as internal canonical | FHIR is export-only for us |
| `iansinnott/obsidian-claude-code-mcp` | "No-consent" file-write tools | Every write must consent |
| `iansinnott/obsidian-claude-code-mcp` | Legacy SSE transport | Deprecating; Streamable HTTP |
| `C-Bjorn/MegaMem` | Neo4j / FalkorDB backend | Postgres + pgvector + recursive CTEs is sufficient |
| `C-Bjorn/MegaMem` | 23-tool sprawl | 7 well-scoped tools, not 23 |
| `isc-tdyar/medical-graphrag-assistant` | Regex entity extraction | LLM-structured-output is strictly better |
| `isc-tdyar/medical-graphrag-assistant` | InterSystems IRIS | Vendor lock-in for no benefit |
| `isc-tdyar/medical-graphrag-assistant` | NV-CLIP medical images | Year-2 problem; defer GPU dep |
| All FHIR repos | Treating FHIR as ingestion-first | For 95% of users, FHIR ingestion is empty endpoint |

## 12. Biggest technical risks

1. Vector-recall failure modes confidently citing wrong passages. → Confidence threshold + "low-confidence" UI + adversarial fixtures.
2. Multi-source contradictions surfacing as confident answers. → `CONTRADICTS` first-class UX.
3. Clinician brief misinterpreted as diagnosis. → One-line disclaimer; framing is "user reports / lab shows" not "you have."
4. MCP write-tools enabling unwanted graph mutation. → No write tools in MVP; per-session consent token.
5. GDPR right-to-delete cascading correctly. → Schema-level cascades + quarterly orphan audit.
6. Wearable data flood. → Aggregate into `metric_window`; 30-day raw retention only.
7. LLM cost runaway as users compound their record. → Scribe specialists narrow context; prompt-cache aggressively; per-user monthly budget cap.
8. Editorial-QA gate fatigue. → CMS layer with clinician roles by Year 2.
9. MCP auth as security vulnerability. → Read-only MVP, short TTL, rate-limited, audit, bug-bounty before broad launch.
10. Vendor lock-in to Anthropic. → Abstract behind `src/lib/scribe/llm.ts` (already done); add Vercel AI Gateway path.

## 13. Highest-leverage engineering sequence

| # | Week | Step | Unlocks |
|---|------|------|---------|
| 1 | 1 | pgvector + `VectorEmbedding` + backfill | Hybrid retrieval, MCP-quality answers |
| 2 | 1 | RRF inside `search_graph_nodes` + `get_node_detail` | Better grounding, lower confabulation |
| 3 | 2 | `EntityVersion` model + ingestion path | Timeline view, contradiction surfacing |
| 4 | 2 | Per-edge `confidence` attribute | Trust signal |
| 5 | 3–4 | Vault UX unification (`/record` absorbs `/graph`) | Coherent product story |
| 6 | 5 | `ClinicianBrief` + Markdown/PDF generator | First end-to-end clinical artifact |
| 7 | 5 | FHIR R4 bundle export from brief | Clinician-system interop |
| 8 | 6 | `SharedView` upgrade + redaction picker + brief share | Clinician handoff complete |
| 9 | 7 | External MCP server (streamable HTTP + stdio + OAuth 2.1) | Claude ecosystem distribution |
| 10 | 7 | Submit to Anthropic MCP directory + Cursor + VS Code | Distribution flywheel |
| 11 | 8 | Clinical review + private beta | Real-user signal |
| 12 | 9+ | `OUTCOME_CHANGED` background proposer | "What actually worked for me" |
| 13 | 9+ | Specialist scribes: dermatology, GI, mental-health | Coverage broadens |
| 14 | 10+ | MCP write-tools (consent-gated) | Claude can capture observations |
| 15 | 12+ | Per-tenant schema + multi-region | GDPR-grade + scale |

## Closing call

The highest-leverage move in the next 90 days, ranked once: **expose the existing scribe tool catalog as an external MCP server, gated by `SharedView`-style scope tokens.** It's the cheapest engineering work that meaningfully differentiates the product — most health platforms can't be queried by an AI client at all, and we're 70% of the way there. Couple that with the clinician brief and we have a defensible position: the only health record an AI can read fluently, and the only AI-prepared briefing a clinician will read in 90 seconds.

Everything else compounds from those two surfaces.
