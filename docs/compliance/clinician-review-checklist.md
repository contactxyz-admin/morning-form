# Clinician review checklist — user-facing copy & LLM surfaces

The automated scanners (`static-copy.test.ts`, `src/lib/llm/linter.ts`) catch
forbidden *phrases*; they do not catch *tone*, implied causation, or a flag set
at the wrong severity. This checklist is the human gate that does. It
operationalises the locked posture (`docs/brand-guidelines.md`) and the CMO
direction (`docs/brainstorms/2026-06-16-clinically-honest-graph-requirements.md`).

## When to run it

- New or materially-changed **user-facing copy** (pages, emails, cards, nudges).
- A new **LLM surface or prompt**, or a change to a scribe/topic system prompt.
  (Incl. the lead-with-guidance sleep change and the new **medication &
  supplement review** specialist — Plan 2026-06-19-001 Units 1 & 3 — which ship
  with no flag, so their sign-off is the **merge gate** to production.)
- A new or edited **supplement-handoff evidence note**
  (`src/lib/scribe/supplement-handoff/evidence-notes.ts`) — sign-off is what sets
  `reviewedBy`/`reviewedAt`; an unreviewed note never surfaces.
- New **persona/fixture content** that renders in a demo or the product.
- Before flipping a flag that exposes any of the above in production (incl.
  `SUPPLEMENT_HANDOFF_ENABLED`).

## The checklist (every item must pass)

**Lane**
- [ ] No diagnosis: nothing says "you have …", names a condition for the member, or ranks likely conditions.
- [ ] No treatment direction: no named drug/supplement, no dose/quantity/frequency, no "start/stop/increase" a medication or dose.
- [ ] No causal-efficacy claim: it says what **changed / moved**, not what **"worked" / cured / fixed** (n=1).
- [ ] No managed-care framing ("our clinicians decide"), no prescriptive "the one thing to do", no "what's wrong with you".
- [ ] Behaviour suggestions are sleep / training / routine only — no dietary-quantity directives.

**Vocabulary**
- [ ] Actions use the allowed verbs only: **measure / track / discuss / behaviour**.
- [ ] Anything beyond those routes to **clinician handover**, not a user-facing conclusion.

**Supplement / medication handoff (when the surface touches it)**
- [ ] A "should I take …?" answer leads with risk-free behaviour guidance, then
      hands the pharmacological part to a clinician — it never recommends, names a
      dose/brand, or asserts efficacy.
- [ ] Any evidence note is **general-information**, descriptive, and stays in the
      "worth discussing with a clinician/pharmacist" frame; it carries a named
      clinician reviewer and passes the forbidden-phrase scan.
- [ ] The medication & supplement review specialist's output is clinician-prep
      (surface + hand off), never a recommendation, and no "Supply"/product step
      is presented as an agent recommendation.

**Flags & evidence (where the surface shows interpretation)**
- [ ] Flag severity is correct and not blurred: **attention** vs **clinician-discussion** vs **escalation**.
- [ ] Escalation/critical content is routed to clinician review, never rendered as a member-facing interpretation.
- [ ] A validated lab does not read with the same authority as a self-reported signal.
- [ ] Any claim is grounded in a citable record; no fabricated values, no unit mismatches.

**Tone**
- [ ] Calm and legible — one or two next steps, not a dashboard of numbers to interpret.
- [ ] Reads as "worth a look / worth discussing", never as reassurance ("you're fine") or alarm ("this is dangerous").

## Sign-off

Record the reviewer and date against the change (PR description or the relevant
content file's reviewer field, per the existing
`docs/compliance/clinical-review-outreach.md` convention). A surface that fails
any item does not ship until the copy is revised and re-reviewed.
