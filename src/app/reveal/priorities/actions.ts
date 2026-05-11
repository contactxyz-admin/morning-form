'use server';

import { redirect } from 'next/navigation';
import { incrementDiagnostic } from '@/lib/marketing/diagnostic';

/**
 * Increments the `priorities-to-intake-click` Diagnostic counter, then
 * redirects to `/intake`. Called from the primary CTA on both the
 * interstitial (flag off) and the rich priorities surface (flag on) so a
 * single counter measures the conversion regardless of which variant is
 * live. Keyed `(key, day)` via the shared incrementDiagnostic helper, so
 * row growth stays O(days) even at scale.
 *
 * Plan: U8 of docs/plans/2026-05-10-001-feat-priority-markers-pivot-plan.md.
 */
export async function trackIntakeClickAndRedirect(): Promise<void> {
  await incrementDiagnostic('priorities-to-intake-click');
  redirect('/intake');
}
