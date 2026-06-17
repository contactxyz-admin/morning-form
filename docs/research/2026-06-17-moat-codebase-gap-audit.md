---
date: 2026-06-17
topic: moat-codebase-gap-audit
type: research
relates_to: docs/brainstorms/2026-06-17-done-for-you-orchestration-requirements.md
---

# Codebase Gap Audit — Done-For-You Moat vs. What's Actually Built

## What this is

A read-only audit of the codebase against the locked strategy
(`docs/brainstorms/2026-06-17-done-for-you-orchestration-requirements.md`): the
moat lives in three code layers — **data** (one clean longitudinal record),
**orchestration** (we run the loop: draw → baseline → one action → retest), and
**trust/enforcement** (in-lane posture, grounded, clinician-routed) — proven by a
single pilot metric, **retention-to-retest**. Four parallel agents audited each
pillar; load-bearing "missing"/"schema-change" claims were spot-verified directly.

## Headline

**The moat layers are more built than the older 2026-06-05 brainstorm assumed —
but the product cannot yet *close the loop on its own*, and cannot *measure
whether it did.*** The single strongest theme across all four audits is the
**"return leg":** the loop is genuinely built up to touchpoint 3 (book → draw →
baseline → one action, with a lifecycle and a frozen before/after outcome
snapshot), but **touchpoint 4 — bringing the user back to retest — exists neither
as a mechanism (no scheduler/nudge) nor as a measurement (retention-to-retest is
not representable in the schema).** That is the same gap twice, and it is exactly
the thesis the pilot is supposed to validate. Second: the just-locked in-lane
posture relies on human enforcement surfaces that **do not exist yet**, and the
phrase scanners miss precisely the seductive phrases the founder flagged.

## What is already built (do NOT rebuild)

| Capability | Status | Evidence |
|---|---|---|
| Action lifecycle (suggested→accepted→completed→outcome-measured) + frozen before/after `ActionOutcome` snapshot — "the loop visibly closes" | **REAL** | `prisma/schema.prisma:788–839`; `src/lib/actions/lifecycle.ts`; `POST /api/actions/[id]/transition`, `/outcome` |
| Decisions timeline (chronological, outcome cards, booking absorption) | **REAL** (flag `DECISIONS_ENABLED`) | `src/app/(app)/decisions/page.tsx` |
| "What moved" panel-diff (`classifyChange`/`diffLatestPanels`), surfaced to users | **REAL** (flag `LONGITUDINAL_GRAPH_ENABLED`) | `src/lib/markers/panel-diff.ts:81–159`; `/api/markers/changes` |
| Concierge booking (request/ops/reveal/cancel, encrypted code, state machine) | **REAL** | `prisma/schema.prisma:847–865`; `src/app/api/booking/*`; runbook |
| Lab ingestion → graph biomarker + dated observation nodes, with `SourceChunk` provenance | **REAL** | `src/app/api/intake/documents/route.ts`; `src/lib/intake/lab-observations.ts` |
| Wearable storage (`HealthDataPoint`, 26-metric canonical registry, dedup) | **REAL** | `prisma/schema.prisma:534–549`; `src/lib/health/sync.ts`, `canonical.ts` |
| Lab + wearable unified at read layer (`buildMarkerTrajectory` + metric-alias map) | **REAL but flag-gated OFF** | `src/lib/markers/trajectory.ts:71–91`; `metric-aliases.ts` |
| Safety policy + `JudgmentKind` enum + per-topic policies + `enforce()` | **FULLY ENFORCED** | `src/lib/scribe/policy/types.ts:13–40`, `enforce.ts:56–133`, six policy files |
| Forbidden-phrase scanning (drugs/doses/directives/diagnostic-claims), static **and** LLM-output linter | **STRONG** (but incomplete — see P0-3) | `src/lib/compliance/static-copy.test.ts`; `src/lib/llm/linter.ts`; `forbidden-phrases.ts` |
| Clinician handoff routing (`route_to_gp_prep`, out-of-scope routing) | **REAL** | `src/lib/scribe/tools/route-to-gp-prep.ts`; `enforce.ts:56–78` |
| Token encryption (AES-256-GCM, env-gated) | **OK** | `src/lib/health/crypto.ts:24–42` |
| Activation funnel stages 1–6 (signup → grounded answer) | **OK** | `src/lib/metrics/activation-funnel.ts`; `scripts/metrics/activation-funnel.ts` |

**Intentionally NOT built (scope-bounded, not gaps):** `Studio` / `Appointment` /
`Slot` / `Supply` / `Product` / `Order` models — deck Layers I & III are deferred
("Studios pilot at month 9"; Supply commerce paused). Demo commerce is canned,
client-side only.

---

## Prioritized gaps

### P0 — Blockers (each kills a locked-strategy promise)

**P0-1 · The retest nudge (touchpoint 4) does not exist.**
No scheduler/cron anywhere (verified: no `api/cron`, no `vercel.json` crons, no
job queue / `node-cron` / `bullmq`). `UserPreferences` has `notifyProtocol` /
`notifyWeekly` toggles but **no code acts on them**; `BookingRequest` has no
`dueAt` / `retestScheduledFor`. So nothing brings the user back at a cadence — the
user still has to remember, which is the exact labour the product promises to
remove. *Strategy hit:* breaks "we run the loop for you" at the most important
moment (the compounding step). *Fix shape:* a retest-cadence model + a scheduled
job (Vercel Cron is the lightest path) that emits a nudge and a pre-staged rebook.
*Evidence:* `src/app/api/health/sync/route.ts` (manual only); search for
cron/schedule/nudge/retest returns only marketing copy + unwired prefs.

**P0-2 · Retention-to-retest (R10) is not representable — needs a schema change.**
`AssessmentResponse.userId @unique` (verified, `prisma/schema.prisma:412`) means a
**second assessment cannot be stored**; there is no retest / second-draw event
type; the activation funnel's `retained-7d` stage counts *any* `ChatMessage` or
`HealthDataPoint` activity, conflating "came back" with "came back to retest."
*Strategy hit:* the **headline pilot validation metric cannot be measured at all**
today. *Fix shape:* model multiple draws/assessments per user (versioned table or
`drawNumber`/`precedingId`), add retest lifecycle `FunnelEvent` types, extend the
funnel with a true "second draw completed" stage. *Evidence:*
`prisma/schema.prisma:410–417`; `src/lib/metrics/activation-funnel.ts:228–271`;
`src/lib/funnel/event.ts:15–42`.

**P0-3 · In-lane copy enforcement has the exact gap the founder predicted.**
The phrase scanners are strong on *syntax* (drug names, dose strings, "take N
tablets", diagnostic "you have X") but **miss the seductive phrases** that cross
the line while passing the scan: "the one thing to do," "whether the thing you
changed worked / cured / fixed," "our clinicians decide what's next," "what's
wrong with you." No patterns for `worked|cured|fixed` (causal n=1), prescriptive
"the one," or agency "decides." And the **human enforcement surfaces the locked
posture explicitly depends on do not exist**: no `brand-guidelines.md`, no
clinician-review checklist, and the **allowed** action vocabulary
(measure/track/discuss/behaviour) is prose only — only the *forbidden* list is
typed/enforced. *Strategy hit:* "the line is enforced in copy, and copy drifts" —
the line is currently unguarded against drift. *Fix shape:* add causal/prescriptive
phrase patterns to `linter.ts` + `static-copy.test.ts` (with fixtures); author
`docs/brand-guidelines.md` + `docs/compliance/clinician-review-checklist.md` as
the canonical surfaces (the brainstorm's vocabulary table is ready to lift); add a
positive-list action-verb validator. *Evidence:* `src/lib/llm/linter.ts:144–184`;
`src/lib/compliance/static-copy.test.ts:61–99`; no brand/checklist docs exist.

### P1 — High value (the moat's intelligence runs on partial context)

**P1-1 · The scribe doesn't see lab history — only wearable.**
`recognize_pattern_in_history` queries `HealthDataPoint` only; it never invokes
`buildMarkerTrajectory` or reads dated lab observation nodes. So an Ask answer
reasons over wearable trends but **not the user's longitudinal bloods** — the
"reasons over your complete context" promise (Phase A R1) is structurally
incomplete, and bloods are the *backbone* the strategy leans on. *Fix shape:* wire
the unified trajectory into scribe context injection. *Evidence:*
`src/lib/scribe/tools/recognize-pattern-in-history.ts`; `src/lib/scribe/execute.ts`.

**P1-2 · The unified longitudinal record is flag-gated OFF by default.**
`LONGITUDINAL_GRAPH_ENABLED` defaults off; when off, the trajectory reader ignores
dated observation instances and metric-alias expansion and can fall back to a
single stale `latestValue`. The "one clean longitudinal record" exists but is
hidden, all-or-nothing. *Fix shape:* verify readiness and flip on (observations
are written unconditionally, so no backfill gap); consider per-user staging.
*Evidence:* `src/lib/markers/trajectory.ts:34–36,140–194`.

**P1-3 · The flag taxonomy (attention / clinician-discussion / escalation) is
demo-only at runtime.** `FlagTier` is fully typed and rendered in the demo via a
CMO-authored matrix, but the **authed path never sets `NodeInterpretation.flag`** —
the CMO-locked taxonomy isn't live in production. *Fix shape:* compute and persist
flags on the real interpretation path. *Evidence:* `src/types/graph.ts:84–100`
("Demo-only and additive"); `src/lib/markers/flag-presentation.ts`.

**P1-4 · Trend math is minimal.** Pattern/trajectory output is count/first/last/avg;
no slope, direction, or percent-change, and outcome cards don't compute a delta —
so "here's what moved" is shown as raw values, not an interpreted movement. *Fix
shape:* add direction/percent-change to the trajectory + outcome readers.
*Evidence:* `src/lib/scribe/tools/recognize-pattern-in-history.ts:46–52`.

### P2 — Passive data backbone is scaffolding, not reality (R4)

**P2-1 · Passive wearable pull doesn't exist; 4 of 6 providers return mock data.**
Sync is manual-only (no scheduler — same root as P0-1), token refresh is reactive,
and Whoop / Oura / Fitbit / Google Fit `get*()` return **hardcoded mock arrays**;
only Dexcom/Libre have real (token-gated) fetches. Garmin is blocked on Terra /
Garmin-program approval (`provider_application_required`); Apple Health needs the
native app. *Strategy note:* the pilot can run on bloods alone, so this is
sequenced **after** the loop closes — but the "zero-effort backbone" claim is not
real today. *Evidence:* `src/lib/health/whoop.ts:139–151` (mock) and peers;
`src/app/api/health/sync/route.ts`; `docs/HEALTH_PROVIDER_SETUP.md:158–180`.

### P3 — Lower (hardening / completeness)

- **P3-1 · Grounding is measured, not gated.** No threshold gate blocks a
  low-grounding answer; the metric is post-hoc. `src/lib/metrics/hybrid-retrieval-grounding.ts`.
- **P3-2 · No in-app clinician-review/escalation queue** — review is doc/PR-based
  (`docs/compliance/clinical-review-outreach.md`). Acceptable for MVP; no runtime
  re-review if output drifts.
- **P3-3 · Wearable provenance partial** — `HealthDataPoint` carries provider only,
  no link to `RawProviderPayload`.
- **P3-4 · Lab-name harmonization manual** — unmapped analytes drop; no fuzzy
  fallback. Low at current scale.
- **P3-5 · No event on wearable ingestion / connection** — can't distinguish
  passive vs manual sync in analytics.

---

## Correction to prior assumptions

The 2026-06-05 deck-gap brainstorm stated "answers don't end in actions" and "the
decision timeline doesn't exist." **Both are now false** — the Action lifecycle,
`ActionOutcome` snapshots, and the Decisions timeline are shipped (Phase B). Plans
should not re-spec these.

## Recommended sequencing (next `/ce:plan` candidates)

1. **Close + measure the return leg (P0-1 + P0-2 together).** They share a root
   (no scheduler) and a purpose (prove retention-to-retest). This is the highest-
   leverage work: it makes the loop self-running *and* makes the thesis measurable.
2. **Hold the line we just locked (P0-3).** Author the brand-guidelines +
   clinician-review checklist and add the causal/prescriptive phrase patterns —
   cheap, and the locked posture is undefended without them.
3. **Feed the intelligence its full context (P1-1, then P1-2/P1-3).** Wire lab
   history into the scribe and turn the longitudinal record on; light up the CMO
   flag taxonomy in production.
4. **Make the passive backbone real (P2-1)** once the loop closes.
