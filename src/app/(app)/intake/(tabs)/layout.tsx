'use client';

import { usePathname } from 'next/navigation';
import { TabNav } from '@/components/intake/tab-nav';
import { FinishBar } from '@/components/intake/finish-bar';
import type { IntakeTab } from '@/lib/intake/types';

// Route-group layout persists across /intake/upload | /history | /essentials
// so framer-motion's `layoutId` on the active-tab underline can glide between
// tabs on navigation. The three pages only render their form body; chrome
// (TabNav + FinishBar) lives here.
function deriveActive(pathname: string): IntakeTab {
  if (pathname.endsWith('/history')) return 'history';
  if (pathname.endsWith('/essentials')) return 'essentials';
  return 'upload';
}

export default function IntakeTabsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const active = deriveActive(pathname);
  return (
    <div className="px-6 sm:px-8 pt-10 sm:pt-14 pb-40 max-w-2xl mx-auto">
      <TabNav active={active} />
      {children}
      <FinishBar />
    </div>
  );
}
