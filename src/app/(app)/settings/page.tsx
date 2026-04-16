'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import { Toggle } from '@/components/ui/toggle';
import { SectionLabel } from '@/components/ui/section-label';
import { TimePicker } from '@/components/ui/time-picker';
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
      <div className="flex items-center gap-3 mb-10">
        <button
          onClick={() => router.back()}
          className="text-text-tertiary hover:text-text-primary transition-colors duration-300 ease-spring"
        >
          <Icon name="back" size="md" />
        </button>
        <p className="text-label uppercase text-text-tertiary">Settings</p>
      </div>

      <h1 className="font-display font-light text-display-sm sm:text-display text-text-primary mb-10 -tracking-[0.03em]">
        Preferences.
      </h1>

      {/* Protocol Timing */}
      <section className="mb-10">
        <SectionLabel>Protocol timing</SectionLabel>
        <div className="mt-5 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-caption text-text-secondary mb-2">Wake time</label>
            <TimePicker
              value={wakeTime}
              onChange={(v) => {
                setWakeTime(v);
                savePrefs();
              }}
            />
          </div>
          <div>
            <label className="block text-caption text-text-secondary mb-2">Wind-down time</label>
            <TimePicker
              value={windDownTime}
              onChange={(v) => {
                setWindDownTime(v);
                savePrefs();
              }}
            />
          </div>
        </div>
      </section>

      <div className="border-t border-border mb-10" />

      {/* Notifications */}
      <section className="mb-10">
        <SectionLabel>Notifications</SectionLabel>
        <div className="mt-5 space-y-5">
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

      <div className="border-t border-border mb-10" />

      {/* Integrations */}
      <section className="mb-10">
        <SectionLabel>Health integrations</SectionLabel>
        <Link
          href="/settings/integrations"
          className="mt-4 inline-block text-body text-accent font-medium hover:underline underline-offset-4"
        >
          Manage connections →
        </Link>
      </section>

      <div className="border-t border-border mb-10" />

      {/* Account */}
      <section className="mb-10">
        <SectionLabel>Account</SectionLabel>
        <div className="mt-5 space-y-3">
          <p className="text-body text-text-secondary">demo@morningform.com</p>
          <button className="text-caption text-accent hover:underline underline-offset-4">
            Change password
          </button>
          <button
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              router.push('/');
              router.refresh();
            }}
            className="block text-caption text-text-secondary hover:text-text-primary transition-colors duration-300 ease-spring"
          >
            Sign out
          </button>
        </div>
      </section>

      <div className="border-t border-border mb-10" />

      {/* Data */}
      <section>
        <SectionLabel>Data</SectionLabel>
        <div className="mt-5 space-y-3">
          <button className="text-body text-text-primary hover:text-accent transition-colors duration-300 ease-spring block">
            Export my data
          </button>
          <button className="text-body text-alert hover:opacity-80 transition-opacity block">
            Delete account
          </button>
        </div>
      </section>
    </div>
  );
}
