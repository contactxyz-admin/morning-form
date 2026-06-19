---
title: "feat: Clinical-flag model — separate data, source-abnormality, review, escalation"
type: feat
status: active
date: 2026-06-18
origin: docs/plans/2026-06-17-003-feat-deferred-graph-items-closeout-plan.md
---

# feat: Clinical-flag model — separate data / source-abnormality / reviewed interpretation / escalation

## Overview

PR #177 shipped the **core** of the clinical-flag policy (CMO direction,
2026-06-17): *no authored rule ⇒ no MorningForm clinical judgement.* Unauthored
markers now show value/direction + a neutral "Not yet reviewed", never an
inferred amber flag. This plan completes the **model** the CMO specified, which
the core only partially expresses:

> Separate four concepts that the single `flag` currently conflates —
> **data availability**, **source abnormality**, **reviewed clinical
> interpretation**, and **escalation recommendation**. A clinical flag should
> appear only for (1) a CMO-authored rule, (2) a value the **source itself**
> reports abnormal/critical, or (3) an explicit urgency signal — each from its
> own basis, never inferred from weak data.

The headline addition is the **source-abnormality safety fallback**: when a lab
(or other source) explicitly flags a value LOW/HIGH/CRITICAL, surface that as a
**source-attributed** signal ("flagged low by the lab") — distinct from a
MorningForm reviewed interpretation. This is the one honest exception to
authored-only: it's the *source's* judgement, faithfully relayed, not ours.

> ⚠️ **Gate (must verify first):** confirm whether the authed source/lab path
> actually carries per-value abnormality flags and whether enrichment fires at
> all (SUPPORTS edges → biomarker concept vs `observation` instance). See U0.

## Problem Frame

Today a node carries one `interpretation.flag: FlagTier`
(`attention | clinician_discussion | escalation`). That single field is asked to
mean too much: "we reviewed this and it's worth watching" and "this is
unreviewed" and (would-be) "the lab flagged this abnormal" all collapse onto the
same chip. The core fix removed the *false* case (unreviewed → no flag), but:
- There's no way to relay a **source-reported** abnormality without it reading
  as a MorningForm judgement.
- "Data availability" (we have a value), "not yet reviewed", and "in range,
  reviewed" are not cleanly distinguished in the UI.
- `escalation` (hand to a clinician) is a different *action* from
  `clinician_discussion` (a tier) but they live on the same axis.

The CMO's model is **four independent signals**, each rendered from its own
source of truth, composed into the row — not one overloaded flag.

## Requirements Trace

- **R0 (gate)** — Establish, on a real record, whether (a) authed source
  enrichment fires (concept vs instance node target), and (b) source rows carry
  an abnormality flag (structured field or parseable). The model below is
  designed to degrade gracefully if either is absent.
- **R1 — Four separable signals** on a grounded marker / node:
  1. **Data availability** — value present (+ unit, reference range, direction,
     source citation). Always shown when known.
  2. **Source abnormality** — the *source's own* LOW/HIGH/CRITICAL flag, shown
     as source-attributed ("flagged low by the lab"), never as our conclusion.
  3. **Reviewed interpretation** — only from a CMO-authored rule (the existing
     `interpret` MATRIX); the `FlagTier` chip.
  4. **Escalation** — an explicit "needs clinician handover" recommendation
     (today's `escalation` tier), kept distinct from "worth discussing".
- **R2 — Neutral states, no implied judgement.** A changed-but-unreviewed marker
  shows a neutral state ("Not yet reviewed" / "Value shown, no reviewed
  guidance"), not a flag — extending the core. A value with no change shows just
  the value.
- **R3 — Source-abnormality safety fallback.** If the source reports a value
  abnormal/critical and there is **no** authored reviewed interpretation, show
  the source-attributed abnormality signal (a calm, source-voiced chip) so a
  clearly-abnormal lab value is never silently neutral. If both exist, show the
  authored interpretation (richer) + optionally the source attribution.
- **R4 — Honest attribution everywhere.** Each signal names its basis; nothing
  implies MorningForm reviewed a marker it hasn't. Non-diagnostic framing
  retained. Applies to demo + authed identically (shared `SourceDetailBody` +
  the node-detail sheet).
- **R5 — Reduced-motion / determinism / prod-parity untouched** (this is content/
  data, not motion); authed remains flag-gated where it reads the panel diff.

## Scope Boundaries
- ❌ No new *clinical authored rules* (still the CMO's 5 markers); this is the
  framework around them, not more content.
- ❌ No diagnosis, no treatment thresholds, no inferring abnormality from raw
  values when the source didn't flag it (R3 relays the source, it doesn't judge).
- ❌ No change to the visual classes (that's plan 2026-06-18-001) or the
  source-detail layout beyond the new signal rows.
- ❌ Not building a full alerting/notification system — escalation here is a
  presentation tier, not a push.

## Context & Research

### Relevant Code
- `src/lib/markers/clinical-interpretation.ts` — `interpret`, `isAuthoredMarker`,
  the MATRIX + registry alias (shipped). The "reviewed interpretation" signal.
- `src/types/graph.ts` — `FlagTier`, `NodeInterpretation`, `NodeChangeWire`.
  Likely add a `SourceAbnormality` shape (source flag + attribution).
- `src/lib/markers/panel-diff.ts` / `observation-metric-window` / the lab-instance
  ingest — where a source's abnormality flag would live (the fixture chunk text
  says "Flagged LOW by the lab"; production needs a structured field or a parse).
- `src/lib/record/source-enrichment.ts` — composes grounded-marker signals
  (today: change + authored interpretation). Add the source-abnormality signal.
- `src/components/record/source-detail-body.tsx` + `node-detail-sheet.tsx` — the
  presentation; render the four signals distinctly.
- `src/lib/markers/flag-presentation.ts` — calm `FlagTier` copy; add a
  source-attributed presentation variant.

### Institutional Learnings
- `docs/plans/2026-06-16-002/003` — the clinically-honest-graph + authority/
  evidence-grade discipline, and the "derive display state from source, never
  author it" solution note (`docs/solutions/.../derive-from-source`). The
  source-abnormality fallback is exactly that principle: relay the source.
- Visual-audit + clinical sign-off gate (mandatory for this surface).

## Key Technical Decisions
- **Model the four signals as distinct fields, compose in the view.** Don't
  overload `flag`. A grounded marker carries: `change?` (data), `sourceFlag?`
  (source abnormality + attribution), `interpretation?` (reviewed, authored-only).
  Escalation stays a `FlagTier` value but is rendered as a distinct
  handover affordance, not a chip among chips.
- **Source-abnormality is source-attributed, calm, and never our judgement.**
  Copy voiced as the source's ("Flagged low by the lab"), visually distinct from
  the authored chips. Derive it from a structured source field if present; the
  parse-from-text path is a fallback, gated by U0.
- **Authored interpretation wins for richness; source-abnormality is the safety
  net.** If authored, show the reviewed interpretation (it already encodes
  flag/clarity/next-step). If not authored but source-abnormal, show the source
  signal. If neither, neutral "Not yet reviewed".
- **Degrade gracefully on the gate.** If U0 shows authed carries no abnormality
  flag, ship the concept-separation + neutral states (still valuable) and defer
  the source-abnormality fallback to when the data exists — don't fabricate it.

## Open Questions
- **U0 outcomes** drive scope: does authed enrichment fire (concept vs instance);
  does the source carry a structured abnormality flag, or only free text?
- **Where does source-abnormality live** in the wire/DB (a field on the
  observation/instance, or parsed)? Determines whether R3 is data-plumbing or a
  parser (the latter is riskier and may itself defer).
- **Escalation rendering** — a banner/handover affordance vs a chip; how
  prominent without alarming (the existing `escalation` copy is "Needs clinical
  review").
- **Do we relay source-abnormality even for authored markers** (belt-and-braces),
  or only when unreviewed? (Lean: show both when present — they're different
  bases.)

## Implementation Units
- [ ] **U0: Verify the data (gate).** On a real record (and the fixture): does
  authed `/record/source/[id]` enrichment fire (SUPPORTS edge target type), and
  do source rows carry an abnormality flag? Write findings into this plan; scope
  U3 accordingly. (Also resolves the deferred "authed enrichment may no-op"
  review item.)
- [ ] **U1: Signal model + types.** Add the `SourceAbnormality` shape + a
  grounded-marker signal bundle (`change` / `sourceFlag` / `interpretation`);
  keep `interpretation` authored-only. Pure types + helpers, unit-tested.
- [ ] **U2: Neutral-state completion.** Formalize "Not yet reviewed" / "Value
  shown, no reviewed guidance" as explicit neutral states distinct from data-
  absent; render in `SourceDetailBody` + the node sheet. (Extends the core.)
- [ ] **U3: Source-abnormality fallback (gated by U0).** Derive the source flag
  (structured field preferred), thread through `source-enrichment` + the demo
  adapter, render as a source-attributed calm signal; show when no authored
  interpretation. Tests for: source-abnormal + unauthored → source signal;
  authored → authored interpretation (+ optional attribution); neither → neutral.
- [ ] **U4: Escalation as a distinct affordance.** Render `escalation` as a
  clinician-handover element separate from the tier chips; copy + audit.

## System-Wide Impact
- Touches the marker/clinical libs, the wire types, source-enrichment, the demo
  adapter, and the two detail surfaces — but composes signals that are each
  independently derived, so no surface infers judgement.
- Authed remains flag-gated for the panel-diff-derived signals; source-abnormality
  (if structured) can show regardless of the longitudinal flag (it's the source's
  own flag, not a diff).

## Risks & Dependencies
| Risk | Mitigation |
|------|------------|
| Source carries no structured abnormality flag → R3 needs text parsing | U0 gate; prefer structured field; defer the parser if absent (don't fabricate) |
| Re-introducing over-flagging via the source fallback | Source-attributed + calm; only the source's own flag, never inferred from values |
| Authed enrichment doesn't fire at all (concept vs instance) | U0 resolves; if instances, resolve via INSTANCE_OF or accept name-only + plan a fix |
| Clinical mis-messaging on a health surface | Clinical sign-off + visual audit are mandatory gates; non-diagnostic framing retained |
| Scope creep into alerting | Escalation is presentation-only here; notifications out of scope |

## Sources & References
- Origin: `docs/plans/2026-06-17-003-…` (Q1 full-model direction).
- Clinical honesty lineage: `docs/plans/2026-06-16-002/003`,
  `docs/solutions/best-practices/derive-display-state-from-source-…`.
- Code: `src/lib/markers/{clinical-interpretation,flag-presentation,panel-diff}.ts`,
  `src/lib/record/source-enrichment.ts`, `src/components/record/source-detail-body.tsx`,
  `src/components/graph/node-detail-sheet.tsx`, `src/types/graph.ts`.

## Future Considerations
- A formal evidence hierarchy feeding ordering/weight (pairs with the self-report
  class plan). Real-time critical-value alerting (out of scope; would build on U4).
