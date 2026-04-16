'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { SectionLabel } from '@/components/ui/section-label';
import { mockStateProfile } from '@/lib/mock-data';

const links = [
  { label: 'Settings', href: '/settings' },
  { label: 'Health Integrations', href: '/settings/integrations' },
  { label: 'Data & Privacy', href: '#' },
  { label: 'Help & Support', href: '#' },
];

export default function YouPage() {
  return (
    <div className="px-5 pt-6 pb-8 grain-page">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <span aria-hidden className="block w-6 h-px bg-text-primary/60" />
        <span className="text-label uppercase text-text-tertiary">Profile</span>
      </div>

      <div className="rise">
        <h1 className="font-display font-light text-display sm:text-display-xl text-text-primary mb-10 -tracking-[0.04em]">
          Your <span className="italic text-accent">edge</span>.
        </h1>
      </div>

      <div className="space-y-4 stagger">
        {/* State profile summary */}
        <Card variant="default">
          <SectionLabel>State profile</SectionLabel>
          <h3 className="mt-2 font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
            {mockStateProfile.primaryPattern}
          </h3>
          <ul className="mt-4 space-y-2">
            {mockStateProfile.observations.slice(0, 3).map((obs) => (
              <li key={obs.label} className="text-caption text-text-secondary flex gap-2.5 leading-relaxed">
                <span aria-hidden className="text-text-whisper shrink-0 mt-1">·</span>
                <span>{obs.label}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Constraints */}
        <Card variant="action" accentColor="amber">
          <SectionLabel>Active constraints</SectionLabel>
          <ul className="mt-3 space-y-2">
            {mockStateProfile.constraints.map((c) => (
              <li key={c.label} className="text-caption text-text-secondary flex gap-2.5 leading-relaxed">
                <span aria-hidden className="text-caution shrink-0 mt-1">·</span>
                <span>{c.label}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Connected devices */}
        <div className="pt-4">
          <SectionLabel>Connected devices</SectionLabel>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-chip border border-border bg-surface hover:border-border-strong transition-colors duration-300 ease-spring">
              <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-positive" />
              <span className="text-caption text-text-primary">Whoop</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-chip border border-border bg-surface hover:border-border-strong transition-colors duration-300 ease-spring">
              <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-positive" />
              <span className="text-caption text-text-primary">Oura</span>
            </div>
          </div>
          <Link
            href="/settings/integrations"
            className="mt-4 inline-flex items-center gap-1.5 text-caption text-accent font-medium group"
          >
            Manage connections
            <span aria-hidden className="transition-transform duration-450 ease-spring group-hover:translate-x-0.5">→</span>
          </Link>
        </div>

        {/* Links */}
        <div className="mt-8 pt-4 border-t border-border">
          {links.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="group flex items-center justify-between py-4 border-b border-border text-body text-text-primary hover:text-accent transition-colors duration-300 ease-spring"
            >
              <span>{link.label}</span>
              <Icon
                name="arrow-right"
                size="sm"
                className="text-text-tertiary group-hover:text-accent group-hover:translate-x-0.5 transition-[color,transform] duration-300 ease-spring"
              />
            </Link>
          ))}
          <button className="flex items-center justify-between py-4 w-full text-body text-alert hover:opacity-80 transition-opacity">
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
