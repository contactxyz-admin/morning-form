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
    <nav className="fixed bottom-0 left-0 right-0 bg-bg/85 backdrop-blur-xl border-t border-border z-40">
      <div className="flex items-center justify-around max-w-lg mx-auto h-16 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative flex flex-col items-center gap-1 px-3 py-1.5',
                'transition-colors duration-300 ease-spring',
                isActive ? 'text-accent' : 'text-text-tertiary hover:text-text-secondary',
              )}
            >
              <Icon name={tab.icon} size="md" />
              <span className="text-[10px] font-medium tracking-[0.04em] uppercase">
                {tab.label}
              </span>
              {isActive && (
                <span
                  aria-hidden
                  className="absolute -top-px left-1/2 -translate-x-1/2 h-[2px] w-6 rounded-full bg-accent"
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export { BottomNav };
