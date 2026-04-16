'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useIntakeStore } from '@/lib/intake/store';
import type { IntakeTab } from '@/lib/intake/types';

interface TabNavProps {
  active: IntakeTab;
}

const TABS: { id: IntakeTab; label: string; href: string }[] = [
  { id: 'upload', label: 'Upload', href: '/intake/upload' },
  { id: 'history', label: 'Your story', href: '/intake/history' },
  { id: 'essentials', label: 'Essentials', href: '/intake/essentials' },
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
    <nav className="flex gap-2 mb-6" role="tablist" aria-label="Intake tabs">
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
              'flex-1 min-h-[44px] px-3 py-2 rounded-button text-caption font-medium text-center border transition-all',
              isActive
                ? 'bg-button text-white border-button'
                : hasContent
                ? 'bg-accent-light text-text-primary border-accent/30'
                : 'bg-surface text-text-secondary border-border hover:border-border-hover',
            )}
          >
            {tab.label}
            {hasContent && !isActive && <span aria-hidden className="ml-1.5">✓</span>}
          </Link>
        );
      })}
    </nav>
  );
}
