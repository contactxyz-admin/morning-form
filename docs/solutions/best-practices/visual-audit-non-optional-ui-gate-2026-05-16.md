---
title: "Visual audit is non-optional when shipping user-facing UI — code review alone misses what users see"
date: 2026-05-16
category: docs/solutions/best-practices
module: ce:work workflow / ui ship gate
problem_type: process_gap
component: shipping
symptoms:
  - "10-reviewer /ce:review pass returns clean P0; visual audit immediately finds P0"
  - "Type-check + lint + build all green; UI is silently broken"
  - "User-facing bugs (invisible canvas, copy/data mismatch, label collision) survive code review for weeks"
root_cause: code_review_blind_spot
resolution_type: process_change
severity: medium
tags:
  - ce-work
  - ce-review
  - design-iterator
  - visual-audit
  - shipping-gate
---

# Visual audit is non-optional when shipping user-facing UI — code review alone misses what users see

## Problem

`/ce:review` with all 10 conditional reviewers — correctness, testing, maintainability, project-standards, security, adversarial, performance, kieran-typescript, julik-frontend-races, agent-native — produces a thorough code-level review but **does not catch bugs that only manifest visually**:

- A Tailwind JIT class extraction failure that renders the entire graph canvas invisible
- A copy/data mismatch where the headline says "improved" but the displayed numbers show a decline
- Labels overlapping or clipping outside an SVG viewBox
- Hover states that don't surface their indicator
- Mobile rendering that breaks the layout assumptions desktop verified

These are not edge cases. They are normal, frequent failure modes for UI work. Code review, even at high reviewer count, can't see them — the reviewers are reading the source, not running the page.

## Symptoms

- `/ce:review` returns "Ready to merge" or "Ready with fixes" verdict with no P0 findings.
- `pnpm tsc`, `pnpm lint`, `pnpm build`, `pnpm test` all green.
- User loads the actual deployed (or local) page → immediately notices something is wrong.
- Worst case: the bug has been shipping in production for weeks, affecting an adjacent surface the current PR didn't touch.

Example from this session: PR #128 consolidated two demo surfaces. `/ce:review` (10 reviewers, mode:report-only) returned a clean P1/P2/P3 list — no P0. The design-iterator visual audit (15 screenshots, desktop + mobile) immediately found:

- **P0** — the graph canvas rendering as a constellation of black dots with no visible edges. Tailwind JIT was dropping the fill/stroke classes (see `docs/solutions/runtime-errors/tailwind-content-glob-missing-classes-2026-05-16.md`). The bug was **pre-existing for weeks** on the authed `/record?mode=map` view — code review had never caught it.
- **P1** — `/demo` sparkline copy ("Sleep efficiency lifted ~4 percentage points / ↗ IMPROVED") contradicted its own displayed numbers ("Start 84.7% Now 81.0%" = 3.7-point drop). Pre-existing.
- **P1** — 3 tier-1 canvas labels overlapping (clinical-condition + lab-source-hub names colliding at the 720×480 viewBox).
- **P1** — 3 source-document labels clipping outside the SVG viewBox (one off the left edge, two below the bottom).

The code-review pass had no way to catch any of these. The visual audit caught all of them in one pass.

## What Didn't Work

- **More code reviewers.** Adding deeper reviewers (Kieran-style strict, adversarial, frontend-races) raised the bar for code correctness but did not introduce visual fidelity to the review.
- **Type checks + lint + build.** All green. None test rendering fidelity.
- **`curl` smoke tests of the route.** Returned 200. A 200 status does not mean the UI is right.
- **Authoring a thorough test plan in the PR body.** The plan was specific ("Vercel Preview canvas should render ~38 nodes / ~58 edges across 3 hierarchies") but the test plan was for a *reviewer*, not for an *automated check*. A reviewer who reads the plan and ticks the box without actually loading the page in a browser is just nodding through a checklist.

## Solution

When `/ce:work` is finishing a changeset that touches user-facing UI, **dispatch the `design-iterator` agent against the running localhost** before declaring "Ready to ship." Output is screenshots + a structured findings report with severity.

The trigger condition is **any** of:
- Files under `src/components/` that render DOM
- Routes under `src/app/` that render JSX
- `tailwind.config.ts` or `*.css` changes
- Design-system primitive changes (typography, colour, spacing, motion, surface treatment)

The audit should test desktop **and** mobile viewports. Both viewports often surface different issues — the consolidation audit found mobile-list completeness gaps on top of the desktop canvas-encoding bug.

The audit's verdict gates the ship. A "PASS" with concrete observations + screenshots is the green light. A "needs fixes" requires the fixes to land before push.

## Why This Works

The `design-iterator` agent (or any browser-based UI agent: `figma-design-sync`, `design-implementation-reviewer`) loads the actual rendered page in a real browser, takes screenshots, inspects computed CSS values, evaluates against the project's frontend-design principles. It sees what users see.

This is the only review layer that exercises the full stack — CSS bundle, hydration, motion, image loading, font rendering, color application, responsive breakpoints, focus states. Code review tests the source; the visual audit tests the output. They are not substitutes; they are different layers of the same review.

Cost: one agent dispatch (~5-10 minutes wall-time, 15-20 screenshots). Savings: catching a P0 (like an invisible canvas) before shipping. The asymmetry strongly favors making the audit a gate, not a "nice to have."

## Prevention

1. **`/ce:work` Phase 2 — when the changeset is UI-touching, do not mark "ready to ship" without a visual-audit pass.** This belongs in the workflow contract, not as a per-engineer reminder.

2. **The audit's verdict is the gate.** A "PASS" means ship. A "FAIL" or "needs work" means fix before push. There is no "I'll fix it in a follow-up" allowed for visual-audit P0s.

3. **Audit output is PR evidence.** Attach the screenshots + findings table to the PR body. Reviewers gain context they couldn't have from a diff alone. PR #128 did this in the consolidation PR's "Audit findings deferred to follow-ups" section — it was load-bearing for the second commit.

4. **Don't conflate `/ce:review` with the visual audit.** They test different layers:
   - `/ce:review` → source correctness, edge cases, security, maintainability
   - Visual audit → rendered output, layout, motion, perception
   
   Both are needed for UI work. Skipping either creates a blind spot.

5. **The audit is also a regression check beyond the current PR.** The design-iterator caught the pre-existing canvas-encoding bug while auditing the consolidation. Visual audits running on UI work tend to find adjacent bugs in the same surface — treat that as a bonus, not a scope creep.

6. **For headless or text-only deploys** (API-only changes, doc updates, backend refactors), the audit is skippable. Be deliberate about when to skip; the cost of a wrong skip is shipping a P0.

## Related Issues

- This session, PR #128 (`feat/consolidate-demo-surface`). The Tailwind glob bug (`docs/solutions/runtime-errors/tailwind-content-glob-missing-classes-2026-05-16.md`) was found by the visual audit and fixed in PR #128's second commit. Code review had cleared the same PR.
- Adjacent learning: `docs/solutions/best-practices/search-adjacent-dirs-before-planning-2026-05-16.md` — both are about catching gaps the default workflow misses. Different gaps, same principle: explicit checks for the failure mode you can't see.
- The `design-iterator` agent's structured findings table (with severity, file:line refs, polish proposals) is high-leverage. Treat its output as a PR review artifact, not a one-off suggestion.
