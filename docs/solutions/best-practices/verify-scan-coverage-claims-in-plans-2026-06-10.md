---
title: "When a plan claims a static check covers a location, the plan must quote the check's roots inline"
date: 2026-06-10
category: docs/solutions/best-practices
module: ce:plan workflow / phase-1 research
problem_type: false_assumption
component: planning, compliance
symptoms:
  - "Plan asserts 'X is scanned by construction' / 'guard covers Y' without quoting the check's config"
  - "Full test suite stays green during ce:work because the asserted check silently isn't running on the new code"
  - "Code review (much later) catches that the asserted coverage doesn't exist"
root_cause: planning_assumed_coverage_without_reading_check_config
resolution_type: process_change
severity: high
tags:
  - ce-plan
  - phase-1
  - compliance
  - static-checks
  - guards
---

# When a plan claims a static check covers a location, the plan must quote the check's roots inline

## Problem

Plans regularly assert that an existing guard, scan, or lint covers a piece of new code: "the compliance scan covers `src/lib`," "GDPR completeness guards catch this new model," "the forbidden-phrase linter forbids X." These assertions are usually right — the codebase's checks are aggressively-scoped — but when they're wrong, the consequence is silent: the code ships, all tests pass, and the check that was supposed to enforce the invariant simply isn't running on it.

This session's worked example: plan 2026-06-10-001 moved canned `/demo/ask` copy out of `src/app/demo/ask/page.tsx` (scanned) into `src/lib/demo/ask-sequences.ts` (a new home). The plan's Key Technical Decisions read: *"Content module is scanned by construction: sequence copy lives in `src/lib/demo/ask-sequences.ts` and the card components — both under SCAN_ROOTS."* That was false. SCAN_ROOTS in `src/lib/compliance/static-copy.test.ts:21` reads `['src/components', 'src/app', 'content/marketing', 'content/priority-markers', 'content/test-routes']`. No `src/lib`. The compliance scan stopped running on the canned copy the moment it moved — and would have stayed stopped had review not caught it. 1,743 tests still passed.

The trigger for the mistake was specific: the planner had read the scanner's docstring (which describes "a walker that skips files containing 'fixtures'") and had cited it correctly. The walker description was true; the SCAN_ROOTS assumption was a separate claim that had not been verified by reading the array.

## Symptoms

- Plan asserts coverage in prose ("scanned by construction," "GDPR guard covers it") without quoting the check's config.
- During ce:work, no test fails because the check stopped running on the new location.
- Code review's cross-file tracer or compliance angle catches the gap — or it ships.

## What Didn't Work

- **The full test suite.** A guard that doesn't run on the new code produces zero failures. Green ≠ covered.
- **Plan doc-review (coherence / scope / feasibility lenses).** Reviewers check the plan against itself, not against the codebase's actual checks.
- **The author's confidence.** Static-check config is small and re-readable in seconds. Re-deriving it from memory is high-confidence and frequently wrong on the specific edge — the docstring describes the walker, not the roots.

## Solution

In ce:plan Phase 1, every "X covers Y" assertion must be followed by the quoted line that proves it. Example:

> The compliance scan covers `src/lib/demo` per `static-copy.test.ts:21` — `const SCAN_ROOTS = [..., 'src/lib/demo']`.

If the line doesn't exist, the plan must either:
1. Add the coverage as part of the unit (e.g. "Files: modify `src/lib/compliance/static-copy.test.ts` — add `'src/lib/demo'` to SCAN_ROOTS, plus a wiring test"), or
2. Locate the new code somewhere already covered, or
3. State that the new code is uncovered and explain why.

The check configs to quote, by category:

| Concern | File to quote |
|---|---|
| Static-copy compliance | `src/lib/compliance/static-copy.test.ts` SCAN_ROOTS |
| GDPR export completeness | `src/lib/account/export.ts` EXPORT_DOMAIN_MODELS (and the DMMF scan) |
| GDPR deletion residue | `src/lib/account/delete.ts` sweep |
| Forbidden-phrase / LLM linter | `src/lib/llm/linter.ts` + `src/lib/scribe/policy/forbidden-phrases.ts` |
| Tailwind class extraction | `tailwind.config.ts` content globs |
| ESLint custom rules | `.eslintrc.json` / project lint config |

When extending any of these, the plan's Files list should name the check's config explicitly — making the coverage delta a planned act, not an unverified assertion.

## Scope the fix to match the actual problem

When the SCAN_ROOTS gap was caught during this session's review, the obvious fix was "add `src/lib` to SCAN_ROOTS." That would have broken the scan: `src/lib/scribe/policy/forbidden-phrases.ts` and `src/lib/llm/linter.ts` quote the very strings the scan forbids — by design. The right fix was `src/lib/demo` only — the narrowest scope that contains the new concern.

This generalizes: when extending a check's coverage, scope the extension to the smallest path that contains the new code, not the broadest parent. The check exists with its current roots because *some* code in the broader parent is allowed to violate the rules; widening the root either breaks the suite or, worse, forces an allowlist addition that silently re-permits violations elsewhere.

## Why This Works

Static-check coverage is the most enforce-by-construction property in the codebase. When it fails to fire, no test can catch it. The plan stage is the cheapest possible place to catch the gap: quoting one line of config per assertion costs ~30 seconds per claim and reliably prevents this entire class of silent-uncoverage bug.

## Related

- docs/solutions/best-practices/search-adjacent-dirs-before-planning-2026-05-16.md — Phase 1 should also map adjacent surfaces; same "verify by reading the codebase, not by memory" discipline.
- docs/plans/2026-06-10-001-feat-demo-studio-booking-and-supply-purchase-plan.md — the plan whose SCAN_ROOTS claim was false; the post-review revision now reads "scanned — because the review made it so."
