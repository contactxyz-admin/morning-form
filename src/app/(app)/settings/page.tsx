'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import { Toggle } from '@/components/ui/toggle';
import { SectionLabel } from '@/components/ui/section-label';
import Link from 'next/link';

export default function SettingsPage() {
  const router = useRouter();
  const [wakeTime, setWakeTime] = useState('07:00');
  const [windDownTime, setWindDownTime] = useState('22:00');
  const [notifications, setNotifications] = useState({
    morning: true, protocol: true, evening: true, weekly: true,
  });

  useEffect(() => {
    const prefs = localStorage.getItem('mf_preferences');
    if (prefs) {
      const parsed = JSON.parse(prefs);
      if (parsed.wakeTime) setWakeTime(parsed.wakeTime);
      if (parsed.windDownTime) setWindDownTime(parsed.windDownTime);
    }
  }, []);

  const savePrefs = () => {
    localStorage.setItem('mf_preferences', JSON.stringify({ wakeTime, windDownTime }));
  };

  return (
    <div className="px-5 pt-6 pb-8">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-text-tertiary hover:text-text-primary">
          <Icon name="back" size="md" />
        </button>
        <h1 className="text-heading font-medium text-text-primary">Settings</h1>
      </div>

      {/* Protocol Timing */}
      <section className="mb-8">
        <SectionLabel>PROTOCOL TIMING</SectionLabel>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-caption text-text-secondary mb-1">Wake time</label>
            <input
              type="time"
              value={wakeTime}
              onChange={(e) => { setWakeTime(e.target.value); savePrefs(); }}
              className="h-11 px-4 rounded-input border border-border bg-surface text-body text-text-primary focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="block text-caption text-text-secondary mb-1">Wind-down time</label>
            <input
              type="time"
              value={windDownTime}
              onChange={(e) => { setWindDownTime(e.target.value); savePrefs(); }}
              className="h-11 px-4 rounded-input border border-border bg-surface text-body text-text-primary focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>
      </section>

      <div className="border-t border-border mb-8" />

      {/* Notifications */}
      <section className="mb-8">
        <SectionLabel>NOTIFICATIONS</SectionLabel>
        <div className="mt-4 space-y-5">
          <Toggle
            checked={notifications.morning}
            onChange={(v) => setNotifications(prev => ({ ...prev, morning: v }))}
            label="Morning check-in"
          />
          <Toggle
            checked={notifications.protocol}
            onChange={(v) => setNotifications(prev => ({ ...prev, protocol: v }))}
            label="Protocol reminders"
          />
          <Toggle
            checked={notifications.evening}
            onChange={(v) => setNotifications(prev => ({ ...prev, evening: v }))}
            label="Evening check-in"
          />
          <Toggle
            checked={notifications.weekly}
            onChange={(v) => setNotifications(prev => ({ ...prev, weekly: v }))}
            label="Weekly review"
          />
        </div>
      </section>

      <div className="border-t border-border mb-8" />

      {/* Integrations */}
      <section className="mb-8">
        <SectionLabel>HEALTH INTEGRATIONS</SectionLabel>
        <Link href="/settings/integrations" className="mt-3 inline-block text-body text-accent hover:underline">
          Manage connections →
        </Link>
      </section>

      <div className="border-t border-border mb-8" />

      {/* Account */}
      <section className="mb-8">
        <SectionLabel>ACCOUNT</SectionLabel>
        <div className="mt-4 space-y-3">
          <p className="text-body text-text-secondary">demo@morningform.com</p>
          <button className="text-caption text-accent hover:underline">Change password</button>
          <button
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              router.push('/');
              router.refresh();
            }}
            className="block text-caption text-text-secondary hover:text-text-primary transition-colors"
          >
            Sign out
          </button>
        </div>
      </section>

      <div className="border-t border-border mb-8" />

      {/* Data */}
      <section>
        <SectionLabel>DATA</SectionLabel>
        <div className="mt-4 space-y-3">
          <button className="text-body text-text-primary hover:text-accent transition-colors">Export my data</button>
          <button className="text-body text-alert hover:opacity-80 transition-opacity block">Delete account</button>
        </div>
      </section>
    </div>
  );
}
