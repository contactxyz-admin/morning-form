'use client';

import { usePathname } from 'next/navigation';
import { BottomNav } from '@/components/ui/bottom-nav';
import { resolveActiveTab } from './path-to-tab';

/**
 * Client nav wrapper: computes the active tab from the pathname and renders the
 * bottom nav. `showDecisions` is resolved server-side in the layout from
 * env.DECISIONS_ENABLED, so the flag-gated Decisions tab is hidden (not a dead
 * link to /home) while the feature is off.
 */
export function AppNav({ showDecisions }: { showDecisions: boolean }) {
  const active = resolveActiveTab(usePathname());
  return <BottomNav active={active} showDecisions={showDecisions} />;
}
