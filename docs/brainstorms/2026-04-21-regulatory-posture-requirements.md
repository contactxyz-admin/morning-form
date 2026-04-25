---
date: 2026-04-21
topic: regulatory-posture
audience: investors, advisors, future clinical reviewers
---

# Morning Form — Regulatory Posture (SaMD Memo)

## Problem Frame

Jonathan Selby's 16 April 2026 feedback (R4) asks whether recommending supplements and lifestyle changes based on wearable + lab + health-check data would be safe, and whether it would classify Morning Form as a regulated medical device (UK MHRA / EU MDR).

The feedback is answered largely by architecture decisions the product has already made. This memo states the intended purpose, the explicit non-goals, and the code-level guardrails so the posture is legible to non-engineering reviewers.

## Intended Purpose

Morning Form is an **information and decision-support layer** for individuals who want to consolidate their own health data and ask specialist-style questions about it. The product helps users **understand** their data, **compile** it into a longitudinal record, and **prepare better conversations with their GP or clinician**. It does not diagnose, prevent, monitor, predict, prognose, treat, or alleviate disease.

Positioning: **wellness / lifestyle information product**, not a medical device. This is the posture that lets us ship without SaMD classification under UK MHRA guidance and EU MDR Rule 11. It also means certain outputs the pitch gestures at — named supplement recommendations, dose suggestions, direct medication changes — are **explicit non-goals**, not future features.

## Non-Goals (hard limits)

- **N1.** The product does not recommend specific supplements by name or class.
- **N2.** The product does not recommend doses, routes, or schedules for any substance.
- **N3.** The product does not instruct the user to start, stop, change, or titrate any medication.
- **N4.** The product does not produce a diagnosis or probabilistic diagnostic output.
- **N5.** The product does not triage clinical acuity. Any input that implies acute risk is routed to "see a clinician now" copy, not risk-stratified by the app.

## Requirements — Architectural Guardrails

Each guardrail below is already in code. This memo is the written record; the code is the enforcement.

- **G1 — Drug-name tripwires.** Specialist outputs are filtered against a list of OTC and prescription drug names. Any candidate answer containing a match is rejected before it reaches the user. See `src/lib/scribe/policy/forbidden-phrases.ts`.
- **G2 — Dose-string tripwires.** Bare `<number><unit>` patterns (mg, mcg, µg, g, IU, ml) are rejected even when the drug name slips the tripwire list. Concentration readings used for lab-value display (`µg/L`, `mg/dL`) are excluded via negative lookahead. Same file as G1.
- **G3 — Imperative-treatment refusal.** Phrases like "you should take / stop / start / increase / double your dose / taper off" are rejected regardless of what surrounds them. Same file as G1.
- **G4 — Out-of-scope routing to GP prep.** When a specialist concludes a question is outside its scope of practice, it calls the `route_to_gp_prep` tool, producing a deterministic handoff payload (`reason` + `suggestedQuestion`) which renders as an "Add to GP prep" button rather than a watered-down answer. See `src/lib/scribe/tools/route-to-gp-prep.ts`.
- **G5 — Classification-driven UI.** Every scribe output carries a `SafetyClassification` (`clinical-safe` | `out-of-scope-routed` | `rejected`). Out-of-scope and rejected outputs render as a GP-prep handoff surface — not as an answer. See `src/lib/scribe/policy/types.ts` and `src/components/chat/message-bubble.tsx`.
- **G6 — Topic scoping.** Each specialist is scoped to a defined set of `judgmentKind` values per topic. Outputs that would require a judgmentKind outside the specialist's registry are rejected. See `src/lib/scribe/policy/registry.ts`.
- **G7 — Provenance requirement.** Substantive claims surface with citations back to graph nodes or source chunks. Unsupported claims either carry no citations (visibly weakening them) or are suppressed by topic-compile logic. See `src/lib/topics/compile.ts` and the `Mention` chip (`src/components/mention/mention.tsx`).

## Requirements — Intended-Use Copy and UI

- **U1.** Onboarding and settings carry an explicit "This is not medical advice" disclaimer. See `src/components/ui/disclaimer.tsx`.
- **U2.** Any output routed as out-of-scope renders under a "Bring to your GP" framing, not a "here is what to do" framing. Enforced in `MessageBubble` out-of-scope variant.
- **U3.** The product's own marketing and onboarding copy must not claim diagnosis, treatment, or clinical-grade analysis. Copy review is part of release discipline, not a technical control.

## What Changes If We Ever Cross the Line

If the product ever does any of:
- name a supplement or drug the user should take,
- suggest a dose or schedule,
- output a diagnosis,
- produce risk-stratified clinical triage,

…it becomes an **active medical device intended for diagnosis / decision support** and falls under SaMD classification (likely Class IIa under UK MDR Rule 11 / EU MDR Rule 11). That requires: formal intended-purpose statement, risk-management file (ISO 14971), clinical evaluation, QMS (ISO 13485), UKCA / CE marking, and ongoing post-market surveillance. This is a different product, not a feature toggle.

The architecture deliberately makes crossing the line a code change with a visible blast radius — adding a drug name to the allowlist, disabling `route_to_gp_prep`, or extending `judgmentKind` — rather than a prompt tweak.

## Scope Boundaries (this memo)

- In scope: the regulatory posture of the product as it stands April 2026, and the code-level controls that sustain it.
- Out of scope: formal SaMD dossier, ISO 14971 risk management file, clinical evaluation summary. These are only required if we deliberately move to Class IIa or above.

## Decisions

- **D1.** Morning Form is marketed and built as a wellness / lifestyle information product, not a medical device.
- **D2.** The seven architectural guardrails G1-G7 are load-bearing for that positioning. Any proposal to relax one requires a written posture-change memo, not a PR description.
- **D3.** A formal regulatory consultant engagement is deferred until triggered by (a) investor DD, (b) a clinical partner requiring it, or (c) a product decision to deliberately cross into SaMD scope.

## Open Questions (deferred)

- Q1. Do we want a light-touch external clinical advisor review of guardrails G1-G7 before the next fundraise, even without a formal dossier?
- Q2. Does the affiliate marketplace (mentioned in the pitch, not built in code) sit inside or outside this posture? Selling a named supplement is not the same as recommending one, but the boundary needs an explicit decision before any marketplace work starts.

## References

- Safety policy: `src/lib/scribe/policy/forbidden-phrases.ts`, `src/lib/scribe/policy/enforce.ts`, `src/lib/scribe/policy/registry.ts`
- GP-prep routing: `src/lib/scribe/tools/route-to-gp-prep.ts`, `src/lib/topics/compile.ts`
- Out-of-scope UI: `src/components/chat/message-bubble.tsx` (OutOfScopeBubble)
- Classification types: `src/lib/scribe/policy/types.ts`
- Disclaimer: `src/components/ui/disclaimer.tsx`
- Compliance copy tests: `src/lib/compliance/static-copy.test.ts`
- Related brainstorm: `docs/brainstorms/2026-04-15-health-graph-pivot-requirements.md` ("UK positioning: information + decision-support layer, not a medical device")
