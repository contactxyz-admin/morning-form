---
date: 2026-06-17
topic: done-for-you-orchestration
---

# Done-For-You Orchestration: "You don't run this. We do."

## Problem Frame

Amy Deng's essay ("I Solved My Mystery Fatigue with AI", 2026-06-16) reads as a
how-to for self-directed health investigation. The sharper reading inverts it:
Amy is not a target user, or even an aspirational one — she is **proof of the
problem**. She is the most capable, most motivated person imaginable for this: an
AI researcher with a serious, multi-system health mystery. And resolving it still
cost her *hundreds of hours, browser automation across four data sources,
frontier-model elicitation, and ~20 minutes of manual logging a day.* If the most
equipped person alive has to work this hard, the takeaway is **not** "ship the tool
that lets people do what Amy did." It is: **almost nobody can or will do what Amy
did, and they shouldn't have to.**

That reframes Morning Form from a *tool the user operates* into a *service that
runs the loop on the user's behalf.* Amy did the work of being her own
care-orchestrator. **The product is the orchestrator.** The consumer doesn't
track, test, analyse, and experiment — they show up, and Morning Form runs the
loop for them.

This is not a new direction; it is a **discipline imposed on the existing one.**
The deck already sells three layers — **Studios** (Layer I, in-person draw,
acquisition), **Form Intelligence** (Layer II, the shipped graph/record/answers),
and **Supply** (Layer III, the productized action) — and the advisor's "minimum
believable loop" is already *upload → ask → grounded answer → recommended actions
→ book test → track response* (`docs/brainstorms/2026-06-05-deck-product-gap-requirements.md`).
That loop **is** Amy's loop. What this brainstorm adds is the *binding insight*:
every layer exists to **absorb Amy's labour**, never to export it to the user.

The competitive frame this sharpens: Function / Superpower hand you a data dump
(you do the interpreting); frontier models hand you a blank prompt (you do the
eliciting). Both export Amy's work to the user. Morning Form's wedge is that it
**does not** — and that is the whole value proposition.

## Core Promise

**"You don't run this. We do."** The tracking, the data plumbing, the test
sequencing, the analysis, and the "what should I try next" are absorbed by Morning
Form and its clinicians — not handed back as a dashboard. The user receives a
clear picture and a next step, not twenty numbers to interpret.

## Requirements

### A. The user-facing surface stays aggressively simple — by design, not taste
- **R1.** The end-to-end experience is **four touchpoints**, near-zero daily
  effort: (1) **book a draw** (feels like booking a class), (2) a **~15-minute
  in-person draw**, (3) a calm, legible **baseline + one or two specific things to
  do**, (4) a **retest nudge** at a sensible interval showing **what moved**.
- **R2.** Simplicity is a **product invariant**, not a v1 compromise. Every new
  capability must *reduce the user's work or enrich the result* — never ask more
  of the user. The moment the user is made to do Amy's work, the proposition is lost.
- **R3.** The user is never handed Amy's toolkit: no pattern-hunting dashboard, no
  "which of 50 tests?", no experiment-design burden. **Conclusions, not toolkits.**

### B. Absorb Amy's labour behind the curtain
- **R4. Tracking → minimise.** Do not ask a well, busy person to log 20 min/day.
  Backbone = *measured* data (bloods over time). Augment with *passive* wearable
  pull for users who already wear one (zero-effort, opt-in — Terra/Garmin/Oura/
  Whoop/Fitbit wiring already exists). Subjective input = the irreducible minimum.
- **R5. Analysis → server-side.** Interpretation runs over structured data, model-
  assisted, **clinician-checked**, delivered as a conclusion — reusing the grounded
  interpretation engine + flag taxonomy, not a user-facing toolkit.
- **R6. Experiment design → pre-sequenced.** "Here's the one change to try; here's
  when we'll retest to see what moved." The user never designs the experiment.
- **R7. Test sequencing / anti-over-testing → clinician-owned.** Clinicians decide
  what's next; the user never faces test-selection anxiety (this mirrors Amy's own
  "don't over-test" caution).

### C. Low-frequency, high-trust ritual
- **R8.** Time investment measured in **minutes per quarter, not minutes per day.**
  The quarterly in-person draw is the heartbeat. (The synthetic persona already
  models a quarterly lab cadence.)

### D. Rollout discipline
- **R9.** Start at **one venue, one cohort, the simplest loop**: draw → baseline →
  one action → retest.
- **R10.** The validating signal is **retention to the second test** — people who
  can't be Amy *still come back* because the work was removed. Not signups, not
  engagement; **return-to-retest.**
- **R11.** Deepen *behind the curtain* (passive pull, sharper analysis, better
  recommendations) as data and clinician capacity grow; the user-facing surface
  does not get busier.

### E. Moat
- **R12.** The defensible asset is the **clean longitudinal dataset + the clinical
  relationship** that compound to let Morning Form keep doing more of the work on
  the user's behalf over time.

## The Governing Tension (Resolve Before Planning)

The reframe's core verb is **"we run it"** — *we* pick the one change, *we* sequence
the tests, *we* tell you what worked. Read literally, that is a **directive,
managed-care posture.** The product's currently **locked** posture is the opposite,
and on purpose:

- **Wellness/information lane, not a medical device.** The regulatory-posture memo
  (`2026-04-21`) and the clinically-honest-graph CMO direction (`2026-06-16`) lock
  Morning Form into the **wellness / lifestyle information** lane (MHRA SaMD / EU
  MDR Rule 11 intended-purpose guardrail): flagged items are "for tracking or
  clinician discussion, **not diagnosis**"; anything potentially diagnostic
  **routes to clinician handover, never a user-facing conclusion**; no causal
  overclaim.
- **The "intervention posture" is an explicit non-goal.** Named supplement
  recommendations, dose suggestions, and direct medication changes are excluded.
  The safe action vocabulary is **measure / discuss / track / behavior** — and
  *behavior* is sleep/training/routine only; **dietary-quantity directives are
  forbidden** (the forbidden-phrase enforcement would block Amy's literal "take
  iron" / "+300 calories"). Likelihood-ordering candidate conditions is a
  differential diagnosis *by capability* and is separately legally-gated.

So **R6 ("here's the one thing to do")** and **R1/R8 ("whether the thing you
changed worked")** sit in direct tension with locked guardrails. "What your change
*caused*" is precisely the n=1 causal overclaim the graph brainstorm just removed.

This is **not fatal** — but it is the **one decision that governs everything
downstream**: regulatory lane, clinician staffing model, and every word of copy.
**It must be resolved before planning** (see Outstanding Questions → Governing).

## Success Criteria
- A user with *zero* interest in self-tracking completes touchpoint 1 → 2 and
  **returns** for the retest.
- The user is never shown a number they must interpret unaided; every result ships
  with a plain-English read and **at most one or two** next steps.
- **No new daily logging obligation** is introduced to deliver any capability
  (R2/R4 invariant holds as the product deepens).
- Every result and "what to do next" stays inside the signed-off posture
  (measure / discuss / track / behavior; attention / clinician-discussion /
  escalation), with **no causal overclaim and no diagnosis.**
- **Retention-to-retest** is instrumented as the headline pilot metric.

## Scope Boundaries
- This is a **positioning + product-discipline** brainstorm, not a feature spec. It
  governs *how* the three deck layers are framed and sequenced; it does not itself
  add a surface.
- In-person **Studios are pre-launch** ("pilot at month 9"); the built fulfilment
  today is the **remote concierge voucher** (partner-lab redemption code —
  `docs/runbooks/concierge-booking-fulfillment.md`), not in-person phlebotomy. The
  reframe describes the *target ritual*; the draw-model and venue are sequencing
  questions, below.
- Not in scope: building a directive analysis engine. *Whether we may be directive*
  is the governing question — it is not assumed here.

## Key Decisions (proposed — for founder + CMO sign-off)
- **Simplicity is the product, not a constraint.** R2 is the thesis, not taste —
  this is the lens for every future scope call.
- **Recommended posture resolution:** keep the *delivery* feeling done-for-you
  while keeping the *claims* inside the locked lane. i.e. "we did the work of
  narrowing it to the **one thing worth tracking / worth discussing with your
  clinician**," and on retest, "**here's what moved**" — never "here's what your
  change **cured/caused**." This preserves the felt promise ("we run it for you")
  without crossing into regulated managed-care or causal claims. The "one action"
  lives inside *measure / discuss / track / behavior*; anything beyond that routes
  to clinician handover. **Needs CMO + founder sign-off** — this is the governing
  question, not a settled decision.
- **Studios are the heartbeat; the remote voucher is the bridge** until Studios
  exist — the same loop, lighter ops, available now.

## Dependencies / Assumptions
- Passive wearable pull already exists (Terra-backed Apple Health/Garmin;
  Whoop/Oura/Fitbit/Google Fit scaffolding) — R4's "zero-effort" backbone.
- The grounded interpretation engine + flag taxonomy (attention /
  clinician-discussion / escalation) is the analysis backbone (R5).
- Quarterly cadence is already modelled in the synthetic persona (R8).
- The activation-funnel harness exists and can be extended for retention-to-retest
  (R10) — `scripts/metrics/activation-funnel.ts`.

## Outstanding Questions

### Resolve Before Planning
- **[Governing] Posture.** Does the reframe *operate within* the locked
  descriptive / clinician-prep lane (recommended resolution above), or does the
  founder intend to *move the product into* a directive, managed-care posture
  (which reopens the MHRA intended-purpose question and the explicit
  intervention-posture exclusion)? **Everything downstream depends on this.**

### Deferred to Planning
- **[Draw model]** In-person Morning Form Studio vs. **gym-as-distribution-channel**
  ("book a draw at your gym") vs. remote-voucher bridge — and how the pilot venue
  is chosen. Amy's narrative and the deck both lean in-person; the built path is
  remote.
- **[Retest claim]** Exact framing of "what moved" on retest that satisfies the
  no-causal-overclaim gate (R6/R1 vs. clinically-honest-graph R8).
- **[Metric]** Definition and instrumentation of retention-to-retest (R10) on the
  existing activation-funnel harness.
- **[Minimum subjective input]** What is the *irreducible* minimum we ask the user
  (R4), and how is it collected without recreating a daily log?

## Next Steps
→ Resolve the **governing posture question** (founder + CMO), then `/ce:plan` the
first-cohort loop (draw → baseline → one action → retest) with retention-to-retest
instrumented, building **only within the signed-off posture.**
