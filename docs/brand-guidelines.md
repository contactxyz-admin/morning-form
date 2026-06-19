# Brand voice guidelines — holding the in-lane posture in copy

This is the canonical reference for how Morning Form speaks to members. It exists
because **the wellness / information posture is enforced in copy, and copy
drifts** — the compelling, directive phrasings ("the one thing to do", "what
worked", "what's wrong with you") creep back unless there is a fixed vocabulary
everyone writes to and reviews against.

The posture this operationalises is locked in
`docs/brainstorms/2026-06-17-done-for-you-orchestration-requirements.md`
("Posture — LOCKED") and the CMO direction in
`docs/brainstorms/2026-06-16-clinically-honest-graph-requirements.md`:

> **Morning Form does the work, not the diagnosis.** We absorb the labour of
> testing, tracking and analysis and hand back clear information, trends, and
> clinician-ready context — framed as what to *measure, track and discuss*,
> never what to *take* or what they *have*. Anything that crosses into diagnosis
> or treatment is routed to a clinician, not answered by the product.

Internal one-liner: **"We run the loop for you; we don't make the medical call."**

## The fixed vocabulary

| Allowed (descriptive) | Forbidden (directive / diagnostic / causal) |
|---|---|
| **measure** — book/arrange a test | **take / dose** — name a supplement, quantity, frequency, or a medication change |
| **track** — log/observe X for N weeks | **diagnose** — name a condition, say "you have …", or rank likely conditions |
| **discuss** — raise X with your clinician | **cure / fix / "worked"** — any causal-efficacy claim on a change (n=1) |
| **behaviour** — sleep / training / routine only | dietary-quantity directives ("+300 cal", "more carbs") |
| "worth watching" · "what changed" · "what moved" · "clinician-ready" | "the one thing to do" · "our clinicians decide" · "what's wrong with you" |

## Before → after

| Don't write | Write |
|---|---|
| "Here's the **one thing to do**." | "Here's what's **worth discussing** with your clinician." |
| "We'll show you **what worked**." | "We'll show you **what changed / what moved**." |
| "This **cured your** fatigue." | "Your energy markers **moved** alongside this change." |
| "**Our clinicians decide** what to test next." | "Your next check is **scheduled**; a clinician reviews anything flagged." |
| "We'll tell you **what's wrong with you**." | "We'll surface **what's worth a closer look** with your clinician." |
| "**Take** 65 mg of iron daily." | "Your ferritin is **below the range we flag** — **worth discussing**." |

## Flag language (don't blur these)

- **Attention** — "worth watching" (performance/longevity; most of the product).
- **Clinician-discussion** — "worth discussing with a GP/clinician".
- **Escalation** — routed to clinician review before any user-facing interpretation.

Never collapse measurement movement and clinical judgment into one tone, and never
let a self-reported signal read with the authority of a validated lab.

## Where this is enforced (three surfaces, defence in depth)

1. **Hand-written copy** — `src/lib/compliance/static-copy.test.ts` (an always-on
   build gate): drug names, doses, clinical directives, and the
   causal-overclaim / seductive phrases above. Add new phrases to its
   `CAUSAL_PATTERNS` (and the LLM linter, below) — never to the allowlist unless
   the file's job is to quote them (linter / fixtures).
2. **LLM-generated output** — `src/lib/llm/linter.ts` (`CAUSAL_OVERCLAIM_PATTERNS`
   et al.): a match fails the linter and the compile pipeline regenerates with a
   remedial prompt. Block-and-retry, same as drug/dose/diagnosis.
3. **Human review** — `docs/compliance/clinician-review-checklist.md`: the gate a
   clinician runs over new user-facing copy and new LLM surfaces, because a
   scanner catches phrases, not tone.

## Adding a new forbidden phrase

Add the pattern to **both** `CAUSAL_OVERCLAIM_PATTERNS` (linter) and
`CAUSAL_PATTERNS` (static-copy scan), with a fixture in
`src/lib/llm/guardrail-fixtures.ts` (a violation case **and** a near-miss clean
case so the pattern can't over-block in-lane phrasing). Keep patterns scoped:
bare "worked"/"the one" are legitimate English — only the crossing-the-line
constructions are forbidden.
