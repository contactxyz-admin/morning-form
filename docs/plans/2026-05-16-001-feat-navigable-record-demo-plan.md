---
title: "feat: Consolidate public demo at /demo, retire /r/demo-navigable-record"
type: refactor
status: active
date: 2026-05-16
---

# feat: Consolidate public demo at /demo, retire /r/demo-navigable-record

## Problem

We have two public demo surfaces serving the same role and confusing both users and operators:

| Surface | Persona | Path shape | Status |
|---|---|---|---|
| `/demo/{overview,record,ask}` | 38yo metabolic syndrome (24mo arc, inflection at month 14) | Fixture-direct, force-static, multi-page nav | Polished, linked from marketing + sign-in + market landings |
| `/r/demo-navigable-record` | Iron + Sleep & recovery + Energy & fatigue ("demo user") | DB-backed via `prisma.user(demo@morningform.com)`, force-dynamic, single page | Currently shows topic prose only — no graph |

The user-reported issue ("the demo is supposed to be showing the health graph and click into the nodes etc") is **already satisfied by `/demo/record`**, which has been live and shipping a force-directed canvas + `<NodeDetailSheet>` with pre-hydrated provenance via `<DemoGraphSection>` since its build. `/r/demo-navigable-record` was the duplicate that lacked the graph — and the right answer is not to rebuild the graph on the duplicate, but to retire the duplicate.

CPTO call: **`/demo` is the canonical public demo surface.** Consolidate everything onto it. Delete `/r/demo-navigable-record`. Repoint inbound links. Polish `/demo/record` with the two small wins the previous (now-superseded) rewrite plan identified: `?entity=` deep-linking and source-document hub synthesis.

This plan **supersedes** an earlier rewrite-of-`/r/[slug]` plan written in the same file. Everything below is the consolidation plan; the rewrite path is abandoned.

## Why /demo wins (over /r/[slug])

| Property | `/demo/{overview,record,ask}` | `/r/demo-navigable-record` |
|---|---|---|
| Inbound traffic | Marketing top nav, market landings, sign-in page | Authed share-links page, authed empty-state, home record anchor |
| Audience | Prospects (cold) | Authed users sharing back to themselves; some external |
| Narrative | 24-month before/after arc with sparklines + clinical specialty groupings + condition cards + interventions + sources block + canned chat | Topic prose only (Understanding / What you can do / Discuss with clinician × 3 topics) |
| Mobile UX | Specialty-surface text blocks (no canvas) | Topic prose (no canvas) |
| Desktop graph | `<DemoGraphSection>` — clickable canvas, hydrated provenance, hover, ESC-to-close | None — only prose |
| Operational | Force-static, fixture-direct, no DB at runtime | Force-dynamic, ~6 Prisma queries per request |
| Cost | Near-zero per request after build | DB pool exposure per request |
| Linkability | `/demo/record` works | `/r/<slug>` works |

`/demo` is more polished, more clinically narrated, operationally cheaper, marketing-aligned, and already has the graph. The single thing `/r/[slug]` had over `/demo` was the compiled topic prose — which is duplicative of `/demo`'s specialty-surface condition cards and tied to a different persona (so it can't be ported directly without an LLM recompile against the metabolic-syndrome fixture).

## Goals

- `/demo/record` is THE public navigable-record demo. One persona, one surface, one URL contract.
- `/r/demo-navigable-record` route + supporting infrastructure deleted.
- All inbound links repointed to `/demo` or `/demo/record`.
- Backward-compat redirect for `/r/demo-navigable-record` → `/demo/record` so any in-the-wild shares still resolve.
- `/demo/record` gains two small polish wins:
  - `?entity=<nodeId>` URL deep-linking so a shared graph view can pre-open a specific node.
  - Source-document hub synthesis on the canvas (the same `synthesizeSourceNodes` / `synthesizeSourceEdges` that `/record?mode=map` ships), so sources appear as visible nodes the SUPPORTS edges can land on.
- Authenticated-user fixtures stay: the seeded `demo@morningform.com` user keeps its graph + compiled TopicPages for `/record` and `/topics/[topicKey]` in dev/E2E. PR #127's fixture-bundling stays load-bearing for `/api/health/demo`.

## Non-Goals

- **No topic prose added to `/demo/record`.** The condition-card layout already does the narrative job in a tighter, more structured way. Adding three-tier prose would duplicate what's there for a different persona — net loss.
- **No mobile canvas.** `/demo/record` is already `hidden md:block` on the canvas; mobile sees the specialty-surface text. Keeping it.
- **No LLM recompile against the metabolic-syndrome persona.** The seeded iron/sleep/energy TopicPages stay for authed use; they don't appear on `/demo/record`.
- **No new tracking instrumentation.** `/demo` doesn't track per-page funnel emission today; this plan doesn't add it.
- **No new OG cards / metadata.** `/demo` layout's `noindex` posture is preserved.
- **No middleware change** beyond the redirect rule. Existing `/r/*` security headers stay (harmless on a deleted route, and the redirect short-circuits the middleware anyway).
- **No deletion of the seeded `demo@morningform.com` user** or its fixture/graph data. That's still used for authed seeding + E2E and is intentionally separate from the public-demo fixture.
- **No graph-canvas rewrite, no provenance/topic API changes, no `VaultMapMode` extraction.** All of that was scoped under the now-abandoned rewrite plan.

## Success Criteria

1. `GET /demo/record` renders the metabolic-syndrome canvas (desktop) + specialty-surface text + sources block. No regression from today.
2. Clicking a node on the canvas opens the bottom sheet with hydrated provenance chunks. No regression.
3. **New:** copying `/demo/record?entity=cond-prediabetes` and pasting into a new tab opens the page with the Prediabetes node already selected and the sheet open.
4. **New:** the canvas shows ~6 additional source-document hub nodes alongside the 22 fixture nodes; SUPPORTS edges land on these hubs visibly.
5. `GET /r/demo-navigable-record` returns a 308 redirect to `/demo/record`. The 308 is permanent — clients cache it; share links posted anywhere in the past keep working.
6. The authed surfaces (`/settings/shared-links`, the `<VaultIndex>` empty-state, the homepage record anchor) all link to a working URL — `/demo/record` for graph-style, `/demo` for the tour entry.
7. `/api/health/demo` continues to return `200 healthy` with `fixtureGeneratedAt` populated — the seed + bundling path is unchanged.
8. `pnpm build` succeeds with one less route in the manifest (no `/r/[slug]`).

## Key Decisions

### D1 — `/demo` is the canonical public demo surface

Marketing already points here. Three-page tour (Overview → Record → Ask) is a stronger product walkthrough than the single-page topic-prose dump. Fixture-direct rendering means it's near-free to serve and immune to DB outages. The metabolic-syndrome persona is the better demo narrative (clear inflection, before/after, multi-specialty). One canonical demo — not two.

### D2 — Permanent (308) redirect from `/r/demo-navigable-record` → `/demo/record`

Some external surfaces (Slack DMs, prior tweets, the seeded `<VaultIndex>` empty-state on staging) may have the old URL. A 308 keeps them working forever and tells crawlers the move is permanent. Use Next.js's `redirects()` in `next.config.mjs` rather than middleware so the redirect happens before any handler runs.

**Why 308 not 301:** 308 preserves the request method (a `POST` would stay `POST`); 301 historically rewrote to `GET`. Either is fine for this route (it's `GET` only), but 308 is the modern recommendation and matches the rest of the Next ecosystem.

### D3 — Add `?entity=<nodeId>` URL state to `<DemoGraphSection>`

Currently `<DemoGraphSection>` owns selection in local `useState`. Promote to URL state so:
- Shared links can deep-link to a specific node ("look at the HbA1c reading specifically").
- Browser back/forward respects the open/closed sheet state.
- Marketing analytics could later filter on which nodes get pre-opened most often.

Implementation: `useSearchParams` + `router.replace` on the public `/demo/record` page. Keep `force-static` rendering — URL state is client-side only and doesn't affect SSR. The same deep-link-truncation guard that `<VaultLayout>` uses applies (unknown `?entity=` is cleared after one render).

### D4 — Add source-document hub synthesis to `<DemoGraphSection>`'s canvas

`<VaultMapMode>` (`vault-layout.tsx:209-227`) feeds its canvas synthesised source-document pseudo-nodes via `synthesizeSourceNodes` + `synthesizeSourceEdges` from `src/lib/record/canvas-synthesis.ts`. This is what makes the authed `/record?mode=map` canvas show source-doc hubs alongside health entities — gives SUPPORTS edges visible targets and makes the canvas read as a citation graph, not just an entity blob.

`/demo/record`'s canvas today shows only the 22 fixture nodes — the SUPPORTS edges are self-loops (`fromNodeId === toNodeId`) and render as degenerate zero-length lines. Adding source-doc hub synthesis (and replacing self-loops with synthesised entity→source edges) makes the canvas materially more compelling at no LLM cost.

### D5 — Keep PR #127 fixture-bundling infrastructure

`/api/health/demo/route.ts` reads `loadDemoTopicFixture()` for the fixture's `generatedAt` timestamp. `prisma/seed.ts` also reads it. The `next.config.mjs` `outputFileTracingIncludes` entry for the JSON is therefore still load-bearing — keep.

The seed itself remains: dev databases and E2E still want the iron/sleep/energy TopicPages on `demo@morningform.com`. They just no longer back any public route — they back the **authed** `/record` and `/topics/[topicKey]` views when a developer signs in as the demo user for testing.

### D6 — Delete `src/lib/record/demo.ts` entirely

After repointing the two callers (`vault-index.tsx`, `settings/shared-links/page.tsx`), the slug-table + `resolveDemoSlug` + `listDemoSlugs` + the `DEMO_NAVIGABLE_RECORD_SLUG` re-export from this file are all dead. Delete the file; have the callers use the string literal `'/demo/record'` directly (or a centralised const if a second caller appears later — YAGNI for now).

`prisma/fixtures/demo-navigable-record.ts` keeps the `DEMO_NAVIGABLE_RECORD_SLUG` export because it's referenced by `prisma/seed.ts` (used to keep the seeded share-link working for the authed demo user — wait, no, that's also being deleted). Re-verify during U3: if nothing else imports `DEMO_NAVIGABLE_RECORD_SLUG` after this PR, remove the export too.

## Considered Alternatives

1. **Build the graph on `/r/demo-navigable-record` as previously planned.** Rejected. The prior plan was a ~6-unit rewrite that duplicated functionality already shipping at `/demo/record`. The user surfaced the duplication explicitly — duplicate work is the thing to avoid.

2. **Keep both surfaces, differentiate by audience (share-recipients vs. prospects).** Rejected. Two personas, two URL contracts, two operational paths, ongoing drift risk. Adversarial review of the prior plan flagged this as a structural smell (F2 from the prior doc-review run).

3. **Move the iron/sleep/energy persona to `/demo` and retire the metabolic-syndrome persona.** Rejected. The metabolic-syndrome persona has the stronger marketing narrative (clear arc, inflection point, multi-specialty story); the iron/sleep/energy persona was a topic-prose-testing fixture, not a marketing-grade story.

4. **Re-compile topic prose against the metabolic-syndrome persona and merge with `/demo/record`.** Rejected for this pass. Net-new LLM cost, two-week deepening loop on prompt tuning, no evidence the prose is necessary on top of the existing condition cards. Re-evaluate later if `/demo/record` engagement data justifies the depth investment.

5. **Add a server-rendered redirect at `/r/[slug]/page.tsx` instead of deleting the route.** Rejected. Costs a Next.js dynamic route per request, runs middleware, requires the slug-table lookup to redirect. A static `redirects()` rule is cheaper, runs at the edge, and lets us delete the entire `/r/` route tree.

## Implementation Units

### U1 — Repoint inbound links

**Files:**
- `src/components/home/record-anchor-card.tsx` — line 53: `/r/demo-navigable-record` → `/demo/record`
- `src/app/(app)/settings/shared-links/page.tsx` — line 108 + line 9 import: replace `${DEMO_NAVIGABLE_RECORD_SLUG}` template with `/demo/record`; drop the now-unused import
- `src/components/record/vault-index.tsx` — line 8 import + line 74 href: same treatment

**Approach:** Edit each file, replace the hardcoded `/r/${DEMO_NAVIGABLE_RECORD_SLUG}` Link with `/demo/record` (`vault-index` empty-state copy can stay — only the href changes). Drop the now-unused `DEMO_NAVIGABLE_RECORD_SLUG` import from each file.

**Verification:**
- `pnpm tsc --noEmit` — passes (imports cleaned up)
- Manual: in dev, sign in as demo user, verify the `<VaultIndex>` empty-state demo link goes to `/demo/record`; navigate to `/settings/shared-links`, verify the demo-preview link does the same.

**Test scenarios:**
- *Happy path:* the rendered `<Link>` element's `href` attribute equals `/demo/record` after the change.
- *Edge cases:* none — single-string href replacement.
- *Integration:* if any of the three files has a test snapshot, the snapshot updates accordingly. Most likely no tests touch these specific links; if they do, the diff is a one-line href change.

**Execution note:** Trivial. No test-first needed.

### U2 — Add 308 redirect rule

**Files:**
- `next.config.mjs`

**Approach:** Add to the `async redirects()` block (create the block if it doesn't exist):
```js
async redirects() {
  return [
    {
      source: '/r/demo-navigable-record',
      destination: '/demo/record',
      permanent: true, // 308
    },
  ];
}
```

**Verification:**
- `pnpm dev`, hit `http://localhost:3000/r/demo-navigable-record`, confirm 308 response in DevTools Network tab pointing at `/demo/record`.
- On Vercel Preview: `curl -I https://<preview-url>/r/demo-navigable-record` — confirm `HTTP/2 308` and `location: /demo/record`.

**Test scenarios:**
- *Happy path:* request to `/r/demo-navigable-record` returns 308 with `location: /demo/record`.
- *Edge cases:* `/r/demo-navigable-record?entity=foo` should also redirect — Next.js preserves the query string by default on `permanent: true` redirects.
- *Error/failure paths:* `/r/<anything-else>` 404s after U3 (no route, no fallback redirect).

**Execution note:** Pragmatic. No new tests; verify via dev + Preview.

### U3 — Delete the `/r/[slug]` route

**Files:**
- `src/app/r/[slug]/page.tsx` — DELETE
- `src/app/r/[slug]/layout.tsx` — DELETE
- `src/app/r/[slug]/page.test.ts` — DELETE (if exists)
- Empty `src/app/r/` directory — DELETE if no other contents remain

**Approach:** `git rm` the files. Verify there are no other `/r/` routes in the tree (`find src/app/r -type f`); if empty, remove the directory too.

**Verification:**
- `pnpm tsc --noEmit` — passes (no dangling imports from deleted files).
- `pnpm build` — succeeds, route map shows `/demo/record` but no `/r/[slug]`.
- The U2 redirect rule covers the deleted route.

**Test scenarios:**
- *Happy path:* `pnpm build` succeeds with `/r/[slug]` absent from `.next/routes-manifest.json`.
- *Edge cases:* no test files reference the deleted route — verify via `grep -rn 'r/\[slug\]\|/r/demo-navigable-record' src tests` (after U1 lands so the inbound-link grep hits are gone too).

**Execution note:** Pragmatic. Trust the redirect + type-check.

### U4 — Delete `src/lib/record/demo.ts` and clean up dead exports

**Files:**
- `src/lib/record/demo.ts` — DELETE
- `prisma/fixtures/demo-navigable-record.ts` — verify whether `DEMO_NAVIGABLE_RECORD_SLUG` (line 606) is still imported anywhere after U1/U3/U4. If no, remove the export.

**Approach:**
- Delete `src/lib/record/demo.ts`.
- Grep for `DEMO_NAVIGABLE_RECORD_SLUG`: after U1/U3 land, only `demo.ts` itself and the fixture should still reference it. With `demo.ts` deleted, the only remaining ref is the fixture export — remove it.
- Grep for `resolveDemoSlug`, `listDemoSlugs`: after `demo.ts` is deleted, both should have zero references.

**Verification:**
- `pnpm tsc --noEmit` — passes (no dangling imports).
- `grep -rn 'demo-navigable-record-slug\|resolveDemoSlug\|listDemoSlugs\|DEMO_NAVIGABLE_RECORD_SLUG' src prisma scripts` — returns nothing.

**Test scenarios:**
- *Happy path:* type-check is green, grep is empty.
- *Edge cases:* none.

**Execution note:** Trivial. Land after U1.

### U5 — Add `?entity=<nodeId>` URL deep-linking to `<DemoGraphSection>`

**Files:**
- `src/components/demo/demo-graph-section.tsx` — modify
- `src/components/demo/demo-graph-section.test.tsx` — extend (or create)

**Approach:**
- Replace `const [openNodeId, setOpenNodeId] = useState<string | null>(null)` with URL-state plumbing:
  - Read: `const openNodeId = searchParams.get('entity')` (with the same SEC-002-style validation guard from the prior plan — reject `length > 200` or non-canonical chars; clear param if invalid).
  - Write: `router.replace(...)` via `useSearchParams` + `usePathname`. Use `startTransition` so the URL update doesn't block the click animation.
- Deep-link truncation guard: if `?entity=foo` set but no node in `adapted.provenanceByNodeId` matches, clear the param. (Borrowed verbatim from `vault-layout.tsx:106-110`.)
- Source-document pseudo-node click guard: when U6 lands, ensure source-doc clicks are no-ops (don't write to URL). The existing `vault-layout.tsx:85` pattern.

**Verification:**
- `pnpm vitest run src/components/demo/demo-graph-section.test.tsx` passes.
- Manual: open `/demo/record`, click HbA1c node, observe URL becomes `/demo/record?entity=<hba1c-node-id>`. Reload — sheet opens with HbA1c. Copy URL to a new tab — sheet pre-opened on HbA1c.

**Test scenarios:**

*Happy path:*
- Clicking a node updates `?entity=<nodeId>` in the URL.
- Reloading the page with `?entity=<nodeId>` opens the sheet on that node.
- Closing the sheet (ESC, scrim click, close button) clears `?entity=` from the URL.

*Edge cases:*
- `?entity=<unknown-node-id>` on initial mount → param cleared after first render; sheet stays closed.
- `?entity=<oversized-300-chars-or-bad-chars>` → param cleared before any `find` runs (security guard).
- After U6: source-document pseudo-node click is a no-op — URL does not change.

*Error/failure paths:*
- `adapted.provenanceByNodeId` missing an entry for a clicked node — sheet still opens with empty provenance (existing behavior); URL is updated regardless.

*Integration:*
- `force-static` rendering is preserved — `pnpm build` still marks the route as static (URL state is client-only; SSR output doesn't change).

**Execution note:** Pragmatic. Pattern is well-established (`vault-layout.tsx`); copy the mechanics, drop the auth-aware branches.

### U6 — Add source-document hub synthesis to `<DemoGraphSection>`'s canvas

**Files:**
- `src/components/demo/demo-graph-section.tsx` — modify
- `src/lib/demo/graph-adapter.ts` — possibly extend to expose what `synthesizeSourceNodes` needs (userId, source list, score ceiling) from the adapted fixture
- `src/components/demo/demo-graph-section.test.tsx` — extend

**Approach:**
- Replicate the `<VaultMapMode>` canvas-feeding logic (`vault-layout.tsx:209-227`) inside `<DemoGraphSection>`:
  - Compute `referencedDocIds` from edges via `referencedSourceDocumentIds`.
  - Filter `adapted.sources` (or its equivalent) to those referenced.
  - Synthesise source-doc nodes via `synthesizeSourceNodes(visibleSources, userId, scoreCeiling)`.
  - Synthesise biomarker → source-doc edges via `synthesizeSourceEdges`.
  - Filter out the existing SUPPORTS self-loops from `adapted.graph.edges` before merging.
- The adapter (`adaptDemoFixture`) likely needs to expose the source list + a `scoreCeiling` (or compute them on the fly inside `<DemoGraphSection>`).

**Pre-implementation check:** read `src/lib/demo/graph-adapter.ts` and `src/lib/record/canvas-synthesis.ts` to confirm the synthesis helpers accept the adapted fixture's data shape. If not, write a tiny adapter inside `<DemoGraphSection>` — don't refactor the canvas-synthesis API.

**Verification:**
- `pnpm vitest run` passes.
- Manual: open `/demo/record` on desktop, count visible canvas nodes — should be ~28 (22 fixture nodes + ~6 source-doc hubs). Confirm SUPPORTS edges visibly connect biomarkers to source-doc hubs rather than rendering as self-loops.
- Clicking a source-doc hub is a no-op (the U5 guard handles this).

**Test scenarios:**

*Happy path:*
- Canvas renders fixture nodes + ~6 synthesised source-doc hubs.
- SUPPORTS-derived synthesised edges render between biomarkers and the right hubs.
- Self-loop SUPPORTS edges are filtered out.

*Edge cases:*
- A node with no SUPPORTS provenance — no synthesised hub edges out of it; existing ASSOCIATED_WITH edges unchanged.
- A source-doc with zero references — filtered out of `visibleSources`; no orphan hub on the canvas.

*Integration:*
- The aria-label edge count on `<GraphCanvas>` matches the actual visible-edge count (no inflation from self-loops).

**Execution note:** Pragmatic. Borrow the `<VaultMapMode>` pattern verbatim where possible.

### U7 — Verify health check + seed + E2E are unchanged

**Files:** none — verification only.

**Approach:**
- `pnpm dev` + `curl http://localhost:3000/api/health/demo` — expect `status: 'healthy'`, `fixtureGeneratedAt` populated.
- `pnpm prisma db seed` against a clean DB — expect the demo user + graph + 3 TopicPages seeded.
- If E2E tests exist that hit `/r/demo-navigable-record`, they break. Grep for `r/demo-navigable-record` under `tests/` / `e2e/` / `playwright/` and update those test URLs to `/demo/record` (or to the auth'd `/record` view if that was the intent).

**Verification:**
- All three checks pass.

**Test scenarios:** N/A — verification of unchanged behavior.

**Execution note:** Last step before merge.

## Sequencing & Dependencies

```
U1 (repoint links)  ──┐
U2 (308 redirect)   ──┤
                      ├──→ U3 (delete /r/[slug])  ──→ U4 (delete demo.ts) ──→ U7 (verify)
                      │
U5 (?entity= state) ──┤
U6 (source hubs)    ──┘
```

- U1, U2 are independent — can run in parallel.
- U3 depends on both U1 (inbound links repointed) and U2 (redirect catches stragglers).
- U4 depends on U3 (no remaining caller of `resolveDemoSlug`).
- U5 and U6 are independent of the rest and of each other — pure `/demo/record` polish. Can land in any order or in parallel.
- U7 is the last verification step before merge.

For execution: run U1+U2+U5+U6 in parallel; then U3; then U4; then U7. Whole plan is one PR.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| In-the-wild `/r/demo-navigable-record` share links break | Medium — broken shared links | U2's 308 redirect. Permanent + query-string-preserving. Verify on Preview before merge. |
| `/demo/record` was force-static; adding URL state could break static rendering | Low — `pnpm build` shows route as Dynamic | URL state is read in a client component (`'use client'` already on `<DemoGraphSection>`). SSR output of `/demo/record` doesn't depend on the URL state. `pnpm build` should still mark the page as static. Verification step in U7 confirms. |
| Source-doc hub synthesis assumes a userId — the public-fixture path has none | Low — function signature requires it | Pass a deterministic placeholder string (e.g., `'demo-user'`). `synthesizeSourceNodes` uses userId only for node ID synthesis; it doesn't query anything. Doc the placeholder clearly. |
| Deleting `src/lib/record/demo.ts` orphans the slug-table abstraction someone might want later | Low — YAGNI | If a second public-demo slug appears, recreate a minimal version then. Trivial to write. |
| Authed `/settings/shared-links` page used to show the demo slug as an example "share link the user could send" — repointing to `/demo/record` may break that mental model | Low — UX clarity | Read `settings/shared-links/page.tsx` during U1; if the demo card frames itself as "a sample share link," update the copy to "a sample public demo of the navigable record" or similar. Cosmetic. |
| Adversarial: someone in a future PR re-introduces `/r/[slug]` for a different purpose, conflicting with the redirect | Low | Document the rationale in this plan and in the next.config.mjs redirect entry comment. |
| The metabolic-syndrome fixture is materially different from the iron/sleep/energy fixture — repointing breaks anyone expecting iron content at the demo URL | Low — internal-only audience knows what's in `/demo` | Marketing team will see the metabolic-syndrome persona at `/demo/record`. Authed users using `/settings/shared-links` to share a sample will see the same. If anyone has a personal mental model that the demo is iron-content-specific, they re-learn — low blast radius. |

## Verification & Test Strategy

**Per-unit verification** is captured in each implementation unit.

**End-to-end verification** (before merge):
1. `pnpm tsc --noEmit` — zero errors.
2. `pnpm test` — all suites pass (new and existing).
3. `pnpm lint` — clean.
4. `pnpm build` — succeeds; route map shows `/demo/record` is static, `/r/[slug]` is absent.
5. Local dev server (`pnpm dev`):
   - `/r/demo-navigable-record` → 308 → `/demo/record` ✓
   - `/demo/record` renders canvas with ~28 nodes (fixture + source-doc hubs) on desktop ✓
   - Click HbA1c → sheet opens, URL becomes `?entity=<id>` ✓
   - Reload deep-linked URL → sheet pre-opens ✓
   - `/settings/shared-links` → demo card href is `/demo/record` ✓
   - `<VaultIndex>` empty-state link is `/demo/record` ✓
   - Homepage record anchor card is `/demo/record` ✓
   - `/api/health/demo` returns `200 healthy` ✓
6. Vercel Preview: repeat key checks against the Preview URL. Confirm `curl -I` on the old URL returns `308` + `location: /demo/record`.
7. `pnpm prisma db seed` on a fresh DB — seeds without error; `loadDemoTopicFixture` resolves.

**Regression surface to protect:**
- Marketing top-nav demo link (`/demo`) — unchanged behavior.
- Authed `/record` and `/topics/[topicKey]` for the seeded `demo@morningform.com` user — unchanged.
- `<NodeDetailSheet>` default behavior — unchanged (no new props introduced in this plan).
- `/share/[token]` — untouched.

## Patterns Reference

- **URL deep-link pattern (U5):** `src/components/record/vault-layout.tsx:41-110` — `useSearchParams` + `router.replace` with `startTransition`, deep-link truncation guard, source-doc click no-op.
- **Source-doc hub synthesis (U6):** `src/components/record/vault-layout.tsx:209-227` + `src/lib/record/canvas-synthesis.ts`.
- **308 redirect pattern (U2):** `next.config.mjs` already has rewrites; add a `redirects()` block alongside. See Next.js docs for the shape.
- **Public-safety posture preserved:** `/demo` layout already sets `robots: { index: false, follow: false, nocache: true }` (`src/app/demo/layout.tsx:14-19`). No change needed.

## Origin & References

- User direction: "we have the demo here as well https://morning-form.vercel.app/demo we need to merge both and delete the redundant slug ... combine the most powerful features into one improved and streamlined design"
- Earlier user direction (this same conversation): "the demo is showing this but it's supposed to be showing the health graph and click into the nodes etc" — resolved by routing traffic at `/demo/record` (which already has the graph) rather than building a new graph at `/r/[slug]`.
- Earlier (now-superseded) plan content in this same file: a rewrite of `/r/[slug]` to render a navigable graph. Abandoned in favor of consolidation.
- Prior plan: [docs/plans/2026-04-17-001-feat-navigable-health-record-plan.md](docs/plans/2026-04-17-001-feat-navigable-health-record-plan.md) — defined `/r/[slug]` originally as a curated public demo. Retired now.
- Prior plan: [docs/plans/2026-04-25-001-feat-synthetic-demo-and-referral-scribes-plan.md](docs/plans/2026-04-25-001-feat-synthetic-demo-and-referral-scribes-plan.md) — built the metabolic-syndrome persona and the `/demo` surface. Now the canonical public demo.
- Prior plan: [docs/plans/2026-05-15-001-feat-show-graph-at-any-density-plan.md](docs/plans/2026-05-15-001-feat-show-graph-at-any-density-plan.md) — source-doc hub synthesis primitives reused in U6.
- Recently shipped: [PR #127](https://github.com/EveryInc/morning-form/pull/127) — fixture-bundling for `loadDemoTopicFixture`. Stays load-bearing for `/api/health/demo` and seed.

## Implementation-Time Unknowns

1. **Does `adaptDemoFixture` expose a source list in the shape `synthesizeSourceNodes` expects?** Likely yes (the fixture's `DemoSource` shape mirrors `SourceDocument`), but verify during U6. If not, add a small in-component adapter rather than mutating `adaptDemoFixture`'s public API.
2. **Does any E2E test reference `/r/demo-navigable-record`?** Grep during U7. If yes, update to `/demo/record` (or to authed `/record` if that was the test intent).
3. **Does the demo card copy in `settings/shared-links` need a content update?** Re-read during U1 and adjust if the framing was slug-specific.
4. **Should the new `?entity=` deep-link survive nav between `/demo/{overview,record,ask}` tabs?** Probably not (each tab has its own state). Default Next.js behavior is to drop query params on full navigations — confirm during U5.

**Resolved by Phase 1 research (no longer unknown):**
- `<DemoGraphSection>` already renders a navigable canvas with hydrated provenance — no rewrite needed, only polish.
- The metabolic-syndrome fixture (`METABOLIC_PERSONA_GRAPH`) has 22 nodes and ~6 distinct source documents — well-suited to the hub-synthesis pattern.
- `/demo/{overview,record,ask}` is already inbound-linked from marketing/sign-in — no link discovery needed for outbound traffic.
- `loadDemoTopicFixture` is called by both `prisma/seed.ts` and `/api/health/demo` — bundling stays load-bearing.
- The seeded iron/sleep/energy persona at `demo@morningform.com` is used for authed `/record`/`/topics/[topicKey]` dev/E2E — preserved unchanged.
