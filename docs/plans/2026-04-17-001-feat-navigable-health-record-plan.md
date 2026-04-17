---
title: "feat: Navigable Health Record — seam-inspired record surface + Karpathy framing + prototype sharing"
type: feat
status: active
created: 2026-04-17
origin: docs/brainstorms/2026-04-15-health-graph-pivot-requirements.md
sibling: docs/plans/2026-04-15-004-feat-health-graph-pivot-plan.md
---

## Problem

The active Health-Graph pivot (`docs/plans/2026-04-15-004-feat-health-graph-pivot-plan.md`) has landed its substrate: Prisma schema, LLM client, intake UI, auth (U0a/b), MVP topic + graph + share surfaces (U9/U13/U20 via PR #36), and the share redaction + HMAC hardening (PR #37/38/39). The intake aesthetic has been brought up to oem.care polish (PRs #29/#30/#41).

**What's still missing** is what the product *feels like once intake is done*. The record surface — the thing users actually live in — is a loose collection of pages (`/graph`, `/topics/[topicKey]`, `/share/[token]`) wired to the substrate but not yet composed into a navigable, share-ready artifact with a coherent framing. Two references define where we're going:

1. **Seam's record aesthetic** (github.com/kennethtegrado/seam): warm cream ground, stone hairlines, subtle grid-pattern backing, serif headings, and a signature motif of **deterministic mesh gradients** used as source/file thumbnails. Board metaphor (ReactFlow) with side-sheet previews. Topic-slug routing that makes each topic a first-class URL.
2. **Karpathy's LLM Wiki / perfect-context framing** (gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): three layers (raw sources / compiled wiki / schema), compounding artifact instead of one-shot RAG, `index.md` (catalog) + `log.md` (append-only operations log), lint passes for contradictions/staleness, explicit human-LLM division of labor (human curates + asks; LLM maintains consistency + cross-refs).

This plan ports those moves into our Next.js surface and adds a **persistent prototype URL** so we can share a live record publicly for demos — independent of the user-minted HMAC share tokens U20 already ships.

Scope-adjacent requirements from the origin document (`docs/brainstorms/2026-04-15-health-graph-pivot-requirements.md`):
- **R12** — three v1 topic pages (Iron shipped, Sleep/Energy pending in sibling plan's U10/U11)
- **R15** — graph view as secondary surface
- **R16** — inline provenance on every claim
- **R22/R23** — DPP framing: the record *is* the product; shareability is first-class

See origin: `docs/brainstorms/2026-04-15-health-graph-pivot-requirements.md`, sibling: `docs/plans/2026-04-15-004-feat-health-graph-pivot-plan.md`.

## Scope Boundaries

**In scope:**
- Record-surface visual system: grid-pattern bg, mesh-gradient source thumbnails, serif heading treatments consistent across `/record`, `/graph`, `/topics/[topicKey]`, `/share/[token]`
- New **`/record`** landing — the "navigable index" of the user's graph (Karpathy's `index.md` analog)
- **Source-document pages** at `/record/source/[id]` so every SUPPORTS edge terminates at a real URL
- **Timeline / log** affordance per topic + a global view — the `log.md` analog
- Cross-linking: every node reference in topic prose becomes an in-page anchor that opens `NodeDetailSheet`; every source citation is a link to the source page
- **Prototype-demo URL** `/r/[slug]` — public, SSR, served from a seed-compiled record (first slug: `demo-navigable-record`)
- Seed-record pipeline: TS seed script + idempotent migration that creates a hidden demo user + pre-compiled `TopicPage` rows for the three v1 topics
- **ShareDialog polish**: leverages existing U20 HMAC tokens; adds preview thumbnail using the same mesh-gradient primitive
- Bottom-nav update: record becomes a primary tab

**Out of scope:**
- Sibling plan's pending topic pages (U10 Sleep, U11 Energy, U12 GP prep) — this plan establishes the visual/IA system they will consume, it does not implement them
- Changes to intake (`/intake/*`) — already polished in PR #41
- New share-token primitives — `src/lib/share/{tokens,redact}.ts` is the contract; we only compose on top of it
- Graph canvas rewrite to ReactFlow — the current `GraphListView` is a mobile-first list + desktop canvas per U13; this plan refines it cosmetically but does not replace the engine
- Any backend/LLM pipeline changes (topic-compile, intake-extraction, lab-PDF extraction)
- Authentication, migration, or schema changes beyond the seed-user insert

## Requirements Trace

| Requirement / Brief element | Source | Units |
|------|--------|-------|
| Port seam aesthetic into Next.js app | User brief | R1, R2, R3, R11 |
| Wire Karpathy perfect-context framing into record surface | User brief | R1, R4, R5, R6 |
| Make shareable like a DPP | User brief + R22/R23 | R7, R8, R9 |
| Link to existing backend so we can share a live prototype | User brief | R7, R8 |
| Assessment gating (skip intake on second login) | User brief | Already delivered — U0b session + first-login migration (`docs/plans/2026-04-14-001-feat-login-skip-assessment-plan.md`, status: done) |
| Inline provenance on every claim | R16 | R3, R6 |
| Record-as-artifact framing (DPP) | R22 | R1, R7 |
| Per-user navigable record | R15, R16 | R1, R4, R6 |

Assessment-gating is already shipped. No unit needed in this plan. The "logging in second time skips intake" behavior lives in the merged U0a/U0b work — we verify no regression during implementation but do not re-implement.

## Decisions

**D1 — `/record` is the new primary surface.**
Karpathy's `index.md` is the catalog; our `/record` becomes that catalog. It lists every topic (stub + full), shows "what we know / what we need" status, surfaces most-recent graph activity, and links into every leaf page. This is the first surface a returning user sees after intake.

**D2 — Seam's mesh gradient becomes our *source* thumbnail primitive, not a full-page background.**
Seam uses hash-seeded radial gradients per file. We apply the same mechanic to `SourceDocument` rows — every lab PDF, intake answer, GP export, wearable metric bucket gets a deterministic mesh from its ID. Renders on source cards (topic + record pages) and on the ShareDialog preview. Does **not** render full-bleed (that would fight our paper aesthetic). Tailwind 3.4 supports this without new deps.

**D3 — Grid-pattern background is scoped to the record surface.**
Seam puts a 40×40 SVG cross at 0.4 opacity on stone behind their board. We use an equivalent treatment (warm stone dots or crosses at ≤0.06 opacity on `--bg-deep`) on `/record`, `/graph`, and `/record/source/[id]` only. Intake and settings stay clean paper per PR #41.

**D4 — Demo URL lives under `/r/[slug]`, not `/share/[token]`.**
`/share/[token]` is user-minted, ephemeral, and HMAC-gated. `/r/[slug]` is persistent, curated, and publicly distributable. Different audiences, different retention. First slug: `demo-navigable-record`. Route is SSR, `noindex`, same redaction discipline as share (never recompiles, serves pre-compiled rows only).

**D5 — Seed-record is the existing `demo@morningform.com` user, extended.**
`prisma/seed.ts` already upserts `demo@morningform.com` with AssessmentResponse + StateProfile + Protocol. Extend that same seed with graph + source + compiled-topic rows — do **not** introduce a parallel demo account. U0a already treats this email as a dev-bypass identity (returns raw token in JSON in non-prod). Topic pages are pre-compiled by invoking the real `compileTopic` pipeline at seed time. Why: the demo uses the real render path (same redaction, same `TopicCompiledOutput` schema), so what demo viewers see is exactly what a real user would see. One demo user, one seed script, one convention.

**D6 — Log/timeline is a topic-scoped footer, not a separate surface.**
Karpathy's `log.md` is append-only. We surface it at the **bottom of every topic page** as "Last compiled · 2 days ago · 4 sources → 3 biomarkers → Iron status" with a `<details>` expansion showing the full ingest trail. Global activity feed on `/record`. No dedicated `/log` URL — that would add nav weight without user value.

**D7 — Record becomes a bottom-nav tab, displacing "check-in".**
Active plan's U15 reframes check-ins as graph input nodes. "Check-in" as a destination becomes conceptually subordinate to the record itself. Rename/replace "check-in" with "record" in the bottom nav. Existing `/check-in` URLs redirect to `/record`.

**D8 — This plan does not deepen the sibling plan.**
Sibling's U8–U13 continue as scoped. This plan delivers orthogonal scope: visual system + new surfaces + demo infra. Sibling plan's pending topic pages (U10/U11) inherit these primitives when they ship. No merge conflict by construction — this plan's units touch different files except for `tailwind.config.ts` and shared primitives in `src/components/ui/`, where additions are additive.

## External Reference Characterization

**Seam aesthetic (extracted from app/src/app/globals.css + components):**

Tokens (in seam's `:root`):
- Ground: `--nso-cream: #F5F0EB` (ours: `--bg: #FAF6EE` — ~1% lighter, structurally identical)
- Hairlines: `--nso-stone: #C8C4BD` (ours: `--border: #EAE4D7` / `--border-mid: #D8D0BE` / `--border-strong: #D0C8B6` — ours is a graduated two-step + stronger)
- Accent stone: `#EDEDEB`; clay `#D5BDAE`; sage `#A4B38B`; brush `#FFE5EB` (ours: single moss accent `#1F3A2E`)
- Serif: a variable serif + STIX Two Math (ours: Fraunces)
- Sans: Geist Sans (ours: Inter Tight)
- Mono: Geist Mono + DM Mono (ours: JetBrains Mono)
- Radius base: `0.5rem` (ours: `0.625rem` for card, `0.5rem` for input — close)

Distinctive moves:
- `bg-grid-pattern` utility — 40×40 SVG cross, stone at 0.4 opacity
- `MeshGradient` component — deterministic hash of filename seeds three HSL hues, composed as three `radial-gradient` layers + a diagonal linear fallback
- Serif headings via `.h-1` through `.h-4` helpers (`font-serif`, `tracking-tight`, `text-4xl`/`text-3xl`/`text-2xl`/`text-xl`)
- `BoardView` on ReactFlow with custom `FileNode` + `FilePreviewSheet` side sheet
- Topic-slug routing: `/t/[username]/[topicSlug]`, `/u/[username]/[topicSlug]` — shareable-by-default URLs
- Rich lateral nav: `/browse`, `/explore`, `/library`, `/journal`, `/reflect`, `/practice`, `/my-path`, `/tour`

Our alignment: tokens and type already structurally match. The delta is three specific motifs (grid, mesh gradient, serif heading helpers) and an IA pattern (topic-slug routing + navigable index). We do **not** need to port `--nso-*` variables — our existing warm-paper tokens are the same family with richer hairline differentiation.

**Karpathy perfect-context / LLM Wiki (extracted from gist):**

- "The wiki keeps getting richer with every source you add and every question you ask." — the compounding artifact
- Three layers: raw sources (immutable) / wiki (LLM-maintained markdown graph) / schema (config)
- Ingest: LLM reads source → writes summary → updates `index.md` → touches 10–15 entity pages → logs the action
- Query: LLM searches wiki → synthesizes with citations → optionally files valuable outputs back
- Maintenance: periodic lint for contradictions, staleness, orphans, missing cross-refs
- Division: human curates + asks; LLM maintains consistency + cross-refs
- Primitives: `index.md` (catalog) + `log.md` (chronological)

Mapping to our surface:
- Raw sources = `SourceDocument` + `SourceChunk` rows
- Wiki = `TopicPage` (compiled) + `GraphNode`/`GraphEdge`
- `index.md` = `/record` landing
- `log.md` = per-topic footer + `/record` global activity
- Lint = sibling plan's U19 (prompt guardrails + post-gen linter + graph health-check) — explicitly deferred to sibling, this plan only surfaces the output when U19 flags something stale

## Implementation Units

### R1 — `/record` landing: navigable index of the graph

**Goal:** A new page at `/record` that is the catalog of the user's health graph. Replaces the current `/graph` as the primary record destination; `/graph` becomes the canvas-focused sibling.

**Files:**
- New: `src/app/(app)/record/page.tsx`
- New: `src/app/(app)/record/layout.tsx` (optional, if shared chrome needed)
- New: `src/components/record/record-index.tsx` (catalog component)
- New: `src/components/record/what-we-know-card.tsx` ("what we know / what we need" summary)
- Edit: `src/app/(app)/layout.tsx` — update `pathToTab` mapping
- Edit: `src/components/ui/bottom-nav.tsx` — swap "check-in" label/icon for "record"
- New: `src/app/check-in/page.tsx` redirect → `/record` (or keep content, but hide from nav)

**Approach:**
- Server component; fetches aggregate from a new `GET /api/record/index` route (see dependency on R4)
- Three regions:
  1. Hero with serif headline + brief "last updated" tagline
  2. Topic grid — stub + full cards (uses existing `Card` primitive with `accentColor`)
  3. Recent activity list (last 10 ingest events from the log — see R5)
- Full-page grid-pattern background (D3) using new utility from R2
- Mobile: single column, desktop: 2-col grid for topic cards

**Patterns to follow:**
- `src/app/(app)/topics/[topicKey]/page.tsx` for data-fetch + loading-state pattern
- `src/components/topic/three-tier-section.tsx` for section-label + card composition
- `src/components/ui/section-label.tsx` for consistent eyebrow labels

**Verification:**
- Visiting `/record` after intake shows all three v1 topics as cards, with current ones in "stub" state until promoted
- Clicking a topic card navigates to `/topics/[topicKey]`
- "What we need" bullets match the current `TopicPage.missingEvidence` fields
- Bottom nav highlights "record" tab when on `/record`

### R2 — Grid-pattern background utility + mesh-gradient primitive

**Goal:** Two reusable visual primitives consumable by R1, R3, R7, R9, R11.

**Files:**
- Edit: `tailwind.config.ts` — add `backgroundImage` token for grid pattern
- New: `src/components/ui/mesh-gradient.tsx` — deterministic 3-stop radial gradient from a string seed
- Edit: `src/app/globals.css` — add `.bg-record-grid` utility (SVG data URL, ~0.06 opacity)

**Approach:**
- Grid: inline a 40×40 SVG with a two-pixel cross at `--border-strong` with 0.05–0.07 alpha, anchored as CSS background-image via Tailwind `backgroundImage` config (not a utility class that scopes to one surface)
- Mesh gradient: port seam's `hashString` + `generateMeshGradient` verbatim, retuned for our palette — constrain hue to our accent family (sage/clay/caution), saturation ≤50%, lightness 75–85% (much softer than seam's 65% — we want warm paper, not vivid thumbnails)
- No runtime perf concern — gradients are CSS, one `style={{ background: ... }}` per node

**Patterns to follow:**
- Seam: `app/src/components/features/board/MeshGradient.tsx` (reference only — do not copy file paths)
- Our tokens: `tailwind.config.ts` `colors.accent`, `positive`, `caution` for palette constraints

**Verification:**
- Storybook or a dev-only `/internal/design-tokens` page renders 20 deterministic mesh cards and 4 grid-pattern swatches
- Unit test: `generateMeshGradient('x', 'pdf')` is pure and deterministic
- Visual check: mesh gradient reads as "paper-tinted atmosphere", not "vivid poster"

### R3 — Source-document cards with mesh-gradient thumbnails

**Goal:** Every source (lab PDF, intake answer, GP export, wearable bucket) renders consistently across topic pages, `/record`, source-detail page, and ShareDialog preview.

**Files:**
- New: `src/components/record/source-card.tsx`
- New: `src/app/(app)/record/source/[id]/page.tsx`
- Edit: `src/components/topic/three-tier-section.tsx` — swap inline source refs for `<SourceCard>`
- Edit: `src/app/(app)/topics/[topicKey]/page.tsx` — source list at bottom uses `<SourceCard>`

**Approach:**
- `SourceCard` is a horizontal row: 48×48 mesh-gradient thumbnail (seed: `source.id`) + filename/type + "2 biomarkers extracted · 3 days ago"
- Clickable: navigates to `/record/source/[id]`
- Source-detail page: hero gradient, document metadata, chunk list, back-link to originating topic(s)
- Redaction-aware: if the source is hidden in a share context, card renders as "Hidden by sharer" placeholder (reuses `redactTopicOutput` logic)

**Patterns to follow:**
- `src/lib/share/redact.ts` for redaction pattern
- `src/components/ui/card.tsx` `action` variant with `clickable` prop

**Verification:**
- Integration test: topic page with 3 sources renders 3 `<SourceCard>` with unique gradients
- Click source on `/topics/iron` → lands on `/record/source/[id]` — source metadata matches DB row
- Shared view with hidden source → card shows "Hidden by sharer", no mesh gradient leak

### R4 — `GET /api/record/index` — aggregate endpoint

**Goal:** Single endpoint the `/record` page consumes; returns topic states + recent activity + graph summary.

**Files:**
- New: `src/app/api/record/index/route.ts`
- New: `src/lib/record/aggregate.ts` (pure function, unit-testable)
- New: `src/lib/record/types.ts`

**Approach:**
- Reads from existing Prisma models: `TopicPage`, `GraphNode`, `GraphEdge`, `SourceDocument`
- No new queries beyond selects + counts; aggregate in memory (all users' graphs are bounded)
- Returns `{ topics: TopicStatus[], recentActivity: LogEntry[], graphSummary: { nodeCount, sourceCount, topicCount } }`
- Uses `getSession` auth like existing `/api/graph` and `/api/topics/[topicKey]`
- Response cache: `no-store` (reads change frequently; small payload)

**Patterns to follow:**
- `src/app/api/graph/route.ts` for auth + error shape
- `src/app/api/topics/[topicKey]/route.ts` for compiled-row read

**Test scenarios:**
| Category | Scenario |
|----------|----------|
| Happy path | New user with intake → three topic stubs, 1 source, 5+ graph nodes |
| Happy path | Full user with Iron compiled → iron: full, sleep: stub, energy: stub |
| Edge | User with zero topics, zero sources → empty arrays, not null |
| Error | Unauth → 401 JSON |
| Integration | Seed-demo-user response shape matches `DemoRecordFixture` (see R8) |

**Verification:**
- `vitest run src/lib/record/aggregate.test.ts` passes 5 scenarios
- Manual: hit `/api/record/index` logged in as demo user, inspect JSON matches fixture

### R5 — Per-topic log footer + `/record` activity feed

**Goal:** Make the ingest timeline visible. Karpathy's `log.md` analog.

**Files:**
- New: `src/components/record/topic-log-footer.tsx`
- New: `src/components/record/activity-feed.tsx`
- New: `src/lib/record/log.ts` (derives log entries from existing rows)

**Approach:**
- No new schema: derive log entries from `SourceDocument.createdAt`, `TopicPage.updatedAt`, and `GraphNode.createdAt`
- `TopicLogFooter`: collapsed by default — "Last compiled · 2 days ago · 4 sources → 3 biomarkers". Expanded: chronological list of ingest events relevant to this topic
- `ActivityFeed` on `/record`: last 10 events across the whole graph
- Entry format: `{ ts, kind: 'source-added' | 'topic-compiled' | 'node-added', label, targetHref }`

**Patterns to follow:**
- `src/components/topic/three-tier-section.tsx` for section header style
- `src/lib/topics/compile.ts` for reading compiled topic metadata

**Test scenarios:**
| Category | Scenario |
|----------|----------|
| Happy | Topic with 2 sources + 1 compile → 3 log entries, reverse-chron |
| Edge | Brand-new stub topic → log shows "Compiled from intake" only |
| Edge | Source added after compile → log surfaces "New source — recompile pending" |
| Integration | Log entries cross-link to `/record/source/[id]` and `/topics/[topicKey]` |

**Verification:**
- Unit test: `deriveLogEntries(topic, sources, nodes)` is pure, returns reverse-chron list
- Visual: expanded footer on `/topics/iron` shows correct event sequence

### R6 — Cross-linking: node references + source citations become links

**Goal:** Every in-text node name in topic prose opens `NodeDetailSheet`; every source citation links to `/record/source/[id]`.

**Files:**
- Edit: `src/components/topic/three-tier-section.tsx` — replace plain text node refs with anchor buttons
- Edit: `src/components/graph/node-detail-sheet.tsx` — add "cross-references" section listing topics this node appears in
- Read-only reference: `src/lib/topics/types.ts` — `SectionSchema` already exposes `citations: { nodeId, chunkId, excerpt }[]` with `.min(1)`. No schema change needed.

**Approach:**
- Compiled topic output already carries per-section `citations[]` with `nodeId` + `excerpt` (shipped via U9/PR #36). Build `Map<nodeId, excerpt>` per section at render time.
- Render: for each `citations[].excerpt`, find its literal string in the section `bodyMarkdown` and wrap it in a `<button data-node-id>` that triggers `setCitedNode`. The excerpt match is anchored (≤500 chars, pre-quoted by the LLM) so false-positives are bounded.
- Source citations: `citations[].chunkId` resolves via `SourceChunk.sourceDocumentId` → `/record/source/[id]` link (small lookup in aggregate or inline).
- `NodeDetailSheet`: after the existing provenance section, add "Appears in: Iron, Energy" list — derived from a new `GET /api/graph/nodes/[id]/topics` or extended in the existing provenance route.

**Risk:** the excerpt-anchored match assumes the LLM's `excerpt` field is a verbatim substring of `bodyMarkdown`. That's the current Zod contract but not enforced structurally. Mitigation: fall back to a plain link under the section if the excerpt isn't found in body — never silently drop provenance.

**Patterns to follow:**
- `src/components/graph/node-detail-sheet.tsx` — existing sheet component and trigger pattern
- `src/lib/share/redact.ts` — never expose hidden node IDs; links check redaction first

**Test scenarios:**
| Category | Scenario |
|----------|----------|
| Happy | Iron topic body mentions "ferritin" → renders as button opening detail sheet |
| Edge | Display-name collision with common word (e.g., "iron" as prose) — only nodes in section `nodeIds[]` resolve |
| Error | Link to redacted node in share view → renders as plain text, no button |
| Integration | Click node link → sheet opens → "Appears in" shows all topics citing it |

**Verification:**
- Visual: topic page prose has underlined node references distinguishable from plain emphasis
- Redacted: `/share/[token]` view with hidden node — no clickable links to that node

### R7 — `/r/[slug]` persistent prototype URL

**Goal:** Public SSR demo URL, independent of user-minted share tokens.

**Files:**
- New: `src/app/r/[slug]/page.tsx`
- New: `src/app/r/[slug]/layout.tsx` (robots + meta)
- New: `src/lib/record/demo.ts` (resolves slug → demo user ID)
- Edit: `src/middleware.ts` — mirror the full `/share/*` public-SSR header block (`X-Robots-Tag: noindex, nofollow, noarchive`, `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, `Cache-Control: private, no-store`) for `/r/*`. Not auth-gated. See existing block at `src/middleware.ts:29-36`.

**Approach:**
- Slug lookup table lives in DB or config: `prisma/schema.prisma` adds optional `DemoSlug { slug, userId, enabled }` OR a hardcoded TS map for v1 (simpler, no schema migration). **Decision: TS map in `src/lib/record/demo.ts` for v1.** Promote to DB if we add a second slug.
- SSR: reads pre-compiled `TopicPage` rows for the demo user, renders topic grid + topic pages inline (no re-compile, same safety as share route)
- No auth, no cookies, no session
- Noindex + no-follow meta + middleware `X-Robots-Tag`

**Patterns to follow:**
- `src/app/share/[token]/page.tsx` for public-SSR discipline (`export const dynamic = 'force-dynamic'`, `runtime = 'nodejs'`, noindex metadata)
- `src/middleware.ts` — existing robots rule for `/share`

**Test scenarios:**
| Category | Scenario |
|----------|----------|
| Happy | `GET /r/demo-navigable-record` → renders full demo record SSR |
| Edge | Unknown slug → 404 |
| Edge | Disabled slug → 404 (not 500) |
| Error | Response headers include `X-Robots-Tag: noindex, nofollow` |
| Integration | Demo user's compiled topics match fixture from R8 |

**Verification:**
- `curl -I https://<preview>/r/demo-navigable-record` → 200, noindex headers
- `curl https://<preview>/r/demo-navigable-record` → HTML with "Iron", "Sleep", "Energy" visible
- Playwright: open `/r/demo-navigable-record` — all three topics clickable, renders without errors

### R8 — Seed-record pipeline: demo user + pre-compiled topics

**Goal:** A seed script that creates a hidden demo user and pre-compiles its topic pages using the real pipeline. Idempotent; run on every deploy.

**Files:**
- Edit: `prisma/seed.ts` — extend the existing `demo@morningform.com` seed (already creates User + AssessmentResponse + StateProfile + Protocol) with graph + source + compiled-topic fixture
- New: `prisma/fixtures/demo-navigable-record.ts` (typed fixture — sources, nodes, edges; intake answers piggy-back on the existing AssessmentResponse seed)
- No schema migration required — reuse `User.email = 'demo@morningform.com'` as the stable identifier. U0a already treats this address as the dev-bypass demo user (`NODE_ENV !== 'production'` returns raw token in JSON); sibling plan U0b introduces `getDemoUserForSeedOnly()` helper — use it here. If/when sibling plan U1 lands, `User.hasData` flips `true` during seed naturally.
- Edit: deployment docs / CI — `pnpm db:seed` already exists; document that it must run after migrations on every preview deploy

**Approach:**
- Upsert the existing demo user (`demo@morningform.com`) — do **not** introduce a second demo account
- Insert `SourceDocument` + `SourceChunk` rows from fixture (lab PDF, GP export, free-text history)
- Insert `GraphNode` + `GraphEdge` rows — enough evidence for Iron to promote to `status: full`, Sleep/Energy remain `stub` (visible state transition is a narrative beat)
- Invoke real `compileTopic(userId, topicKey)` for each v1 topic → writes `TopicPage` rows (same safety assumptions as production compile path)
- Idempotency: match existing seed pattern (`upsert` on unique keys, deterministic `contentHash` on sources)
- Demo user gating: `demo@morningform.com` is already gated from production email sends by U0a's bypass; nothing new to build
- R7 resolves `/r/demo-navigable-record` → `demo@morningform.com` user. Slug-to-user mapping lives in `src/lib/record/demo.ts` as a TS const, not DB

**Patterns to follow:**
- Existing `prisma/seed.ts` (lines 1-80) — follow its upsert + transaction style verbatim
- Sibling plan U0b: `getDemoUserForSeedOnly()` import contract (when it lands)
- `src/lib/topics/compile.ts` + `src/lib/topics/registry.ts` for compile invocation
- `src/lib/graph/mutations.ts#ingestExtraction` for the node/edge/source insert pattern used by `/api/intake/submit`

**Test scenarios:**
| Category | Scenario |
|----------|----------|
| Happy | Running `pnpm db:seed` on empty DB → demo user + 3 topics + expected node counts |
| Edge | Running `pnpm db:seed` twice → idempotent, no duplicate rows |
| Edge | Fixture change → re-run updates compiled `TopicPage` rows |
| Error | LLM call fails during compile → script fails cleanly, DB not partially populated (wrap in `prisma.$transaction` — Iron/Sleep/Energy either all compile or none) |
| Integration | After seed, `/r/demo-navigable-record` renders correctly with full Iron topic |

**Verification:**
- `pnpm db:seed` runs green locally
- Post-seed: `SELECT count(*) FROM "SourceDocument" WHERE "userId" = (SELECT id FROM "User" WHERE email = 'demo@morningform.com')` returns ≥3
- Post-seed: topic pages render on `/r/demo-navigable-record`
- CI: seed runs on every preview deploy (extend existing GH Actions workflow from PR #28)

**Risks:** LLM spend on every deploy if compile re-runs. Mitigation: hash the fixture bytes at seed-start; skip `compileTopic` if the hash matches the last recorded value. Store hash in a small `SeedState` table or — simplest — in a file committed to repo (`prisma/fixtures/.seed-hash.txt`) checked in at fixture edit time. Defer the state table to implementation if the file approach is too fragile.

### R9 — ShareDialog polish: thumbnail preview + consistent language

**Goal:** Align the existing U20 share flow with the new visual system. No infra changes.

**Files:**
- Edit: `src/components/share/share-dialog.tsx`
- Edit: `src/app/share/[token]/page.tsx` — serif heading + grid-pattern background consistent with owner's view

**Approach:**
- ShareDialog: when generating a link, render a mesh-gradient thumbnail preview using the topic's name as seed
- Copy refinement: "Generate a share link" → "Mint a share link" (matches token language); "expires in 7 days" → explicit date
- Share landing page (`/share/[token]`): use the same serif treatment + grid bg as owner's topic page so viewers see the intended aesthetic

**Patterns to follow:**
- Existing `share-dialog.tsx` structure
- `src/lib/share/tokens.ts` for scope/redaction context

**Verification:**
- Mint a share from `/topics/iron` → dialog shows topic-seeded mesh gradient thumbnail
- Open share URL incognito → serif + grid bg match owner's view
- No regression: `vitest run src/lib/share/` all pass

### R10 — Bottom-nav "record" tab

**Goal:** Record is discoverable as a primary destination.

**Files:**
- Edit: `src/components/ui/bottom-nav.tsx`
- Edit: `src/types.ts` (or wherever `NavTab` is defined) — add `'record'` variant
- Edit: `src/app/(app)/layout.tsx` — extend `pathToTab` with `/record → record`; remove `/check-in → check-in` mapping (or keep for fallback)
- Keep: `src/app/(app)/check-in/page.tsx` exists today — do **not** delete. Drop it from bottom nav only; the route stays reachable in v1 so we don't break deep links from notifications or external sources. Sibling plan's U15 reframes check-in as a graph-input surface; this plan does not pre-empt that decision.

**Approach:**
- Swap "check-in" tab for "record" tab. Icon: a small rectangular paper / book icon (match serif/editorial direction).
- `/check-in` destination still resolves (page.tsx untouched) — just disappears from primary nav. Consider a one-line banner on `/check-in` noting "Now part of your record" linking to `/record`, but defer final copy to R11 unify sweep.

**Verification:**
- Bottom nav on mobile/desktop shows: home | protocol | record | insights | you
- `/check-in` URLs still accessible (no hard 404) but redirect to `/record`
- Agent-native parity: new nav item is keyboard-reachable + has accessible label

### R11 — Unify topic + graph + record aesthetic

**Goal:** After R1–R10 land, do one sweep to ensure `/record`, `/graph`, `/topics/[topicKey]`, `/r/[slug]`, and `/share/[token]` share the same hero treatment, section rhythm, and grid background.

**Files:**
- Edit: `src/app/(app)/graph/page.tsx`
- Edit: `src/app/(app)/topics/[topicKey]/page.tsx`
- Edit: `src/app/share/[token]/page.tsx`
- Edit: `src/app/r/[slug]/page.tsx`

**Approach:**
- Every record-family surface uses: serif hero headline + eyebrow `SectionLabel` + grid-pattern background + hairline dividers
- `design-implementation-reviewer` agent pass after the sweep — compare screenshots of all five surfaces, flag drift
- No new primitives — only compose existing ones from R1/R2

**Verification:**
- Playwright snapshot of all five surfaces at mobile + desktop
- `design-implementation-reviewer` returns P0/P1 = 0, P2 = ≤3

## Dependencies & Sequencing

```
R2 (primitives) ─┬─> R3 (source cards) ──> R6 (cross-linking)
                 └─> R9 (share polish)
R4 (api) ────────┬─> R1 (record landing)
R5 (log) ────────┘
R1 ────────> R10 (nav)
R8 (seed) ───> R7 (/r/[slug]) ──┐
R1 + R3 + R5 + R7 + R9 ─────────┴──> R11 (unify sweep)
```

Safe shipping order (one PR per phase, rebase between):

1. **Phase R-A** (parallelizable): R2 primitives + R4 index API — foundations with no user-visible changes
2. **Phase R-B**: R1 record landing + R5 log + R10 nav — the new primary surface becomes real
3. **Phase R-C**: R3 source cards + R6 cross-linking — provenance becomes navigable
4. **Phase R-D**: R8 seed → R7 `/r/[slug]` — demo goes live
5. **Phase R-E**: R9 share polish + R11 unify sweep — final cohesion

Ship in PRs roughly matching phases. Merge individually; no PR should mix phases.

## Execution Posture

Default: pragmatic. No explicit test-first requirement.

**Exceptions (test-first):**
- R4 aggregate — unit-test `aggregate.ts` before writing endpoint
- R5 log — unit-test `deriveLogEntries` before wiring UI
- R8 seed — fixture + idempotency tests before committing compile side-effects

R7 `/r/[slug]` gets special care: it is a **public SSR surface** with no auth. Treat any diff here with the same discipline as `/share/[token]` — adversarial review mandatory, redaction assumptions explicit.

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| `/r/[slug]` leaks real user data if seed is misconfigured | Low | Slug → user mapping is a hardcoded TS map resolving only to `demo@morningform.com`; fixture is committed; no dynamic SELECT from the user table on that path; adversarial review required on R7 |
| Mesh gradients look garish on paper aesthetic | Medium | Palette-constrained in R2; dev-only swatch page; design review between R2 and R3 |
| Grid pattern fights intake cleanliness | Low | Scoped to record-family surfaces only per D3 |
| Demo-user bypass accidentally applies to real users | Low | `demo@morningform.com` is the only identity the bypass recognizes; U0a's dev-bypass check is email-equality + `NODE_ENV !== 'production'`, both required; no user-supplied input influences the gate |
| LLM spend on every deploy from R8 seed | Medium | Fixture-hash skip logic; compile only when fixture changes |
| Cross-linking (R6) false-positives in markdown | Medium | Exact-match on section `nodeIds[]` only — don't regex against arbitrary display names |
| Breaks share redaction invariants | Low | Existing redaction tests must pass unchanged; add cross-link redaction scenarios to `src/lib/share/redact.test.ts` |
| Competes with sibling plan's U10/U11 topic pages | Low | This plan delivers primitives U10/U11 will consume; no file overlap except `tailwind.config.ts` (additive) |

## Verification Strategy

**Automated:**
- Vitest: aggregate, log derivation, mesh-gradient determinism, redaction regression
- Playwright (manual for now): snapshot five record-family surfaces at mobile + desktop
- CI: existing GH Actions workflow from PR #28 covers build + tests; add `pnpm seed:demo` as a preview-deploy step

**Manual:**
- Walk through: intake → `/record` → topic → source → share → open share incognito
- Walk through as unauthenticated viewer: `/r/demo-navigable-record` — all three topics render, no auth prompts, no leak of real users
- `design-implementation-reviewer` agent pass on R11 completion, comparing against seam's grid + editorial treatment (screenshot refs from app/src/app/page.tsx and a topic page)

**Agent-native parity (always-on check):**
- New nav item exposed as keyboard navigable + ARIA-labeled
- Every new interactive surface (topic log expansion, cross-link, mesh-gradient source card) has an agent-accessible equivalent trigger
- `/r/[slug]` reachable via GET with no JS (pure SSR)

## Deferred to Implementation

- Exact grid-pattern SVG (opacity, cross vs dot, color) — decide during R2 via side-by-side dev swatch
- Mesh gradient palette constraints (hue ranges, exact saturation/lightness targets) — decide during R2
- Topic-log footer default: collapsed vs expanded — decide when R5 integration looks real
- Seed fixture content details (exact intake answers, lab values, GP-export prose) — author at R8 with product review
- Whether `/record` replaces `/graph` in BottomNav or they coexist — leaning replace (D7 reframe); re-confirm at R10
- `citations[].excerpt` verbatim-substring contract — confirm at R6 by spot-checking 10 compiled topic outputs from the demo user; if non-substring cases exist, fall back to per-section node link list rather than in-prose anchors
- `GET /api/graph/nodes/[id]/topics` new endpoint vs extending `/api/graph/nodes/[id]/provenance/route.ts` — decide at R6

## Non-Goals (Explicit)

- Deepening the sibling pivot plan — sibling's units stand untouched
- Replacing the graph canvas engine (still the current GraphListView per U13)
- New authentication, new intake, new share primitives, new topic-compile pipeline
- Mobile-native or iOS surface — web-first
- Multiple demo slugs — one slug (`demo-navigable-record`) for v1
- Non-English localization
- Dark mode — paper aesthetic is single-theme by design

## Success Criteria

1. A user landing after intake sees `/record` first, with a clear catalog of what they have and what's missing
2. Every claim in every topic links to a source page; every node reference opens detail sheet
3. `/r/demo-navigable-record` is a public URL that renders the full demo record SSR, passing security review
4. Share dialog mints tokens and landing pages that share the new aesthetic
5. No regression in existing share redaction, auth, or intake flows
6. Sibling plan's pending topic pages (U10/U11) can be implemented without blocking — this plan's primitives are ready for them
