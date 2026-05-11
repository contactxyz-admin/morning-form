---
title: Server Action as a shared CTA instrumentation bridge across server + client variants
date: 2026-05-11
category: best-practices
module: reveal/priorities
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - A single CTA must be instrumented identically across a server component and a 'use client' component variant of the same route
  - The instrumentation must survive a feature-flag flip without rewiring the analytics read side
  - You want one counter key, not two flag-specific keys stitched downstream
related_components:
  - database
tags:
  - server-actions
  - nextjs-app-router
  - feature-flags
  - instrumentation
  - diagnostics
  - cta-tracking
  - funnel
---

# Server Action as a shared CTA instrumentation bridge across server + client variants

## Context

When a route's content is split behind a feature flag — one server-component variant and one `'use client'` variant of the same destination — any shared CTA must record identical instrumentation before navigating, or the funnel read breaks the moment the flag flips. In `morning-form`, `/reveal/priorities` flag-gates between `<PrioritiesInterstitial />` (server bridge, rendered when `PRIORITY_MARKERS_ENABLED` is unset) and `<PrioritiesClient />` (rich client surface, rendered when the flag flips). Both versions need to fire a `priorities-to-intake-click` Diagnostic counter and then redirect to `/intake`.

A view-stage proxy (counting users who *reach* `/reveal/priorities`) was tried first and removed: resolving it off `Priorities.createdAt` was co-current with the `essentials` stage because both rows are written in the same assessment-POST transaction, which broke the funnel chain math and reported zero temporal separation between stages (session history). The direct click signal sidesteps the co-currency problem entirely.

Forking the call site per variant guarantees they drift, and inlining `<Link>` on one side while using `router.push` on the other means at least one variant has no instrumentation at all. The pattern below collapses both paths through a single Server Action so the funnel survives any future flag flip without UNION-with-rename gymnastics on the read side.

## Guidance

Define one Server Action that owns both the side effect and the redirect, then call it from a `<form action={...}>` in every variant — regardless of whether the variant is a server component or a client component.

```ts
// src/app/reveal/priorities/actions.ts
'use server';

import { redirect } from 'next/navigation';
import { incrementDiagnostic } from '@/lib/marketing/diagnostic';

export async function trackIntakeClickAndRedirect(): Promise<void> {
  await incrementDiagnostic('priorities-to-intake-click');
  redirect('/intake');
}
```

The canonical `<form action>` signature is `(formData: FormData) => void | Promise<void>`. Omitting the parameter is allowed (TS accepts it via parameter bivariance) and appropriate here because the action has no per-form input — but if you ever read submitted fields, annotate `(formData: FormData)` so the boundary stays typed.

Both variants invoke it identically:

```tsx
// Interstitial (server component)
<form action={trackIntakeClickAndRedirect} className="mt-14">
  <Button type="submit" size="lg">Upload your last blood panel</Button>
</form>

// Rich client ('use client' component)
<form action={trackIntakeClickAndRedirect}>
  <Button type="submit" fullWidth size="lg">
    Upload your last blood panel →
  </Button>
</form>
```

## Why This Matters

- **Single funnel key across the flag flip.** One counter name covers both variants, so the conversion read never needs UNION-with-rename when `PRIORITY_MARKERS_ENABLED` flips.
- **Server Actions are variant-agnostic.** Next.js routes the action through the server whether the caller is hydrated or pure SSR — the interstitial does not need a client wrapper just to instrument a click, and the rich client does not need a separate route handler.
- **`<form action={...}>` is the natural progressive-enhancement seam.** No-JS clicks still POST and navigate; hydrated clicks use React's transition. Same observable behavior either way.
- **Redirect cannot race the counter.** The ordering is plain sequential `await` — the counter write completes, then `redirect('/intake')` throws a sentinel error Next catches at the action boundary. The guarantee comes from the `await`, not from anything special about `redirect`; the same shape works for any pre-redirect side effect.
- **First positive-conversion use of an existing error-counter helper.** `incrementDiagnostic` was introduced for Phase 0 marketing rejection paths (`visit-beacon-input-rejected`, `visit-beacon-rate-limit-1h`); the `(key, day)` upsert semantics work identically for positive events, so no new infrastructure was needed (session history).

## When to Apply

Reach for this pattern when **all** of the following hold:

- One route renders one of several variants (feature flag, A/B, segment-gated).
- The variants are a mix of server components and `'use client'` components. If one variant is a server component, the client-beacon pattern (`fetch` from `useEffect`) can't reach it — server actions are the only call path that works for both (session history).
- Every variant's primary CTA must perform the same pre-redirect side effect (instrumentation, audit log, ephemeral state write).
- The side effect must remain a single call site so that flipping the gating condition does not require coordinated changes on the analytics or read side.

If only one variant exists, or all variants are client components sharing a hook, this pattern is overkill — a shared client helper is fine.

## Examples

**Before (interstitial had no instrumentation):**

```tsx
<Link href="/intake">
  <Button size="lg">Upload your last blood panel</Button>
</Link>
```

**After (instrumented via the shared action):**

```tsx
<form action={trackIntakeClickAndRedirect} className="mt-14">
  <Button type="submit" size="lg">Upload your last blood panel</Button>
</form>
```

**Test pattern** — use `vi.hoisted` so the spies exist before `vi.mock` factories run, type the mocks against the real exports so the signatures don't silently drift, and assert against Next's stable `digest` contract instead of any internal string shape:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { incrementDiagnostic as IncrementDiagnostic } from '@/lib/marketing/diagnostic';
import type { redirect as Redirect } from 'next/navigation';

// Next signals a redirect by throwing an Error with a `digest` of
// `NEXT_REDIRECT;<type>;<path>;<status>;`. Checking the digest prefix is the
// only stable detection contract — Next's internal isRedirectError import path
// has shifted across minor versions. See app router docs for the digest shape.
const isRedirectError = (e: unknown): e is Error & { digest: string } =>
  e instanceof Error &&
  'digest' in e &&
  typeof (e as { digest: unknown }).digest === 'string' &&
  (e as { digest: string }).digest.startsWith('NEXT_REDIRECT');

const { incrementDiagnostic, redirect } = vi.hoisted(() => ({
  incrementDiagnostic: vi.fn<typeof IncrementDiagnostic>(),
  redirect: vi.fn<typeof Redirect>((path) => {
    const err = new Error('NEXT_REDIRECT') as Error & { digest: string };
    err.digest = `NEXT_REDIRECT;replace;${path};307;`;
    throw err;
  }),
}));

vi.mock('@/lib/marketing/diagnostic', () => ({ incrementDiagnostic }));
vi.mock('next/navigation', () => ({ redirect }));

import { trackIntakeClickAndRedirect } from './actions';

describe('trackIntakeClickAndRedirect', () => {
  it('increments the counter, then redirects to /intake', async () => {
    await expect(trackIntakeClickAndRedirect()).rejects.toSatisfy(isRedirectError);
    expect(incrementDiagnostic).toHaveBeenCalledWith('priorities-to-intake-click');
    expect(redirect).toHaveBeenCalledWith('/intake');
  });
});
```

`vi.hoisted` avoids the lazy-initialisation hazard you get when `vi.mock` factories reference variables defined further down in the file. Typing the spies with `typeof IncrementDiagnostic` and `typeof Redirect` means the mock signatures track the real exports — extending `incrementDiagnostic` to accept an `options` argument can't silently green a stale test. Asserting against the digest prefix instead of the literal `NEXT_REDIRECT:` string survives Next's internal shape changes.

Because `incrementDiagnostic` upserts by `(key, day)`, row growth stays O(days × keys) — the action is safe to call from any handler regardless of traffic.

## Related

- Plan: `docs/plans/2026-05-10-001-feat-priority-markers-pivot-plan.md` — Unit U8 (authoritative source of the fix).
- Plan: `docs/plans/2026-04-21-002-feat-activation-funnel-instrumentation-plan.md` — upstream plan that introduced `incrementDiagnostic` and the funnel-counter contract.
- Ideation: `docs/ideation/2026-05-10-authed-product-finishing.md` — fed the plan.
- GitHub: `#84 — Activation funnel: P1 design questions from /ce:review on #83` — upstream funnel-instrumentation thread this CTA bridge plugs into.
- Helper: `src/lib/marketing/diagnostic.ts` — `incrementDiagnostic(key, options)` upsert semantics and naming convention (`<surface>-<event>` in kebab-case).
