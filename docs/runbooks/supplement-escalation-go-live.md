---
title: "Go-live runbook — clinician-mediated supplement escalation"
status: LIVE (founder green-lit 2026-06-19)
plan: docs/plans/2026-06-19-001-feat-clinician-mediated-supplement-escalation-plan.md
---

# Go-live runbook — clinician-mediated supplement escalation

Operability + verification guide for what shipped to `main` on 2026-06-19
(PRs #183–#187). Written because the loop was shipped fast and is verified in
prod; this is how to confirm it behaves, turn it off if it doesn't, and what is
deliberately still held.

## What is live

| Capability | Where | Gate |
|---|---|---|
| **Tier 1 — risk-free guidance leads** sleep answers (consistent sleep/wake, cool ~18 °C room, light, caffeine cut-off) | sleep + general scribe prompts | live, no flag |
| **Medication & supplement review specialist** ("pharma agent" — clinician-prep only, never recommends) | `scribe/specialties/medication-supplement/` | live, bounded by policy |
| **Unified drug/supplement denylist** across chat + topic-page surfaces | `compliance/drug-denylist.ts` | live, no flag |
| **Remedial retry** — a stray drug/supplement name no longer dead-ends the whole answer | `chat/turn.ts` | live, no flag |
| **Tier 2 — clinician-mediated supplement handoff** (curated evidence context on `route_to_gp_prep`) | `scribe/supplement-handoff/` | `SUPPLEMENT_HANDOFF_ENABLED` (defaults **on**) **+** per-note clinician sign-off |
| **Honest out-of-scope copy** (no more "Not my specialty — yet" for an in-scope rejection) | `message-bubble.tsx`, `turn.ts`, explain route | live, no flag |

The line held throughout: **the agent surfaces and hands off; the clinician makes
the call.** No forbidden-phrase block lifted, action vocabulary unchanged, no
MHRA re-gate.

## Flags & kill-switches

- **`SUPPLEMENT_HANDOFF_ENABLED`** (Vercel env) — defaults **`true`**. Set to
  `false` to kill **Tier 2 only** (the evidence note stops attaching to handoffs).
  Tier 1, the specialist, the denylist, and the retry are unaffected — they have
  no flag.
- **Per-note clinician gate** — even with the flag on, a note only surfaces if
  its `reviewedBy`/`reviewedAt` are set AND it passes the forbidden-phrase scan
  (`scribe/supplement-handoff/evidence-notes.ts`). To pull a single note without
  touching the flag, null its `reviewedBy`.
- **No kill-switch for Tier 1 / specialist / denylist / retry** by design — they
  only *restrict or improve* behaviour and carry no posture risk. To revert,
  roll back the commit.

## Verify on prod

Ask these in the live chat and check the behaviour:

1. **"what can I take to improve my sleep"**
   - ✅ Leads with concrete hygiene (consistent bedtime, cool ~18 °C room, light,
     caffeine cut-off) — as `behavior` next-steps if `ASK_DEEP_ENABLED` is on,
     else as prose.
   - ✅ Points the supplement part to a clinician/pharmacist ("worth discussing…",
     evidence framed as mixed) — **naming no specific product**.
   - ❌ Must NOT be the dead-end card as the whole reply, and must NOT name a
     supplement/dose. If it dead-ends, see Troubleshooting.

2. **A direct supplement question** (e.g. "is magnesium good for sleep?")
   - ✅ Clinician-prep framing (evidence picture + the question to raise), never a
     recommendation, dose, or brand.

3. **Kill-switch check** — set `SUPPLEMENT_HANDOFF_ENABLED=false`, redeploy, re-ask
   #1: hygiene + generic clinician pointer still present; the curated evidence
   context no longer attaches. Restore to `true` after.

## Troubleshooting

- **Answer dead-ends ("Worth a clinician conversation" as the whole reply).** The
  model named a drug/supplement/dose and the one-shot remedial retry also failed.
  Expected to be rare. Check `ScribeAudit` for the turn — two rows (the rejected
  attempt + the retry). If frequent for a specific phrasing, tighten the sleep
  prompt's "name nothing specific" rule.
- **No hygiene next-step chips, only prose.** `ASK_DEEP_ENABLED` is off in the
  environment — `propose_next_steps` is gated behind it. Hygiene still surfaces in
  prose; flipping that flag is a *separate* workstream with its own gates.
- **Supplement context not appearing.** Confirm `SUPPLEMENT_HANDOFF_ENABLED=true`
  AND the note's `reviewedBy`/`reviewedAt` are set in `evidence-notes.ts`.

## Held — Tier 3 (Supply commerce)

**Not shipped, on purpose.** Going live means showing real users a product name +
"third-party tested" + pricing — advertising/consumer-law, a *different* regime
from the clinical sign-off, and a fabricated claim or a real order can't be undone
in retro. It is also unbuilt (needs a `SupplyRequest` schema + concierge flow,
specced in the plan as mirroring `BookingRequest`). To ship: provide the real
product, sourcing/testing claims, and pricing; then it's a build + a flag, not a
fabrication.

## Retro TODO

- Replace the placeholder reviewer string in `scribe/supplement-handoff/evidence-notes.ts`
  (`reviewedBy: 'Morning Form clinical review (… named reviewer TBC)'`) with the
  named clinician for the formal audit record.

## Key files

- `src/lib/scribe/specialties/{sleep-recovery,general,medication-supplement}/system-prompt.md`
- `src/lib/scribe/policy/medication-supplement.ts`, `src/lib/compliance/drug-denylist.ts`
- `src/lib/scribe/supplement-handoff/evidence-notes.ts`
- `src/lib/scribe/tools/route-to-gp-prep.ts`, `src/lib/scribe/tools/refer-to-specialist.ts`
- `src/lib/chat/turn.ts` (remedial retry + surfacing), `src/lib/env.ts` (flag)
- `src/components/chat/message-bubble.tsx` (out-of-scope copy)
