---
title: "Tuning a safety phrase-filter: distinguish the over-claim shape, and pin BOTH reject and must-pass fixtures"
date: 2026-06-30
category: docs/solutions/best-practices
module: scribe/policy/forbidden-phrases / enforce
problem_type: regex_precision_recall_gap
component: clinical_safety_filter
severity: high
applies_when:
  - "Adding a forbidden-phrase / guardrail regex family that rejects unsafe model output regardless of context"
  - "A safe vocabulary sits adjacent to the unsafe one and must keep passing (false positives suppress legitimate answers)"
  - "The unsafe form is a grammatical shape, not a keyword (causation, advice, diagnosis, certainty)"
tags:
  - safety-filter
  - forbidden-phrases
  - regex
  - false-causality
  - precision-recall
  - clinical-safety
  - fixtures
---

# Tuning a safety phrase-filter: distinguish the over-claim shape, pin both directions

## Context

The longitudinal trend layer (plan 2026-06-30-001 U14) needed a **false-causality** guardrail: once trends are visible, "X caused Y" is tempting, but the product must stay on *temporal association* ("followed", "coincides in time", "may also contribute"), never proven cause. The first regex set was both too narrow and too broad — a review pass found concrete misses and misfires:

- **False negatives (let unsafe through):** the most natural over-claims used transitive verbs the set didn't list — "the supplement **reduced/lowered/raised/boosted/improved** your ferritin", "**led to** a rise", "is **responsible for** the rise", "**explains why** your ferritin rose".
- **False positives (blocked safe output):** `thanks to your \w+` blocked "thanks to your **clinician**" / "your **GP's note**" (crediting a *person/source*, not an intervention); and an over-loose agentive pattern matched "made your **decision to improve** your sleep" and "made your **fall plans** clear".

## Guidance

**1. Match the over-claim *shape*, and let the adjacent safe shape fall outside it.** The safe and unsafe forms here differ grammatically, not lexically: the over-claim is **transitive with the marker as object** ("the supplement *improved your* ferritin"); the safe descriptive form is **intransitive with the marker as subject** ("your ferritin *improved*"). Anchor on the structure:

```ts
// blocks "<agent> raised/lowered/improved your <marker>"; "your ferritin improved" (marker before verb) does NOT match
/\b(raised|lowered|reduced|boosted|elevated|improved|increased|decreased|restored|drove)\s+(your|his|her|their|the)\s+\w+/i
```

**2. Narrow "credit/attribution" patterns to the thing being credited.** Blanket `thanks to your \w+` over-blocks. Restrict the object to the unsafe category (an intervention), with at most one optional adjective, so crediting a *person/source* stays legal:

```ts
// "thanks to your (new) supplement/routine/treatment" → block; "thanks to your clinician/GP/records" → pass
/\b(thanks\s+to|owing\s+to)\s+(your|the)\s+(\w+\s+)?(supplement|medication|iron|dose|treatment|intervention|diet|change|routine|protocol|regimen)\b/i
```

**3. Tighten agentive patterns so an unrelated noun phrase can't bridge to a trigger word.** The loose `made (your)? \w+ (to)? (rise|improve|…)` matched "made your **decision to improve**". Require the possessive and put the trend verb **immediately** after the marker (no optional infinitive gap):

```ts
/\bmade\s+(your|his|her|their|the)\s+\w+\s+(rise|rose|fall|fell|drop|climb|spike|go\s+up|go\s+down)\b/i
// "made your ferritin rise" → block; "made your decision to improve" / "made your plans clear" → pass
```

**4. Pin BOTH directions with fixtures — one reject per pattern, a must-pass set for the adjacent safe vocabulary.** A guardrail tested only on the strings it catches silently rots into either a sieve or a gag. Use the existing `it.each` convention:

```ts
const REJECT: Array<[string,string]> = [ ['raised your','The iron raised your ferritin over the spring.'], /* …one per pattern… */ ];
const MUST_PASS: string[] = [
  'Your ferritin improved across the last three readings, now within range.', // intransitive — safe
  'Thanks to your clinician, we have the GP note for context.',                // crediting a person — safe
  'You made your decision to improve your sleep routine.',                     // decision-to-improve — safe
  'A repeat test would confirm this direction.',                              // the retest copy MUST survive
  // the OUTCOME_CHANGED rationale template the product itself emits — must survive its own filter
  'After the "Track morning sunlight" action, your HRV moved from 40 to 55 ... a temporal association, not a proven cause; other factors may also contribute.',
];
```

The must-pass set is not optional polish: a false positive here **suppresses a legitimate clinical answer**, which in a descriptive-by-design product is its own failure. Include the exact phrasings the product is *supposed* to emit (retest suggestions, the association rationale) so the filter can never strangle them.

## Why This Matters

A safety filter has two failure modes and they pull in opposite directions: a miss ships an unsafe claim, a misfire silences a safe one. Keyword lists optimise neither — they miss the verbs you didn't think of and catch the innocent sentences that happen to contain a word. Anchoring on the **grammatical shape** of the unsafe form (transitive-with-marker-as-object, intervention-as-credited-object, marker-immediately-before-trend-verb) is what separates the two adjacent vocabularies. And because the boundary is subtle, the only way to keep it correct over time is to encode **both** sides as fixtures — every pattern has a reject case, and every safe phrasing the product relies on has a must-pass case. The review here flipped a filter that was simultaneously a sieve (missed the common verbs) and a gag (blocked "thanks to your clinician") into one that holds on both sides.

## When to Apply

- Any guardrail that rejects model/user text by pattern regardless of declared intent: causation, medical/financial/legal advice, diagnosis, certainty/guarantee language, PII.
- Whenever a **safe vocabulary sits next to** the unsafe one (descriptive vs prescriptive, association vs causation): test the safe set explicitly — its survival is a requirement, not an afterthought.
- Whenever the product **emits text that must pass its own filter** (templated rationales, suggestion copy): add those exact strings to the must-pass set.

## Examples

- `src/lib/scribe/policy/forbidden-phrases.ts` — the `FALSE_CAUSALITY_PATTERNS` family (transitive-verb, led-to, responsible-for, explains-why, intervention-scoped credit, tightened agentive "made").
- `src/lib/scribe/policy/enforce.test.ts` — `it.each` reject-per-pattern + a `SAFE_ASSOCIATION` must-pass set including the retest copy and the `OUTCOME_CHANGED` rationale template.
- `src/lib/markers/trend-views.test.ts` — cross-checks every generated `retestSuggestion()` against `FORBIDDEN_PHRASE_PATTERNS`, coupling the copy the product emits to the filter it must clear.

## Related

- `docs/solutions/best-practices/separate-source-reported-from-system-reviewed-signals-2026-06-19.md` — adjacent clinical-safety discipline (keeping reported vs reviewed signals distinct).
