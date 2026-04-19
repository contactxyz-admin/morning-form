---
title: "feat: Add documents to record post-intake"
type: feat
status: active
date: 2026-04-19
origin: docs/brainstorms/2026-04-15-health-graph-pivot-requirements.md
---

# feat: Add documents to record post-intake

## Overview

After a user completes intake and lands on `/record`, there is currently no way to add further PDFs without restarting intake. Add a persistent "Add documents" affordance on `/record` that opens a drop-zone dialog, uploads each file through the existing `/api/intake/documents` pipeline, and refreshes the record index when anything lands. No tabs, no category picker — the server already auto-categorises via biomarker extraction and topic-promotion rules.

## Problem Frame

- User quote (2026-04-19): *"there's no way of uploading more docs in the health record after the first upload. i need to add more of my pdfs. and i shouldn't have to be the one to categorise them."*
- Today the only upload path is `/intake/upload`, which lives inside the tabbed intake flow. A user revisiting `/record` to add a new lab PDF has no entry point — they would have to navigate back through intake.
- Upload success on `/api/intake/documents` already triggers biomarker extraction, `ingestExtraction`, and topic promotion in [src/app/api/intake/documents/route.ts:215-216](src/app/api/intake/documents/route.ts#L215-L216). The server is the classifier. The friction the user is objecting to is the **UI** forcing them to pick a tab, not the underlying pipeline.

The origin requirements document (R7, R15-R16) expects the record to be a living surface: intake produces a partial graph, uploads *promote* topic stubs, and provenance is traceable. A persistent add-documents affordance on `/record` is the natural home for that promotion trigger once intake is done.

## Requirements Trace

- R1. A user viewing a populated `/record` can drop a PDF directly from that page, without navigating away.
- R2. Dropped files go through the existing `/api/intake/documents` pipeline unchanged (same auth, dedup, extraction, promotion).
- R3. The user is not asked to choose a category, tab, or topic before uploading. Any routing is server-side.
- R4. The record view refreshes after a successful upload so new sources, nodes, and promoted topics appear without a manual reload.
- R5. Per-file failures are surfaced with the same kind/detail granularity the intake finish-bar uses (see [src/components/intake/finish-bar.tsx:50-57](src/components/intake/finish-bar.tsx#L50-L57)) — "Something went wrong" is not acceptable given recent prod debugging involved extracting `kind` from the API (PR #74).
- R6. Agent-native parity is preserved — the `/api/intake/documents` endpoint is already agent-callable; no new human-only surface is introduced.

## Scope Boundaries

- Not restructuring the intake flow itself. The upload/history/essentials tabs stay as the first-time onboarding surface. This plan only adds a post-intake re-entry point.
- Not adding server-side content classification for non-PDF content (text history, structured essentials). PDFs only, same `ALLOWED_MIME` gate as `/api/intake/documents`.
- Not adding a `/api/intake/documents` variant or a new route. This is UI-only.
- Not changing the empty-state path on `/record` — a user with zero sources still gets sent to `/intake` because essentials/history matter for the first pass.
- Not building progress bars or resumable uploads. Simple sequential POSTs with per-file status, matching the finish-bar pattern.

### Deferred to Separate Tasks

- Option (2) from the scope-check conversation — collapsing the whole intake flow into a single drop-any-file surface with server-side content routing. Tracked as a future plan if the minimal affordance proves insufficient.

## Context & Research

### Relevant Code and Patterns

- [src/components/intake/upload-tab.tsx](src/components/intake/upload-tab.tsx) — existing drop-zone visual treatment (Card + label + hidden file input + drag-over state). Reuse the aesthetic, but not the zustand staging — this flow uploads immediately.
- [src/components/intake/finish-bar.tsx:22-79](src/components/intake/finish-bar.tsx#L22-L79) — the reference pattern for per-file POST loop with `FormData`, status/kind/detail extraction, and multi-line error rendering. This plan's dialog implements the same loop, without a "finish" step.
- [src/components/share/share-dialog.tsx](src/components/share/share-dialog.tsx) — reference pattern for dialogs in this codebase: `framer-motion` `AnimatePresence`+`motion`, `open`/`onClose` props, inline `DialogState` union. Follow this structure.
- [src/components/record/record-index.tsx](src/components/record/record-index.tsx) — where the trigger button mounts. Already accepts `data: RecordIndexData` as a prop; extend props to take a `onDocumentsAdded` callback so the dialog can trigger a parent refetch.
- [src/app/(app)/record/page.tsx:18-45](src/app/(app)/record/page.tsx#L18-L45) — the fetch-to-state pattern for `/api/record/index`. Extract the fetch function so it can be re-invoked after a successful add.
- [src/app/api/intake/documents/route.ts](src/app/api/intake/documents/route.ts) — server endpoint (unchanged). Note existing response shape: `{ documentId, deduped, chunkCount, biomarkerCount?, promotedTopics? }`. `deduped: true` is a success case and must not be surfaced as a failure.

### Institutional Learnings

- Recent prod debugging (PRs #71-#75) established that upload failures need `kind` + `detail` surfaced to the UI, not generic status codes. The add-documents dialog must copy that pattern verbatim from `finish-bar.tsx` — anything less regresses the observability the intake flow fought to get.
- `/api/intake/documents` runs up to 300s per file with LLM extraction ([src/app/api/intake/documents/route.ts:57](src/app/api/intake/documents/route.ts#L57)). Sequential uploads keep the UX honest about duration. Parallel uploads would risk lambda concurrency limits and confusing progress reporting — sequential is the right default for this affordance.

### External References

- None. This is a small UX addition that reuses existing patterns end-to-end.

## Key Technical Decisions

- **Dialog over navigation.** Opening an inline dialog (matching `ShareDialog`) is the right shape. Navigating to `/intake/upload` would drop the user back into a tabbed flow that's the exact friction they're objecting to.
- **Upload immediately, don't stage.** The intake flow stages files in zustand so users can complete tabs out of order and Finish once. Post-intake there's no "Finish" step — the user's goal is "add this one file to my record." Upload on drop, show per-file status, auto-close on all-success after a short dwell so the result is legible.
- **Sequential uploads, not parallel.** Each file hits the LLM extraction pipeline (up to 300s). Sequential keeps progress honest, avoids concurrency-limit surprises, and matches how `finish-bar.tsx` already does it.
- **Refresh via parent callback, not router.refresh().** The record page fetches `/api/record/index` on mount as a client-side `useEffect` — `router.refresh()` wouldn't rerun it. Lift the fetch function out of the `useEffect` so the dialog can invoke it directly on success.
- **Don't share the drop-zone component with intake.** The intake upload-tab stages files into the intake store; this flow uploads immediately. Different state shapes, different success semantics. Duplicating ~40 lines of drop-zone visual markup is cleaner than forcing a polymorphic component that hides both flows inside branching props. If a third caller appears later, extract then.
- **Trigger placement: top-right header action.** The existing `/record/page.tsx` already has a right-aligned "Shared links →" link. Add "Add documents" to the same row, left of Shared links, as a Button (not a link) to signal it's an action rather than navigation. Visible only in the loaded + non-empty state; empty state keeps its existing "Add your first source → /intake" CTA.
- **Accept PDFs only in v1.** Match `/api/intake/documents`'s `ALLOWED_MIME` gate (`application/pdf`). The intake upload-tab currently accepts `image/*` too but those would 400 at the API — the add-documents dialog should pre-filter client-side to avoid a confusing error.

## Open Questions

### Resolved During Planning

- *Should empty-state `/record` also get the new dialog?* No — empty state still routes to `/intake` because essentials/history matter for the first-run graph. The dialog is post-intake only.
- *Should the dialog auto-close on success?* Yes, after a short dwell (~900ms) so the success state is visible. If any file failed, the dialog stays open with the failure list — user closes manually.
- *Should we dedupe successes client-side?* No. The API returns `deduped: true` on content-hash match; treat it as success and surface "(already in your record)" so the user understands why nothing new appeared.
- *What does "refresh" actually reload?* Re-invoke the `/api/record/index` fetch the page already does on mount. It returns the full `RecordIndexData` including topics, graphSummary, and recentActivity — enough to reflect new sources and promoted topics.

### Deferred to Implementation

- Exact framer-motion transition values for the dialog (match `ShareDialog`'s feel during implementation rather than codifying here).
- Whether to show an inline toast-style confirmation ("2 documents added · Iron status promoted") after close, or rely solely on the record re-rendering. Try the simpler path (record re-render speaks for itself) and upgrade if it feels invisible.
- Whether to surface `promotedTopics` in the dialog's success state. Worth trying during implementation — it's a delightful detail — but not load-bearing for the plan.

## Implementation Units

- [ ] **Unit 1: Add-documents dialog component**

**Goal:** A dialog that opens from a trigger prop, presents a drop zone for PDFs, uploads each file sequentially to `/api/intake/documents`, and reports per-file success/failure with the same kind/detail surfacing the finish-bar uses.

**Requirements:** R1, R2, R3, R5

**Dependencies:** None.

**Files:**
- Create: `src/components/record/add-documents-dialog.tsx`

**Approach:**
- Mirror [src/components/share/share-dialog.tsx](src/components/share/share-dialog.tsx)'s shell: `open`/`onClose`/`onCompleted` props, `AnimatePresence` + backdrop + `motion.div` card, inline `DialogState` union for idle/uploading/done.
- Drop-zone visual: copy the Card + label + hidden input + drag-over styling from [src/components/intake/upload-tab.tsx:47-112](src/components/intake/upload-tab.tsx#L47-L112). PDFs only (`accept="application/pdf"`), multiple allowed.
- Per-file state shape: `{ id, name, status: 'pending' | 'uploading' | 'success' | 'deduped' | 'error', detail?, kind? }`. Render as a small list below the drop zone once any file is in-flight.
- Upload loop: identical shape to [src/components/intake/finish-bar.tsx:26-49](src/components/intake/finish-bar.tsx#L26-L49) — `FormData.append('file', file)`, `fetch('/api/intake/documents', { method: 'POST', body: fd })`, extract `kind` + `detail` from JSON body on non-OK. Sequential, not parallel.
- Distinguish `deduped: true` in the success body from a fresh success — label as "Already in your record" so the user understands why the record didn't change for that file.
- On all-success (including deduped), invoke `onCompleted()` and auto-close after ~900ms. On any failure, keep dialog open with the failure list until user closes.
- Dialog close semantics: if uploads are in flight, disable the close affordance (escape key + backdrop click + X button) rather than aborting — an in-flight lambda costs ≤300s of LLM work per file, not worth losing.

**Patterns to follow:**
- [src/components/share/share-dialog.tsx](src/components/share/share-dialog.tsx) — dialog shell, framer-motion usage, `DialogState` union pattern.
- [src/components/intake/upload-tab.tsx](src/components/intake/upload-tab.tsx) — drop-zone markup and drag-over styling.
- [src/components/intake/finish-bar.tsx:26-57](src/components/intake/finish-bar.tsx#L26-L57) — per-file upload loop, error extraction, multi-line error rendering (`whitespace-pre-line`).

**Test scenarios:**

Per repo convention, components are verified manually in the browser (vitest runs only `src/**/*.test.ts`, no JSX test harness exists). The following scenarios are the manual verification checklist.

- Happy path: drop one PDF into an opened dialog → row shows "uploading" → resolves to "added" → dialog auto-closes ~900ms later → parent record view reflects the new source and any promoted topic.
- Happy path: drop three PDFs → rows process sequentially top-to-bottom → all resolve to "added" → single auto-close.
- Edge case: drop a PDF whose content hash matches an existing source → row shows "Already in your record" → still counts toward auto-close.
- Edge case: drop mix of one fresh PDF + one duplicate → one "added", one "Already in your record" → auto-close triggers (parent refresh still runs because at least one new).
- Edge case: drop a non-PDF file (e.g. `.jpg`) → client pre-filter rejects before POST, inline message "PDF only for now" — confirms we don't surface the server's 400.
- Error path: simulate a 422 `malformed_pdf` (use the deliberate-fail fixture from recent prod debugging) → row shows filename + "malformed_pdf: Setting up fake worker failed…" (first ~150 chars) → dialog stays open, no auto-close.
- Error path: simulate a 502 LLM error (disconnect API key locally) → row shows kind (`LLMAuthError` etc.) → dialog stays open.
- Error path: network drop mid-upload → row shows status 0 with "network error" → dialog stays open.
- Integration: after a success auto-close, `/api/record/index` is re-fetched exactly once, and the record view rerenders with the new data (verify via devtools network tab).
- Accessibility: dialog traps focus while open; escape closes only when no uploads are in flight; the drop-zone label is keyboard-activatable (matches upload-tab).

**Verification:**
- Manual runthrough of the scenarios above passes.
- `npm run typecheck` and `npm run build` clean for the new file.
- No new test file is added (matches repo convention for UI components).

---

- [ ] **Unit 2: Mount dialog in record view and wire refresh**

**Goal:** Render the dialog's trigger on `/record` in the populated state, lift the record-index fetch so the dialog can invoke it on success, and confirm the resulting rerender shows new sources/topics.

**Requirements:** R1, R4, R6

**Dependencies:** Unit 1.

**Files:**
- Modify: `src/app/(app)/record/page.tsx`
- Modify: `src/components/record/record-index.tsx`

**Approach:**
- In `page.tsx`, extract the `/api/record/index` fetch from the `useEffect` into a stable `refreshRecord` function returned from a small `useCallback`. The `useEffect` invokes it on mount with a cancellation guard; the dialog invokes it again after uploads.
- Pass `refreshRecord` as an `onDocumentsAdded` prop to `<RecordIndex>`. `RecordIndex` forwards it to the dialog trigger.
- In `record-index.tsx`, render the Add-documents trigger + dialog in the non-empty branch. Placement: a small button in the top-right of the `<header>` block (to the left of where the "Shared links →" link currently sits on the page-level layout, though that link is on `page.tsx` not `record-index.tsx` — keep the new trigger inside `record-index.tsx`'s header for scope cleanliness, sibling to the `<h1>`).
- Empty state path (graphSummary.sourceCount === 0) stays unchanged — keep sending first-run users through `/intake`.
- Use the existing `Button` primitive (`variant="secondary"` or similar — check what visual weight feels right next to the existing header typography during implementation).
- No changes to the `/record/source/[id]/page.tsx` subroute — that's a drill-down on a single document, out of scope.

**Patterns to follow:**
- [src/app/(app)/record/page.tsx:15-45](src/app/(app)/record/page.tsx#L15-L45) — existing fetch-to-state shape; extend it, don't rewrite it.
- [src/components/record/record-index.tsx:15-75](src/components/record/record-index.tsx#L15-L75) — existing header markup; add the trigger inside the header's top row, not as a floating element.

**Test scenarios:**

- Happy path: open `/record` with existing sources → trigger button visible in header → click → dialog opens → drop PDF → dialog closes → record index rerenders showing incremented source count and any new/promoted topics.
- Happy path: upload a PDF whose biomarkers match the `iron` promotion rule ([src/app/api/intake/documents/route.ts:66-70](src/app/api/intake/documents/route.ts#L66-L70)) while the Iron topic is a stub → after success, record view shows Iron status promoted to full status in the topics grid.
- Edge case: open `/record` with zero sources → trigger button is NOT rendered → existing empty-state "Add your first source → /intake" CTA is still the only upload path.
- Edge case: loading and error states of `/record` (unchanged) — trigger button doesn't render until data is ready.
- Integration: concurrent — user opens the dialog, a background refresh fires, dialog completes and triggers another refresh → no duplicate requests in flight (the fetch function short-circuits the stale one via the cancellation guard).
- Agent-native parity: confirm `/api/intake/documents` still responds identically; no new route was added, no existing route was modified, so any agent using the current endpoint continues working.

**Verification:**
- Manual runthrough of the scenarios above passes.
- `npm run typecheck` and `npm run build` clean.
- `npm run test` (existing vitest suite) passes — no existing tests should be affected since `/api/intake/documents` is unchanged.
- Deploy to a preview environment, upload a known-good lab PDF from the record page, confirm biomarkers and topics appear.

## System-Wide Impact

- **Interaction graph:** No new server-side callbacks. The dialog calls the existing `/api/intake/documents` endpoint which already runs `ingestExtraction` + `promoteTopics`. Record page refetches `/api/record/index` on success.
- **Error propagation:** Each file's upload failure is captured independently; one failure does not abort the batch. Dialog surfaces kind + detail per file, matching finish-bar.
- **State lifecycle risks:** If the user closes the browser tab mid-upload, the in-flight lambda continues and the file may persist (intended — the user can re-open `/record` and see it appear). No client-side staging state to leak.
- **API surface parity:** `/api/intake/documents` is unchanged. The existing intake finish-bar flow continues to call it identically. Agent callers are unaffected.
- **Integration coverage:** The manual verification scenarios in Unit 2 exercise the full chain (dialog → POST → ingestExtraction → promoteTopics → GET /api/record/index → rerender). No unit test with mocks can prove the promotion → index-refetch → rerender chain, which is why manual verification with a fixture PDF matters.
- **Unchanged invariants:** `/api/intake/documents` request/response shape, auth via `getCurrentUser`, 20MB size cap, PDF-only `ALLOWED_MIME`, content-hash dedup. The intake flow's upload-tab + finish-bar continue to work unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| User opens dialog during a long-running prior upload and closes browser — file uploads in background but UI never reflects it. | Accepted. `/record` refetches on next visit; the file is in the DB via the lambda. This is the same failure mode as the intake finish-bar today. |
| Parallel uploads from multiple tabs cause duplicate extraction work. | Mitigated by content-hash dedup at [src/app/api/intake/documents/route.ts:130-140](src/app/api/intake/documents/route.ts#L130-L140) — second upload of same bytes short-circuits. |
| Close-disabled-during-upload feels broken if a user changes their mind. | The dialog rows show progress; close re-enables on completion. A cancel button isn't worth the server-side abort plumbing for v1. |
| `refreshRecord` fires before `promoteTopics` transaction commits, showing stale data. | Not a real risk — the API response is awaited before the dialog calls `onCompleted`, and `promoteTopics` runs inside the same request handler after `ingestExtraction` resolves. |
| A user mixes non-PDF files in a multi-drop. | Client-side pre-filter rejects non-PDFs with an inline message; only PDFs proceed to POST. |

## Documentation / Operational Notes

- No monitoring changes — existing `[API] intake/documents …` logs from PR #74 cover the new flow since the endpoint is unchanged.
- No feature flag. The affordance is strictly additive and low-risk; gate by merging the PR behind the normal review.
- No migration or rollout step.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-15-health-graph-pivot-requirements.md](docs/brainstorms/2026-04-15-health-graph-pivot-requirements.md) — R7 (never block value behind upload), R15-R16 (record is the primary surface, provenance-first).
- Related code: [src/components/intake/finish-bar.tsx](src/components/intake/finish-bar.tsx), [src/components/intake/upload-tab.tsx](src/components/intake/upload-tab.tsx), [src/components/share/share-dialog.tsx](src/components/share/share-dialog.tsx), [src/app/api/intake/documents/route.ts](src/app/api/intake/documents/route.ts), [src/components/record/record-index.tsx](src/components/record/record-index.tsx), [src/app/(app)/record/page.tsx](src/app/(app)/record/page.tsx).
- Related PRs: #71 (Vercel Blob), #72 (externalize native deps), #73 (DOM polyfill), #74 (observability), #75 (worker-trace fix) — the chain that made post-intake uploads actually work in prod, which is what unblocks this affordance being useful.
- User quote (Slack-equivalent, conversation 2026-04-19): *"there's no way of uploading more docs in the health record after the first upload. i need to add more of my pdfs. and i shouldn't have to be the one to categorise them."*
