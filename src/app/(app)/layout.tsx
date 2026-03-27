'use client';

import { usePathname } from 'next/navigation';
import { BottomNav } from '@/components/ui/bottom-nav';
import type { NavTab } from '@/types';

const pathToTab: Record<string, NavTab> = {
  '/home': 'home',
  '/protocol': 'protocol',
  '/check-in': 'check-in',
  '/insights': 'insights',
  '/you': 'you',
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = Object.entries(pathToTab).find(([path]) => pathname.startsWith(path))?.[1] || 'home';

  return (
    <div className="min-h-screen bg-bg">
      <main className="pb-24">{children}</main>
      <BottomNav active={active} />
    </div>
  );
}
