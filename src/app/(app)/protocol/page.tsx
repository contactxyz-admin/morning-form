import { redirect } from 'next/navigation';

/**
 * `/protocol` was the daily-view of the previous-gen supplement-protocol
 * MVP. After the priority-markers pivot
 * (docs/plans/2026-05-10-001-feat-priority-markers-pivot-plan.md, D6) it
 * temp-redirects to /reveal/priorities until a version-history view is
 * built. Right now no user has a 2nd snapshot of priorities, so a "your
 * priorities over time" page would be empty — the redirect is honest.
 *
 * The route stays in IA so the bottom nav's `protocol` tab still resolves
 * (see src/app/(app)/path-to-tab.ts).
 */
export default function ProtocolPage() {
  redirect('/reveal/priorities');
}
