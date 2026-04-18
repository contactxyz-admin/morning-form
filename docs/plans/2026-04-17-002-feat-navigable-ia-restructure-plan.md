---
plan: 2026-04-17-002
title: Navigable IA Restructure — Record-First Surface
status: active
created: 2026-04-17
origin: docs/brainstorms/2026-04-15-health-graph-pivot-requirements.md
depth: deep
---

# Navigable IA Restructure — Record-First Surface

## Problem Frame

Plan 001 (`docs/plans/2026-04-17-001-feat-navigable-health-record-plan.md`, PRs #43–#52) shipped every surface required for the v1 health-graph pivot: `/record` landing, `/record/source/[id]`, `/topics/[topicKey]`, `/graph`, `/r/[slug]` public demo, share flow, and a `record` bottom-nav tab. The surfaces work in isolation, but the CTO — exercising the app end-to-end — sees almost none of them during ordinary use. The record surfaces are effectively deep-link-only because the primary surfaces (`/home`, post-intake redirect, post-sign-in redirect, bottom-nav) still reflect the pre-pivot app.

This plan is an **information-architecture and entry-point restructure**, not a new-feature build. The shipped work stays; the paths that lead to it get rewired so a user encountering the app from any plausible start (fresh sign-up, returning sign-in, finishing intake, opening the app cold) actually lands on the compiled record or has one click to reach it.

## Requirements Trace

From origin doc `docs/brainstorms/2026-04-15-health-graph-pivot-requirements.md`:

- **R14** — daily brief sits on the home surface, "explicitly secondary to the compiled record." → `/home` content must *read as secondary to* `/record`, not lead with protocol/wearables.
- **R15** — graph view "accessible from the home surface … not the default landing surface." → `/graph` needs a first-class entry point *from home*, not bottom-nav-only-if-we-ever-add-it.
- **R20** — "Health Graph experience … becomes the **primary surface** of MorningForm at v1 launch." → Post-sign-in and post-intake destinations must be `/record`, not `/home`.
- **R21** — check-ins "reframed as ongoing inputs that write directly into graph nodes … progressively de-emphasized." → Check-in cards remain on `/home` but stop being the visual anchor; the record anchors home.
- **R22** — protocols reframed as intervention nodes on the graph. → `/protocol` stays but home stops leading with it.

From plan 001 success criteria (see origin plan):
- **Criterion #1** — "A user completing intake lands on `/record`." → Currently fails. `src/components/intake/finish-bar.tsx:57` pushes to `/home`.

From Phase 1 audit (see `Context` below):
- Three of five bottom-nav tabs (`/protocol`, `/insights`, `/you`) are mock-fixture-only at the data layer; the two real-data tabs (`/home`, `/record`) do not cross-link.
- `pathToTab` in `src/app/(app)/layout.tsx:7-13` has no mapping for `/graph`, `/topics/*`, `/record/source/[id]`, so drilling into the record family highlights the wrong tab ("Home").
- `ShareDialog` is mounted on topic pages only; `/record` and `/graph` have no share affordance.
- `/r/demo-navigable-record` is surfaced by zero UI paths despite being fixture-provisioned.

## Context

### Current state (from audit)

**Route tree** — five tabs wrap `/home /protocol /record /insights /you` via `src/app/(app)/layout.tsx`. The record family (`/graph`, `/topics/[topicKey]`, `/record/source/[id]`) sits *inside* `(app)` but outside `pathToTab`. `/r/[slug]` and `/share/[token]` are public-SSR, no bottom nav.

**`/home` today** (`src/app/(app)/home/page.tsx`, render order):
1. Header + greeting + guide icon
2. Morning check-in CTA (time-gated, has "→ record" banner once completed — from plan 001 closeout)
3. Evening check-in CTA (time-gated)
4. "Next up" protocol card → `/protocol`
5. "Your record" / Open health graph card → **`/graph`** (not `/record` — copy conflates them)
6. "From your devices" summary (only if `healthSummary.recovery.hrv` present) → `/insights`

Zero links to `/record`, `/topics/*`, `/record/source/*`, or `/r/demo-navigable-record`.

**Post-intake redirect** — `src/components/intake/finish-bar.tsx:57` → `/home`. Plan 001 criterion #1 unmet.

**Post-sign-in redirect** — `src/app/api/auth/verify/route.ts:45` → `/home` (onboarded) or `/assessment` (new).

**`/` root** — `src/app/page.tsx` is pure marketing; CTAs go to `/onboarding`, never mentions record/graph/topics. "Sign in" link in header.

**Mock tabs** — `/protocol`, `/insights`, `/you` render fixture data (`mockProtocol*`, `mockWeeklyReview`, `mockStateProfile`). They look real in screenshots; they are not connected to the graph yet.

### Origin hierarchy (what R14/R15/R20 want)

```
Primary       /record      — the compiled asset, the durable product
Secondary(a)  /graph       — the relational view of the same data
Secondary(b)  /home        — daily brief over top of the record (check-ins, brief notes)
Adjacent      /protocol    — the interventions layer of the graph, surfaced standalone
Adjacent      /you         — profile, settings, shared-links control plane
```

The current app puts `/home` first, `/protocol` second, and only reaches `/record` via the third tab. This plan reverses the top two slots.

## Scope Boundaries

**In scope**
- Rewiring intake + sign-in destinations to `/record`
- Rebalancing `/home` content so `/record` anchors it (not protocol/wearables)
- Fixing `pathToTab` so drilled-in record-family routes keep the right tab active
- Mounting `ShareDialog` on `/record` and `/graph` (same record/graph scopes already supported by the API)
- Surfacing `/r/demo-navigable-record` where it belongs (settings, and as a discovery card for empty-record users)
- Reordering bottom-nav so the primary surface is physically primary
- One small swap: `Insights` tab (mock-only) → `Graph` tab, so `/graph` stops being orphaned

**Out of scope**
- Rebuilding `/protocol`, `/insights`, `/you` with real data (separate work; the mock-to-real transition is its own plan when the graph-driven protocol/insights compile pipeline lands)
- Redesigning `/` root landing page (marketing surface, decoupled from authed IA)
- Changing agent-native API shapes (all routes we're wiring already have tools)
- Adding new share-scope types (record and graph scopes already exist in `src/lib/share/scope.ts`)
- Changing the visual aesthetic (plan 001 closeout unified `bg-record-grid` across record-family; this plan reuses the same primitives)
- Changing check-in write semantics (R21 says check-ins should write to graph nodes; the write-path work is separate)

## Key Decisions

### D1 — Post-intake lands on `/record`, not `/home`

**Decision.** Change `FinishBar` to `router.push('/record')` so finishing intake drops the user directly onto the compiled record they just produced. If intake ran with zero uploads, `/record` shows the empty-onboarding state from plan 001 — which is a better "here's what you built" than `/home`'s protocol card.

**Why.** Directly satisfies plan 001 criterion #1. No empty-state regression — `/record` already handles empty gracefully.

**Rejected alternative.** "Route through `/processing` or an intermediate celebration surface" — plan 001 already polished the record landing rise/stagger animations; a celebration interstitial would double-up.

### D2 — Post-sign-in onboarded users land on `/record`

**Decision.** Change `src/app/api/auth/verify/route.ts` so `onboarded = true` → `/record`. Non-onboarded remain on `/assessment`. If we later add a "record is empty" signal, we can branch to `/home` then — but `/record` handles empty fine today.

**Why.** R20 explicit. A returning user's reason to sign in is to consult their record; making `/home` the default delays that by a tab click every session.

**Rejected alternative.** "Land on `/home` but make home record-forward" — still forces an extra click to see real data. Home's value is transient daily context, record's value is durable.

### D3 — `/home` evolves into a record-anchored brief, not a protocol-anchored dashboard

**Decision.** Rebalance `/home` card order and content so the record is the visual anchor. Specifically:
1. Header + greeting (unchanged)
2. Time-of-day check-in card (unchanged — still time-gated, still has "→ record" banner)
3. **NEW** — "Your record" card linking to `/record`, showing at least: total node count + newest surface (last source added or last topic promoted). Matches the meta strip on `/graph`. For users with an empty record, shows "Nothing yet — [import your data](/intake)" with a secondary "or explore the demo record" link to `/r/demo-navigable-record`.
4. **NEW** — "The graph view" card linking to `/graph`, replacing the conflated "Your record / Open health graph" card. Copy: "See how it all connects." Explicitly secondary to the record card.
5. Protocol "Next up" card (unchanged but **demoted below record/graph**). Marked discreetly as mock if we want transparency — not required for this plan.
6. Devices summary (unchanged, conditional on `healthSummary.recovery.hrv`).

**Why.** R14 places the daily brief on home but subordinate to the record. Today's home inverts that. The record card isn't a redesign; it's one card, wired to an existing API.

**Rejected alternatives.**
- **Full home redesign** — scope creep. The gap is presence, not quality.
- **Delete `/home` entirely, make `/record` the only landing** — conflicts with R14 (daily brief lives somewhere) and throws away the already-polished check-in flow.

### D4 — Replace `Insights` tab with `Graph` tab; keep tab count at 5

**Decision.** Swap the fourth bottom-nav slot: `insights` → `graph`. New tab order: `home → record → graph → protocol → you`. `/insights` becomes an orphan route (still reachable by URL, still rendered, home's devices card still links to `/insights`); we stop giving it primary-nav real estate.

**Why.**
- `/graph` is real data; `/insights` is mock weekly-review. Primary nav should lead to real data.
- R15 requires graph to be "accessible from the home surface" — a tab IS accessible from the home surface.
- `/graph`'s `pathToTab` orphan bug (`src/app/(app)/layout.tsx:17` falls back to "home") goes away if `/graph` has its own tab.
- Record moves to position 2 (next to home), so the visual scan on first sight is `home → record` not `home → protocol → record`.

**Rejected alternatives.**
- **Keep 5 tabs as-is, add `/graph` as sixth** — six tabs too dense on mobile.
- **Replace `protocol` with `graph` instead of `insights`** — protocol has more in-flight investment and the R22 re-frame (protocol-as-intervention-nodes) is future work worth keeping a tab for. Insights has weaker narrative.
- **Reorder without removing** — doesn't solve the `/graph` orphan.

**Confidence.** P2 — this is a bigger change than the wiring. If the user rejects it, rest of the plan still works by keeping 5 tabs and just fixing `pathToTab` instead of swapping.

### D5 — `pathToTab` gets explicit mappings for every `(app)` surface

**Decision.** Expand `pathToTab` in `src/app/(app)/layout.tsx` to map:
- `/record` and `/record/source` → `record` tab
- `/topics` → `record` tab (topics are a record-family surface)
- `/graph` → `graph` tab (assuming D4) or `record` tab (if D4 rejected)
- `/check-in` → `home` tab (check-ins conceptually belong to the daily brief)
- `/intake` → `home` tab (intake runs before record exists)
- `/guide`, `/settings*` → `you` tab

**Why.** Removes the "drilled in, but highlights Home" silent bug. Users keep their sense of place.

### D6 — Mount `ShareDialog` on `/record` and `/graph`

**Decision.** Add a Share button to `/record` header (scope: `{ kind: 'record' }`) and `/graph` header (scope: `{ kind: 'graph' }`, same as record for MVP since we don't have a distinct share URL yet — if the API only supports `{ kind: 'record' | 'topic' | 'node' }`, use `record` scope for both entry points). Match the existing `/topics/[topicKey]` mount pattern (`src/app/(app)/topics/[topicKey]/page.tsx:108-114,183`).

**Why.** The share flow was built in plan 001; only topic pages expose it. Record-level sharing ("send someone my whole record for a consultation") is a first-class use case per R17's GP-prep framing.

**Deferred to implementation.** Whether to add a distinct `graph` share scope, or have the graph button share the record. Check `src/lib/share/scope.ts` at implementation time and pick the minimal path.

### D7 — Surface the demo record `/r/demo-navigable-record` in the user's UI

**Decision.** Two entry points:
1. `/settings/shared-links` — add a row for the demo record (labelled "Demo record · example public view"), opens `/r/demo-navigable-record`.
2. `/record` empty state — add a secondary link: "or [explore the demo record](/r/demo-navigable-record) to see what a full record looks like." This gives first-time users (no data) something to look at.

**Why.** Right now the fixture exists, the route renders, and zero UI code references it. Surfacing it once for returning users (settings) and once for fresh users (empty state) closes the "nobody sees it" gap without polluting primary surfaces.

**Deferred to implementation.** Whether the settings-shared-links list queries it as a real shared-link row vs hard-codes it. Hard-code is fine for now — the slug is a constant in `src/lib/record/demo.ts`.

### D8 — Root landing `/` gets a single sentence + returning-user CTA, nothing more

**Decision.** Leave the marketing page as-is. Add one subtle addition: if a browser cookie indicates a prior session (detectable via the auth middleware cookie), surface "Sign in to your record →" above or replacing the "Begin assessment" CTA. No visual overhaul.

**Why.** Marketing-page surgery is out of scope. The one friction we fix is returning users on `/` having to scan for the "Sign in" link in the header.

**Rejected alternative.** "Redirect cookie-authed users from `/` to `/record`" — user might legitimately want to re-read the marketing copy, or visit `/` while logged in to share with someone. A surfaced CTA is reversible; an automatic redirect isn't.

## Implementation Units

Each unit has a Goal, Files, Approach, Patterns to follow, Test scenarios, and Verification.

---

### U1 — Intake completion redirects to `/record`

**Goal.** Finishing intake drops the user on the compiled record, not the pre-pivot home.

**Files**
- `src/components/intake/finish-bar.tsx` (change `router.push('/home')` → `router.push('/record')` on line 57)
- `src/components/intake/finish-bar.test.tsx` if it exists — otherwise create

**Approach.** One-line change. If intake is in-progress via different persistence (session storage, DB), no effect — the redirect is pure navigation.

**Patterns to follow.** Mirror existing `router.push` usage in the same file.

**Test scenarios**
- **Happy path** — clicking Finish with completed intake pushes `/record`.
- **Edge case** — clicking Finish with partial intake (intake-store says incomplete) still pushes `/record` — `/record` empty state covers the "no sources imported" case.
- **Integration** — in a Playwright or Vitest component test, verify the router mock was called with `/record`.

**Verification.** Manual walk-through: start intake → complete all three tabs → click Finish → land on `/record` (not `/home`). No console errors, no 404.

---

### U2 — Post-sign-in verify redirects onboarded users to `/record`

**Goal.** Returning authenticated users land on their record.

**Files**
- `src/app/api/auth/verify/route.ts` (change `redirectTo = onboarded ? '/home' : '/assessment'` → `redirectTo = onboarded ? '/record' : '/assessment'` at line 45)
- `src/app/api/auth/verify/route.test.ts` if it exists

**Approach.** One-line change. Unauthenticated flow unaffected. `/assessment` path unaffected.

**Test scenarios**
- **Happy path** — onboarded user opens magic link → redirected to `/record`.
- **Edge case** — non-onboarded user opens magic link → still redirected to `/assessment`.
- **Error path** — invalid/expired token → unchanged behavior.

**Verification.** Hit `/api/auth/verify?token=…` with an onboarded user's token; inspect response location. Manual: sign-out → request magic link → click → lands on `/record`.

---

### U3 — `pathToTab` gets explicit mappings for every `(app)` route

**Goal.** Drilling into any record-family or settings surface keeps the correct bottom-nav tab active.

**Files**
- `src/app/(app)/layout.tsx` (expand `pathToTab` on lines 7–17)

**Approach.** Replace the current inline object with an ordered list of `[prefix, NavTab]` pairs or keep the object but add entries for every prefix. Ordering matters because `Object.entries(...).find(([path]) => pathname.startsWith(path))` takes the first match — longer prefixes (`/record/source`) must come before shorter (`/record`). Recommend switching to an array to make order explicit.

**Mappings to add.**
```
/record/source    → record
/topics           → record
/graph            → graph   (or record, if D4 rejected)
/check-in         → home
/intake           → home
/guide            → you
/settings         → you
```

**Patterns to follow.** Existing `pathname.startsWith(path)` pattern. Don't introduce regex.

**Test scenarios**
- **Happy path** — visiting `/record/source/abc` highlights Record tab.
- **Happy path** — visiting `/topics/iron` highlights Record tab.
- **Happy path** — visiting `/graph` highlights Graph tab (post-D4) or Record tab (if D4 rejected).
- **Edge case** — visiting an unmapped route (e.g. `/home/unknown`) falls back to `home` tab.
- **Edge case** — `/record/source/*` must match before `/record` is tried, verifying order.

**Verification.** Manual: click through every `(app)` route, confirm the active tab underline + accent color track the correct tab at every stop.

---

### U4 — `/home` adds a record-anchored card above protocol

**Goal.** `/home` reads as a brief *over* the record, not a protocol dashboard.

**Files**
- `src/app/(app)/home/page.tsx` — add record card, rename/retarget existing "Your record / Open health graph" card
- Possibly new component: `src/components/home/record-summary-card.tsx` (or inline — one card, reasonable to inline first)
- `src/app/api/record/index/route.ts` — already exists, already returns count + items for `/record`. Reuse the same endpoint from `/home`.

**Approach.** On home mount, fetch `/api/record/index` (same endpoint `/record` uses). Render a new Card in position 3 (after check-in, before protocol):

```
┌─────────────────────────────────────┐
│ · YOUR RECORD                       │
│ 12 nodes, 3 topics                  │
│ Latest — Iron panel, 2 days ago     │
│ Open record →                       │
└─────────────────────────────────────┘
```

If record is empty (0 nodes): `"Nothing yet — start intake"` primary link + `"or explore the demo record"` secondary link to `/r/demo-navigable-record`.

Rename the existing "Your graph" card at line 168 to "The graph view" with copy like "See how it all connects." Keep link to `/graph`.

**Patterns to follow.**
- Card variant/accent conventions from `src/app/(app)/home/page.tsx:86-100` (action variant, teal/sage/amber accents).
- Data-fetching pattern from `src/app/(app)/record/page.tsx:17-44` (effect + cancellation flag + `LoadState` union).
- Existing `SectionLabel` / kicker row pattern.

**Test scenarios**
- **Happy path** — user with populated record sees record card with correct node count and latest-source label, clicking it navigates to `/record`.
- **Empty path** — user with zero records sees "Nothing yet" copy and demo-record link; click resolves `/r/demo-navigable-record`.
- **Error path** — `/api/record/index` returns 401 → card renders `Sign in to view your record`. Matches `/record/page.tsx` error handling.
- **Loading** — card renders a muted placeholder, not layout-shift.
- **Integration** — verify render order: check-in → record card → graph card → protocol → devices. This is the entire point of the plan.

**Verification.** Manual walk-through: empty record → sees empty copy + demo link. Populated record → sees real count + topic. Screenshot mobile + desktop. No loading flash.

---

### U5 — Bottom-nav swaps `Insights` for `Graph`, reorders to `home / record / graph / protocol / you`

**Goal.** Primary nav reflects real-data surfaces in origin-doc priority order.

**Files**
- `src/components/ui/bottom-nav.tsx` (tabs array on lines 12–18)
- `src/components/ui/icon.tsx` — may need a `graph` icon; check if one exists. If not, pick a simple network/nodes glyph and add it to the `paths` map.
- `src/types/index.ts` (or wherever `NavTab` type lives) — update `NavTab` union to include `'graph'` and remove `'insights'` (or keep both if we're conservative; if we keep insights, tab becomes orphaned but the type still matches).
- `src/app/(app)/layout.tsx` — ensure `pathToTab` from U3 maps `/graph` → `graph` tab.
- Any `BottomNav active={…}` usage sites that passed `'insights'` → now should pass `'home'` or be removed if the page is orphaned.

**Approach.** Swap slot 4 in the tabs array. Reorder: `home, record, graph, protocol, you`. Add the graph icon path. Confirm `/insights` still renders (just without a tab entry).

**Patterns to follow.** Existing `IconName` union + `paths` map in `src/components/ui/icon.tsx`. Keep 24×24 viewBox, 1.5 stroke. Suggested glyph: three nodes connected by two edges — or reuse the existing `insights` glyph shape if it reads as "connections."

**Test scenarios**
- **Happy path** — bottom nav renders five tabs in new order, Graph tab with correct icon + label.
- **Happy path** — visiting `/graph` highlights Graph tab (requires U3 mapping).
- **Edge case** — visiting `/insights` directly still renders the page; no tab is highlighted (acceptable — insights becomes an orphan page surfaced from the home "devices" card).
- **Agent-native parity** — the existing "record" tab tool (if any) stays; add a "graph" tab tool only if nav tools are per-tab.
- **Integration** — every `BottomNav active=` usage compiles with the new `NavTab` type.

**Verification.** Manual: bottom nav shows `Home · Record · Graph · Protocol · You`. Tab underline tracks correct tab on every authed route. Desktop + mobile screenshot.

---

### U6 — `ShareDialog` mounts on `/record` and `/graph`

**Goal.** Share button available from the two primary-surface entry points, not only from topic pages.

**Files**
- `src/app/(app)/record/page.tsx` — add `ShareDialog` mount + header share button
- `src/app/(app)/graph/page.tsx` — add `ShareDialog` mount + header share button
- `src/lib/share/scope.ts` — verify which scopes exist (`record`, `topic`, possibly `node`, `graph`). If no `graph` scope, use `record` scope from the graph page (same shared data).

**Approach.** Copy the pattern from `src/app/(app)/topics/[topicKey]/page.tsx:108-114` (button) and line 183 (dialog). Scope:
- `/record` → `{ kind: 'record' }`
- `/graph` → `{ kind: 'record' }` (share same underlying data; if `graph` scope is added later, swap here)

**Patterns to follow.** Existing `ShareDialog` usage in topic page. Reuse `Icon` component for a share/send glyph (current `send` icon in `src/components/ui/icon.tsx:29` is fine).

**Test scenarios**
- **Happy path** — click Share on `/record` → dialog opens with "Mint link" action → creates a share token → shows mesh gradient thumbnail + URL.
- **Happy path** — same flow works on `/graph`.
- **Edge case** — dialog close restores the previous focus state.
- **Error path** — API returns 500 → dialog shows error message (existing `ShareDialog` behavior).
- **Agent-native** — if there's an agent tool for share-create, it still works; if one doesn't exist for record/graph scope yet, flag as follow-up (don't block this unit on tool parity — plan 001 already wired `record` scope end-to-end).

**Verification.** Manual: create share link from `/record`. Open the returned URL in an incognito window. Confirm SSR renders without auth.

---

### U7 — `/record` empty state surfaces the demo record

**Goal.** First-time users (zero sources) have something to look at; they can explore the demo without signing up a whole dataset.

**Files**
- `src/components/record/record-index.tsx` — the component handles the empty case; add a secondary link
- `src/lib/record/demo.ts` — already exports `DEMO_NAVIGABLE_RECORD_SLUG`, reuse
- Possibly `/settings/shared-links` page — add a demo row

**Approach.**
- In the record-empty branch of `RecordIndex`, add: `"Or [explore the demo record](/r/demo-navigable-record) to see what a full record looks like."` — styled as a secondary link below the primary "Start intake" CTA.
- In `src/app/(app)/settings/shared-links/page.tsx`, add a section "Example" with a single row linking to `/r/demo-navigable-record`. Hardcoded row; do not try to materialize it as a real SharedLink DB row.

**Patterns to follow.** Secondary-link typography from the check-in banner (`src/app/(app)/check-in/page.tsx:124-132`). Settings-shared-links row pattern.

**Test scenarios**
- **Happy path** — empty record shows demo link; click opens `/r/demo-navigable-record` in the same tab.
- **Happy path** — settings shared-links page shows the demo row.
- **Integration** — in `/r/demo-navigable-record`, navigation bar and share polish still render (plan 001 closeout).

**Verification.** Manual: new account (or prune records) → land on `/record` → see empty state with demo link. Follow it. Come back. No state pollution.

---

### U8 — Root `/` adds a returning-user sign-in CTA (no redirect)

**Goal.** Returning users on `/` reach sign-in with one prominent click, not a scan for the header link.

**Files**
- `src/app/page.tsx` — add a subtle "Sign in to your record →" link near the hero, possibly cookie-detected if practical

**Approach.** Minimal. Add a secondary CTA next to or below the primary "Begin assessment →" button, text: "Already signed up? Sign in →" with `href="/sign-in"`. Do not detect cookie state — that's server-side logic complexity for a marketing page. Rendering it unconditionally is fine.

**Patterns to follow.** Existing button/link styling from `src/app/page.tsx:30-35`. Don't introduce a new variant.

**Test scenarios**
- **Happy path** — root page renders both "Begin assessment" and "Sign in" CTAs, both link to correct paths.
- **Layout** — mobile + desktop, no horizontal overflow.

**Verification.** Manual: open `/` in a browser → both CTAs visible → "Sign in" navigates to `/sign-in`.

---

## Sequencing

U1, U2, U3 are independent single-file changes — parallel-safe, low-risk, cheap to ship first. Bundle as one PR titled something like `feat(ia): record-first entry points (U1–U3)`. This alone restores the plan-001 criterion-#1 promise and fixes the tab-highlight bug.

U4, U6 touch shared pages — sequential within `/record` and `/graph`. Second PR.

U5 is the riskiest (nav change, type change, icon addition). Ship on its own PR titled `feat(ia): graph tab replaces insights` so rollback is surgical if the shape feels wrong.

U7, U8 are small polish — fold into whichever PR has capacity or ship as a trailing closeout PR.

Recommended PR grouping:
- **PR A — U1, U2, U3** — wiring + pathToTab fix
- **PR B — U4** — home record card
- **PR C — U5** — bottom-nav swap (ship standalone so we can revert cheaply if it feels wrong)
- **PR D — U6, U7, U8** — share dialog mount + demo surfacing + root CTA

## Dependencies / Assumptions

- `/api/record/index` endpoint exists and returns totals + latest surface (verified in plan 001; reused by U4).
- `/api/graph` endpoint exists (verified, used by `/graph` today).
- `src/lib/share/scope.ts` exports a `record` scope compatible with `ShareDialog` (verified in plan 001).
- `/r/demo-navigable-record` route renders correctly (verified in plan 001 R9).
- Bottom-nav component accepts a `NavTab` union type; adding `'graph'` is a type change, not a runtime risk, as long as every call site is updated.
- No separate mobile-specific nav exists — the one `BottomNav` handles all breakpoints.
- Agent-native tools: plan 001 landed tools for record, topic, and graph surfaces. Adding ShareDialog entry points on `/record`/`/graph` does not introduce new required tools (share-create tool already exists); this plan does not regress agent parity.

## Risks

| Risk | Mitigation |
|---|---|
| **Users with genuinely empty graphs land on `/record` empty state instead of familiar `/home`** | Empty state from plan 001 is polished; U7 adds the demo record link. Net experience is better, not worse. Monitor session-abandonment if telemetry is wired. |
| **Bottom-nav tab swap breaks users' muscle memory for Insights** | Keep `/insights` as a reachable route; surface it from home's "devices" card. Monitor rage-clicks on the old Insights position. |
| **Home record-card's data fetch doubles API calls (one on home, another on /record)** | Acceptable — record-index is cached at the API layer; two calls per user session is negligible. If it matters later, lift state via a client cache. |
| **ShareDialog on `/graph` using `record` scope produces the same URL as share-from-`/record`** | Acceptable for MVP — they're the same data. If graph-specific scope is added later, swap in U6 is a one-line change. |
| **`pathToTab` ordering regression if a longer prefix is added later without updating order** | Converting to an array of `[prefix, tab]` tuples (U3 recommendation) makes ordering explicit; add a small unit test that feeds representative paths through the resolver. |

## Test Strategy

**Unit tests**
- U1: Vitest test of `FinishBar` that stubs `useRouter` and asserts `push('/record')` was called.
- U2: Vitest test of the verify route handler with mock session + user, asserting redirect location is `/record` when onboarded.
- U3: Vitest test of the `pathToTab` resolver with ≥10 representative paths (including `/record/source/abc`, `/topics/iron`, `/graph`, `/settings/shared-links`, unknown paths).

**Component tests**
- U4: Vitest component test of the new home record card with three fixture `LoadState` values (loading / empty / ready).
- U6: Vitest component test of `/record` page that asserts ShareDialog renders when the button is clicked.

**Manual / Playwright**
- Sign-in verify lands on `/record` for onboarded fixture user.
- Intake completion lands on `/record`.
- Every primary nav path highlights the correct tab at every depth.
- Bottom-nav shows `Home · Record · Graph · Protocol · You`.
- Empty-record user sees the demo link on `/record` and reaches `/r/demo-navigable-record`.

**Regression check**
- `/insights` still renders when navigated to directly.
- `/home` check-in flow still works (the banner from plan 001 closeout stays).
- Share flow on topic pages still works (U6 adds, doesn't remove).
- `/graph` list view still renders; desktop canvas placeholder still renders (plan 001 U13c TBD).

## Deferred to Implementation

- Whether the home record card fetches a dedicated "summary" endpoint or reuses `/api/record/index` (bias: reuse).
- Whether to add a distinct `graph` share scope or use `record` for both entry points (bias: reuse `record`).
- Exact copy for the home record card's "Latest" line — pick the most recent source OR the most recent topic promotion at implementation time based on what the API already returns.
- Whether the `/insights` devices-card link on home stays or gets retargeted — acceptable to leave as a dangling entry point since the page still works.
- Graph tab icon — pick a glyph at implementation; if nothing reads cleanly, adapt the existing `insights` glyph (three vertical bars) into a nodes-and-edges shape.

## Success Criteria

- A returning user signing in via magic link lands on `/record` (not `/home`).
- A user completing intake lands on `/record` (satisfies plan 001 criterion #1, finally).
- `/home` contains a Record card above the protocol card; clicking it navigates to `/record`.
- `/graph` has a bottom-nav tab; `/topics/*` and `/record/source/*` highlight the correct tab.
- `/record` and `/graph` each have a working Share button.
- `/r/demo-navigable-record` is reachable from `/record` empty state and `/settings/shared-links`.
- Bottom-nav is `Home · Record · Graph · Protocol · You` (subject to D4 confirmation).
- No regression in check-in, intake, topic, or share-from-topic flows.
- No regression in agent-native parity — every UI navigation path we're adding is either to an already-agent-accessible route or is a pure wiring change with no new action surface.

## Out-of-Band Follow-ups Worth Noting

Not part of this plan but surfaced by the audit — parked as future work:

- `/protocol`, `/insights`, `/you` moving from mock fixtures to graph-driven real data. R22 frames protocol as intervention nodes; insights should be R14's daily brief extended to weekly; `/you` should surface real state profile from the graph.
- Check-ins writing to graph nodes (R21) — right now they only persist to `localStorage`.
- A distinct `graph` share scope if graph-specific sharing (e.g. "share just my iron subgraph") becomes a need.
- `/` root landing redesign once the product story settles post-pivot.
- Breadcrumbs on `/topics/*` and `/record/source/*` — the active-tab fix in U3 restores the "where am I" signal minimally, but a breadcrumb on deep routes would be a cleaner move long-term.
