---
date: 2026-04-21
topic: chat-record-bridge
focus: Making chat citations, topics, and record nodes navigate into each other — closing the "no node-navigable UI" gap between /ask and the health record surfaces.
---

# Ideation: Chat ↔ Health Record Bridge

## Codebase Context

### Surfaces today

- `/ask` — free-text chat. Router classifies utterance → `topicKey` (or `null` = out-of-scope). Scribe runs bounded tool-use loop, streams over SSE, emits citations `{ nodeId, chunkId?, excerpt }`. Rejection-safe surface routes unsafe outputs to a GP-prep fallback.
- `/home` — entry cards that seed asks via `?seed=<prompt>` URL param.
- `/record` — health record home; activity feed (`LogEntry[]` with polymorphic `targetHref`), topic cards.
- `/record/source/[id]` — source detail (wearables, documents).
- `/topics/[topicKey]` — three-tier drill-down (understanding / action / clinician) plus GP-prep tier. Already uses `NodeDetailSheet` + `onCitationClick`.
- `/graph` — graph visualization (orphaned; no inbound routes from chat prose).
- `/insights`, `/protocol`, `/intake`, `/check-in`, `/you`, `/guide`, `/settings`.

### Connective tissue already in place

- `Citation` type at [src/lib/topics/types.ts](src/lib/topics/types.ts) — shared source of truth across chat and topic compile.
- `SpecialistChip` → `/topics/{topicKey}` link.
- `TopicCompiledOutput` (Zod) embeds citations inside tiered sections.
- `NodeDetailSheet` + `onCitationClick` callback pattern — portable primitive.
- `LogEntry.targetHref` already polymorphic (topic / source / node).
- `?seed=` URL pattern used today record → ask.
- `ChatMessage.metadata` persists `{ topicKey, classification, citations, requestId, auditId }`.
- `ScribeAudit` rows are durable per-turn records addressable by `requestId`/`auditId`.

### Bridge gaps (what does NOT link today)

1. Chat citations render as plain text `[1] nodeId · chunkId` — no click, popover, or navigation.
2. `SpecialistChip` → topic, but loses conversation context on jump.
3. `/topics/[topicKey]` has no "ask the specialist about this" CTA back to `/ask`.
4. `/record/source/[id]` doesn't show which conversations cited this source.
5. `/graph` is orphaned from chat prose and topic content.
6. `/record` activity feed excludes chat turns entirely.
7. `/insights`, `/protocol`, `/check-in`, `/intake` are disconnected from chat / record navigation.

### Leverage points

- `Citation.nodeId` IS the shared key across chat, topic, record, graph.
- `NodeDetailSheet` + `onCitationClick` portable beyond the topic page.
- `?seed=` pattern can be inverted: record → ask with structured context.
- Chat metadata already persists everything needed for reverse indexing (citations, topicKey, requestId, auditId).
- SSE `done` event already carries everything needed for interactive citation rendering.

### Past learnings

None in `docs/solutions/` — greenfield territory for bridge patterns. Capture new learnings via `ce:compound` once patterns stabilize.

## Ranked Ideas

### 1. Universal `<Mention>` primitive

**Description:** One React component that renders every node reference everywhere — chat citations, topic compiled output, log entries, insights, protocol steps, future GP-prep. Standard behaviors (hover-peek via `NodeDetailSheet`, click-to-open, long-press for deep-link menu, a11y) live in one place. Backed by a shared `useNode(nodeId)` registry that lazily hydrates node data. First caller: replace chat's dead-text `CitationList` with `<Mention/>` chips.

**Rationale:** Closes the #1 bridge gap (dead-text citations) directly and simultaneously unifies how every AI-authored claim surfaces a source. Chat, topic pages, insights, protocol, GP-prep all gain peek + provenance behavior for free. Highest value-to-complexity ratio in the set — ships fast and becomes the rendering substrate every other bridge (S2, S3, S5, S6) plugs into.

**Downsides:** Easy to over-scope into a "component library" project. Needs a disciplined v1 that only serves chat citations, then fans out.

**Confidence:** 85%
**Complexity:** Low–Medium
**Status:** Explored (handed to ce:work 2026-04-21)

### 2. `NodeTouchIndex` + `NodeConversations` (reverse index)

**Description:** Thin table (or derived view) `node_touches (node_id, surface, ref_id, kind, created_at)` populated by every chat turn citation, topic compile, intake answer, and insight that touches a node. Single read API `getTouchesForNode(nodeId, filters)`. `<NodeConversations nodeId/>` renders on `/record/source/[id]`, in `NodeDetailSheet`'s new "Conversations" tab, on `/topics/[topicKey]`, and eventually in GP-prep.

**Rationale:** Opens the backward direction (node → conversations) that "seam-like" node UI actually requires. Data is already persisted in `ChatMessage.metadata.citations` — this is mostly index + query, not new writes. Once it exists, node "heat" becomes a ranking signal across the app.

**Downsides:** Backfill needs care across many `ChatMessage` rows. Touch volume per node could grow fast; needs recency caps and filters.

**Confidence:** 80%
**Complexity:** Medium
**Status:** Unexplored

### 3. `RecordFeed` polymorphic event stream (incl. past-me replay)

**Description:** Promote `/record` activity feed from observations-only to a typed event stream: `observation | chat_turn | topic_compile | insight | check_in`. Every non-OOS chat turn emits a `chat_turn` event tagged with `auditId` + touched `nodeId`s. Tapping an old chat event opens a replay rail where the *current* scribe re-answers the *original* question against today's graph, showing a diff against the original `ScribeAudit` row.

**Rationale:** Makes the record complete (questions you asked are part of the record), and gives every turn a durable, revisitable address. Replay compounds: GP-prep, insights, and topic compile can all surface "what changed since you last asked this."

**Downsides:** Requires a real renderer registry per event type. Replay against a re-compiled graph needs the `graphRevisionHash` story to hold up.

**Confidence:** 72%
**Complexity:** Medium–High
**Status:** Unexplored

### 4. `AskAnchor` + `ContextCapsule` (universal "ask about this")

**Description:** Headless primitive `<AskAnchor seed context=…/>` renders as button / menu item / keyboard shortcut on every surface. `ContextCapsule { surface, primaryEntities, secondaryEntities, viewState, asOf }` is the typed payload — rich enough for the scribe to ground on, stable enough to serialize into a shareable URL. Chat turn metadata stamps the origin so the resulting turn knows where it came from. Pairs with idea 2 to light up "back to source" chips.

**Rationale:** Generalizes the one-way `?seed=` pattern into both directions from every entry point. Cmd-K "ask about what I'm looking at" becomes free. Scribe answer quality goes up because context is explicit instead of inferred.

**Downsides:** URL grammar and capsule shape need one serious design pass before proliferation. Easy to ship the primitive and forget to migrate the three old callers.

**Confidence:** 82%
**Complexity:** Medium
**Status:** Unexplored

### 5. Topic page with always-open specialist chat rail

**Description:** Right-rail `useChatStream` embedded in `/topics/[topicKey]`, pre-seeded with page context (topicKey, currently-viewed tier, recent citations). When the scribe judges a Q&A durable, the turn gets promoted into a new "Evergreen questions" section of the compiled output. Chat and topic-compile start to converge.

**Rationale:** Collapses the biggest strategic seam — chat and topic feel like two products today. Also the single most natural place to field follow-up questions since the context is already on screen.

**Downsides:** Biggest UX bet in the list. "Durable Q&A" classifier is a new call with its own failure modes. Needs a careful containment story so the topic page doesn't turn into a chat log.

**Confidence:** 65%
**Complexity:** Medium–High
**Status:** Unexplored

### 6. Graph as primitive, not a page (subgraph-per-answer)

**Description:** Extract `/graph` into `<NodeGraph nodes selection onSelect/>` that renders a subgraph with selection state. Every chat answer ships with a mini-graph of nodes it touched (derived from citations), expandable in place. Topic pages embed topic-subgraph views. `NodeDetailSheet` gains a neighborhood view. `/graph` standalone becomes optional.

**Rationale:** `/graph` is orphaned today — users don't know why it exists. Answer-shape-as-graph gives every answer visual provenance and resurrects the graph investment. Extracted primitive compounds across surfaces.

**Downsides:** Graph extraction is real work (layout, selection state, performance on medium subgraphs). Risk: becomes a toy rather than load-bearing.

**Confidence:** 60%
**Complexity:** High
**Status:** Unexplored

### 7. Evergreen questions + pre-compiled scribe cache

**Description:** At topic-compile time, scribes pre-answer the top-N likely questions per topic (seeded by past asks from idea 3 + canonical question templates). `/ask` checks the cache first; matching questions stream instantly from storage, marked "answered before asked," with full audit lineage intact. Runtime generation only as fallback.

**Rationale:** Changes chat economics (token spend + latency) and blurs chat / compile into one pipeline. Compounds with idea 5 (evergreen promotion) and idea 3 (past-me replay) — those become read-paths into the same cache.

**Downsides:** Cache invalidation on graph revision is the hard part. D11 audit story across cache-hit vs generated needs explicit design. Most ambitious item by far.

**Confidence:** 55%
**Complexity:** High
**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| R1 | Clickable / hover-reveal citations (F1.1, F1.6, F2.4) | Merged into idea 1 (Universal Mention) |
| R2 | Source page shows citing conversations (F1.3, F2.8, F3.7, F4.3) | Merged into idea 2 (NodeTouchIndex) |
| R3 | "Ask the specialist" CTA on topics (F1.2) | Absorbed by idea 5 (chat rail makes this trivial) |
| R4 | Evidence split-view on /ask (F1.4) | Absorbed by idea 1 (peek + pin) |
| R5 | Chat turns → LogEntries (F1.5, F2.1, F3.2) | Merged into idea 3 (RecordFeed) |
| R6 | Graph lights up live / kill /graph (F1.7, F2.7, F4.8) | Merged into idea 6 |
| R7 | Re-ask with today's data / past-me (F1.8, F3.9) | Merged into idea 3 as replay capability |
| R8 | Drag-to-pin working-set tray (F1.9) | Too speculative; no existing primitive to extend; high surface cost |
| R9 | Tiered chat answer / topic chat rail (F1.10, F3.8) | Merged into idea 5 |
| R10 | Node-scoped conversation thread (F2.2) | Merged into idea 2 |
| R11 | Kill /ask, chat is a drawer (F2.3) | Idea 4 delivers ambient chat without deleting the dedicated surface |
| R12 | Reverse seed / ?seed= universal / cx:// / ContextCapsule / AskAnchor (F2.5, F3.10, F4.4, F4.5, F4.9) | Merged into idea 4 |
| R13 | Annotations as shared substrate (F2.6) | Absorbed by idea 3's `chat_turn` event type |
| R14 | Citations self-generate follow-ups (F2.9) | Narrow affordance + per-turn LLM cost; revisit once idea 1 lands |
| R15 | System-authored intake/check-in chat turns (F2.10) | Scope creep — belongs in its own "conversational spine" ideation |
| R16 | Stateful citations (agree/disagree/superseded) (F3.1) | Feature in its own right; revisit once idea 1's rendering is live |
| R17 | Multi-specialist councils via chip-as-membership (F3.5) | Multi-scribe architecture is a separate strategic bet, not a bridge |
| R18 | Nodes accumulate citation history (F3.6) | Merged into idea 2 |
| R19 | `useNode(nodeId)` registry hook (F4.1) | Absorbed by idea 1 as its runtime backing |
| R20 | CitationProvenance object (F4.7) | Absorbed by idea 1's render surface |

## Session Log

- 2026-04-21: Initial ideation — 40 raw candidates generated across 4 frames (pain / inversion / assumption-breaking / leverage), 20 rejected with reasons, 7 survived. Idea 1 (Universal `<Mention>` primitive) chosen for handoff to `ce:work` on the strength of highest value-to-complexity ratio + direct closure of the user-flagged "no node-navigable UI" gap.
