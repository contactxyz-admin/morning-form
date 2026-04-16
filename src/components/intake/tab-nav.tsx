'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useIntakeStore } from '@/lib/intake/store';
import type { IntakeTab } from '@/lib/intake/types';

interface TabNavProps {
  active: IntakeTab;
}

const TABS: { id: IntakeTab; label: string; href: string; index: string }[] = [
  { id: 'upload', label: 'Upload', href: '/intake/upload', index: '01' },
  { id: 'history', label: 'Your story', href: '/intake/history', index: '02' },
  { id: 'essentials', label: 'Essentials', href: '/intake/essentials', index: '03' },
];

export function TabNav({ active }: TabNavProps) {
  const documents = useIntakeStore((s) => s.documents);
  const historyText = useIntakeStore((s) => s.historyText);
  const essentialsComplete = useIntakeStore((s) => s.isEssentialsComplete());

  const status: Record<IntakeTab, boolean> = {
    upload: documents.length > 0,
    history: historyText.trim().length > 0,
    essentials: essentialsComplete,
  };

  return (
    <nav
      className="relative flex items-center gap-1 mb-12 border-b border-border"
      role="tablist"
      aria-label="Intake tabs"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        const hasContent = status[tab.id];
        return (
          <Link
            key={tab.id}
            href={tab.href}
            role="tab"
            aria-selected={isActive}
            className={cn(
              'group relative flex items-center gap-2 px-3 sm:px-4 py-3 text-body font-medium',
              'transition-colors duration-250',
              isActive
                ? 'text-text-primary'
                : 'text-text-tertiary hover:text-text-primary',
            )}
          >
            <span className="text-label font-mono uppercase opacity-60 tabular-nums">
              {tab.index}
            </span>
            <span className="-tracking-[0.01em]">{tab.label}</span>
            {hasContent && (
              <span
                aria-label="Has content"
                className={cn(
                  'inline-block w-1.5 h-1.5 rounded-full ml-0.5 transition-colors duration-250',
                  isActive ? 'bg-positive' : 'bg-positive/60',
                )}
              />
            )}
            {isActive && (
              // Shared layoutId makes the underline glide between tabs instead
              // of fade-in/fade-out — the move Apple uses on tabbar and iOS
              // segmented controls.
              <motion.span
                layoutId="intake-tab-underline"
                aria-hidden
                className="absolute -bottom-px left-0 right-0 h-px bg-text-primary"
                transition={{
                  type: 'spring',
                  stiffness: 420,
                  damping: 36,
                  mass: 0.6,
                }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
