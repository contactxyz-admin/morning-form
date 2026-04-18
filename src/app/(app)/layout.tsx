'use client';

import { usePathname } from 'next/navigation';
import { BottomNav } from '@/components/ui/bottom-nav';
import { resolveActiveTab } from './path-to-tab';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = resolveActiveTab(pathname);

  return (
    <div className="min-h-screen bg-bg">
      <main className="pb-24">{children}</main>
      <BottomNav active={active} />
    </div>
  );
}
