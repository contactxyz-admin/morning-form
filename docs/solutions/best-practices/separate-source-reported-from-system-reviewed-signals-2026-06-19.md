---
title: "Separate 'what the source said' from 'what we concluded' — and verify the signal exists before building the relay"
date: 2026-06-19
category: docs/solutions/best-practices
module: record/source-enrichment · markers/source-abnormality · graph/node-detail-sheet
problem_type: trust_calibration
component: clinical_signal_presentation
severity: high
applies_when:
  - "A surface shows both source-reported facts and system-derived judgements about the same item (a lab value the lab flagged + an interpretation you computed)"
  - "A single field (flag/status/severity) is asked to mean both 'the source said this' and 'we concluded this'"
  - "You are about to build a safety/relay feature on a data path whose payload you haven't confirmed actually arrives"
  - "A raw internal attribute (a boolean flag) is dumped into a generic key/value list next to its own dedicated, attributed presentation"
tags:
  - clinical-safety
  - trust-calibration
  - signal-separation
  - source-attribution
  - verify-first
  - data-plumbing
  - attribution
---

# Separate "what the source said" from "what we concluded" — and verify the signal exists before building the relay

## Context

On the source/lab-report surface, a marker can carry up to four *different kinds* of signal that an earlier design conflated onto one `flag` chip:

1. **Data availability** — we have a value (+ unit, range, direction).
2. **Source abnormality** — the *lab itself* marked the value out of range (`flaggedOutOfRange`).
3. **Reviewed interpretation** — a CMO-authored rule concluded something (the only place a *system* judgement is allowed).
4. **Escalation** — hand to a clinician.

The policy is strict: *no authored rule ⇒ no system clinical judgement* — an unreviewed marker shows value/direction and a neutral "Not yet reviewed", never an inferred flag. But that left a real safety hole: a value the **lab flagged abnormal**, with no authored rule, rendered as silently neutral. The honest fix is a **source-attributed safety net** — relay the lab's *own* flag ("Flagged out of range"), visually distinct from the system's reviewed chips, so a clearly-abnormal value is never silent *and* is never mistaken for our conclusion.

Two things made this go right (and one near-miss the review caught):

- We **verified the data path first** instead of assuming it.
- We kept the four signals as **separate fields composed in the view**, not one overloaded flag.
- We almost **leaked the raw `flaggedOutOfRange` boolean** into a generic attributes list, where it would have double-messaged the chip and read as an *un*attributed system judgement.

## Guidance

**1. Model each signal as its own field; compose them in the view. Never overload one `flag`.** A grounded marker carries `change?` (data), `sourceFlag?` (source's abnormality), `interpretation?` (reviewed, authored-only). The render picks a priority — authored interpretation → source flag → neutral "Not yet reviewed" → none — but every signal is *independently derived from its own basis*. No surface can infer a judgement, because the only field that encodes one (`interpretation`) is gated on an authored rule.

**2. A relayed source signal must be source-attributed and never inferred.** Derive it *only* from the source's own structured flag, never from comparing raw values yourself:

```ts
// deriveSourceAbnormality — relays the source's flag; does NOT decide abnormality
export function deriveSourceAbnormality(flagged: boolean, value, low, high): SourceAbnormality | undefined {
  if (!flagged) return undefined;            // the source didn't flag it ⇒ nothing, ever
  let position = 'out_of_range';
  if (value != null) {                       // direction READS the source's own numbers…
    if (high != null && value > high) position = 'above';
    else if (low != null && value < low) position = 'below';
  }
  return { flaggedOutOfRange: true, position }; // …it does not INVENT the abnormality
}
```

Copy is passive-voiced and calm ("Flagged out of range"), visually distinct (outlined neutral chip) from the colour-coded *reviewed* tiers — so it reads as the source talking, not us.

**3. Run a "U0" verify-first gate before building the relay.** Confirm, on the real schema/pipeline, that (a) the data path actually delivers the node you'll decorate and (b) the source carries the signal as a *structured* field — before writing a single line of feature. Here the two findings flipped the whole approach from risky to trivial:

- **Enrichment fires:** `SUPPORTS` edges are self-loops (`fromNodeId === toNodeId === node.id`, attributed to the doc via `fromDocumentId`), so a document's `edges` reference the biomarker **concept** nodes — exactly what the enricher decorates. (The pre-build worry was "maybe they only reference observation *instances*"; verifying killed it.)
- **The flag is structured and persisted:** `flaggedOutOfRange` is extracted ("true only when the lab marks it out of range … do not escalate") and stored on the concept's attributes. So the relay is **data-plumbing, not text-parsing** — no fragile NLP on chunk text.

The gate's payoff is asymmetric: if it had found *no* structured flag, the right move was to ship the concept-separation + neutral states and **defer the relay rather than fabricate it** (parse-from-text was the fallback we were spared). Verify-first turns "build a parser and hope the data shows up" into "thread one boolean."

**4. Don't leak the raw internal flag into generic attribute dumps.** The same `flaggedOutOfRange` that drives the calm, attributed chip was also being rendered as a bare `FLAGGEDOUTOFRANGE: true` row by a generic "Attributes" list — double-messaging on the demo, and on surfaces that *don't* set the chip, an un-attributed boolean reads as a system assertion. Hide keys that have a dedicated, attributed presentation:

```ts
const HIDDEN_ATTRIBUTE_KEYS = new Set(['flaggedOutOfRange']); // shown via the attributed chip, not raw
const entries = Object.entries(node.attributes).filter(
  ([k, v]) => v != null && !HIDDEN_ATTRIBUTE_KEYS.has(k),
);
```

## Why This Matters

On a trust-sensitive surface, *who is talking* is part of the meaning. "This is above the lab's range" (the lab) and "this needs discussion with a GP" (a reviewed rule) are different speech acts with different liability and different calibration — collapsing them onto one chip launders a relay into a judgement, or buries a real abnormality as "neutral". Keeping them as separate, independently-derived fields makes the honest rendering the *only* possible rendering.

And **verify-first is the cheap half of the work.** The feature looked like it might need a chunk-text parser and a fix to the edge model; ten minutes of reading the ingest + edge code showed the flag was already a persisted boolean on exactly the node we decorate. The unverified version would have been more code, more fragile, and possibly built on a data path that never delivers.

## When to Apply

- Any surface mixing **source-reported facts and system-derived conclusions** about the same item — labs, credit signals, moderation ("the platform flagged" vs "our model scored"), security findings ("the scanner reported" vs "we triaged").
- Whenever you're tempted to give one `flag`/`status`/`severity` field two masters ("they said" + "we concluded") — split it; compose in the view.
- Before building a relay/safety feature on a pipeline payload: **verify the node arrives and the signal is structured** (one tracing pass through ingest + the edge/query layer). If it isn't structured, ship the rest and defer the relay — don't fabricate it by parsing.
- Any `flaggedX`/internal boolean that has a dedicated presentation: keep it out of generic key/value attribute dumps.

## Examples

- **Four fields, one view:** `change` / `sourceFlag` / `interpretation` coexist on the grounded-marker row; the render prioritises but each is derived from its own basis. A test pins that an authored *and* lab-flagged marker carries *both* `interpretation` and `sourceFlag` (so they can never silently collapse onto one).
- **The verify-first flip:** the worry "enrichment may no-op (edges target instances not concepts)" was resolved by reading `mutations.ts` — `SUPPORTS` is a self-loop on the concept; the document's edges reference it; `flaggedOutOfRange` is already on its attributes. Relay became a one-boolean thread, not a parser.

## Related

- [`docs/solutions/best-practices/derive-display-state-from-source-never-author-it-2026-06-16.md`](derive-display-state-from-source-never-author-it-2026-06-16.md) — the adjacent rule: *derive* a computed signal from its source, don't hand-author it. This doc extends it to the case where there are **two** sources of truth (the source's flag and the system's review) that must stay attributed and separate.
- [`docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md`](visual-audit-non-optional-ui-gate-2026-05-16.md) — clinical copy + chip distinctness ride the same human sign-off gate.
