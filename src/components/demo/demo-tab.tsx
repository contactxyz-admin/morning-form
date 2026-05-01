'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * Active-aware tab link for the public `/demo/*` nav.
 *
 * Active iff `pathname === href` — the demo tabs are siblings, not a
 * hierarchy, so `/demo/record` does not highlight Overview. Lives in
 * its own client module so `DemoLayout` can stay a server component
 * (Metadata export, RSC-friendly chrome).
 */
export function DemoTab({ label, href }: { label: string; href: string }) {
  const pathname = usePathname();
  const isActive = pathname === href;
  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'font-mono text-[10px] uppercase tracking-[0.14em]',
        'transition-colors duration-300 ease-spring',
        isActive
          ? 'text-text-primary'
          : 'text-text-tertiary hover:text-text-primary',
      )}
    >
      {label}
    </Link>
  );
}
