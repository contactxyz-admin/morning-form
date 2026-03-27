'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from './icon';
import type { NavTab } from '@/types';

interface BottomNavProps {
  active: NavTab;
}

const tabs: { id: NavTab; label: string; icon: IconName; href: string }[] = [
  { id: 'home', label: 'Home', icon: 'home', href: '/home' },
  { id: 'protocol', label: 'Protocol', icon: 'protocol', href: '/protocol' },
  { id: 'check-in', label: 'Check-in', icon: 'check-in', href: '/check-in' },
  { id: 'insights', label: 'Insights', icon: 'insights', href: '/insights' },
  { id: 'you', label: 'You', icon: 'profile', href: '/you' },
];

function BottomNav({ active }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border z-40">
      <div className="flex items-center justify-around max-w-lg mx-auto h-16 pb-2">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            className={cn(
              'flex flex-col items-center gap-1 px-3 py-1.5 transition-colors',
              active === tab.id ? 'text-accent' : 'text-text-tertiary'
            )}
          >
            <Icon name={tab.icon} size="md" />
            <span className="text-[10px] font-medium tracking-wide">{tab.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

export { BottomNav };
