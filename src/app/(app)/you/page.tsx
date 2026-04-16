'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
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
    <div className="px-5 pt-6 pb-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-label uppercase text-text-tertiary mb-3">Profile</p>
        <h1 className="font-display font-light text-display-sm sm:text-display text-text-primary mb-8 -tracking-[0.03em]">
          Your <span className="italic font-light">edge</span>.
        </h1>

        {/* State profile summary */}
        <Card variant="default">
          <SectionLabel>STATE PROFILE</SectionLabel>
          <h3 className="mt-2 font-display font-normal text-heading text-text-primary -tracking-[0.02em]">{mockStateProfile.primaryPattern}</h3>
          <ul className="mt-3 space-y-1.5">
            {mockStateProfile.observations.slice(0, 3).map((obs) => (
              <li key={obs.label} className="text-caption text-text-secondary flex gap-2">
                <span className="text-text-tertiary shrink-0">·</span>
                <span>{obs.label}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Constraints */}
        <Card variant="action" accentColor="amber" className="mt-4">
          <SectionLabel>ACTIVE CONSTRAINTS</SectionLabel>
          <ul className="mt-2 space-y-1.5">
            {mockStateProfile.constraints.map((c) => (
              <li key={c.label} className="text-caption text-text-secondary flex gap-2">
                <span className="text-caution shrink-0">·</span>
                <span>{c.label}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Connected devices */}
        <div className="mt-8">
          <SectionLabel>CONNECTED DEVICES</SectionLabel>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-chip border border-border bg-surface">
              <div className="w-1.5 h-1.5 rounded-full bg-positive" />
              <span className="text-caption text-text-primary">Whoop</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-chip border border-border bg-surface">
              <div className="w-1.5 h-1.5 rounded-full bg-positive" />
              <span className="text-caption text-text-primary">Oura</span>
            </div>
          </div>
          <Link
            href="/settings/integrations"
            className="mt-3 inline-block text-caption text-accent font-medium hover:underline underline-offset-4 transition-colors"
          >
            Manage connections →
          </Link>
        </div>

        {/* Links */}
        <div className="mt-12 border-t border-border">
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
      </motion.div>
    </div>
  );
}
