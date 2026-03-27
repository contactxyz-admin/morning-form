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
        <h1 className="text-heading font-medium text-text-primary mb-6">Your Profile</h1>

        {/* State profile summary */}
        <Card variant="default">
          <SectionLabel>STATE PROFILE</SectionLabel>
          <h3 className="mt-2 text-subheading font-medium text-text-primary">{mockStateProfile.primaryPattern}</h3>
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
          <div className="mt-3 flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-card border border-border bg-surface">
              <div className="w-2 h-2 rounded-full bg-positive" />
              <span className="text-caption text-text-primary">Whoop</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-card border border-border bg-surface">
              <div className="w-2 h-2 rounded-full bg-positive" />
              <span className="text-caption text-text-primary">Oura</span>
            </div>
          </div>
          <Link href="/settings/integrations" className="mt-2 inline-block text-caption text-accent hover:underline">
            Manage connections →
          </Link>
        </div>

        {/* Links */}
        <div className="mt-10">
          {links.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="flex items-center justify-between py-4 border-b border-border text-body text-text-primary hover:text-accent transition-colors"
            >
              <span>{link.label}</span>
              <Icon name="arrow-right" size="sm" className="text-text-tertiary" />
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
