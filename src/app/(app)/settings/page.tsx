'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import { Toggle } from '@/components/ui/toggle';
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
    <div className="px-5 pt-6 pb-8 grain-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => router.back()}
            aria-label="Back"
            className="text-text-tertiary hover:text-text-primary transition-colors duration-300 ease-spring"
          >
            <Icon name="back" size="md" />
          </button>
          <span className="text-label uppercase text-text-tertiary">Settings</span>
        </div>
      </div>

      <div className="rise">
        <h1 className="font-display font-light text-display sm:text-display-xl text-text-primary mb-12 -tracking-[0.04em]">
          Preferences.
        </h1>
      </div>

      <div className="space-y-12 stagger">
        {/* Protocol Timing */}
        <section>
          <div className="flex items-baseline gap-2.5 mb-5">
            <span className="font-mono text-label uppercase text-text-tertiary">01</span>
            <span className="text-label uppercase text-text-tertiary">Protocol timing</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
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

        <div className="rule" />

        {/* Notifications */}
        <section>
          <div className="flex items-baseline gap-2.5 mb-5">
            <span className="font-mono text-label uppercase text-text-tertiary">02</span>
            <span className="text-label uppercase text-text-tertiary">Notifications</span>
          </div>
          <div className="space-y-5">
            <Toggle
              checked={notifications.morning}
              onChange={(v) => setNotifications((prev) => ({ ...prev, morning: v }))}
              label="Morning check-in"
            />
            <Toggle
              checked={notifications.protocol}
              onChange={(v) => setNotifications((prev) => ({ ...prev, protocol: v }))}
              label="Protocol reminders"
            />
            <Toggle
              checked={notifications.evening}
              onChange={(v) => setNotifications((prev) => ({ ...prev, evening: v }))}
              label="Evening check-in"
            />
            <Toggle
              checked={notifications.weekly}
              onChange={(v) => setNotifications((prev) => ({ ...prev, weekly: v }))}
              label="Weekly review"
            />
          </div>
        </section>

        <div className="rule" />

        {/* Integrations */}
        <section>
          <div className="flex items-baseline gap-2.5 mb-4">
            <span className="font-mono text-label uppercase text-text-tertiary">03</span>
            <span className="text-label uppercase text-text-tertiary">Health integrations</span>
          </div>
          <Link
            href="/settings/integrations"
            className="inline-flex items-center gap-1.5 text-body text-accent font-medium group"
          >
            Manage connections
            <span aria-hidden className="transition-transform duration-450 ease-spring group-hover:translate-x-0.5">→</span>
          </Link>
        </section>

        <div className="rule" />

        {/* Account */}
        <section>
          <div className="flex items-baseline gap-2.5 mb-4">
            <span className="font-mono text-label uppercase text-text-tertiary">04</span>
            <span className="text-label uppercase text-text-tertiary">Account</span>
          </div>
          <div className="space-y-3">
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

        <div className="rule" />

        {/* Data */}
        <section>
          <div className="flex items-baseline gap-2.5 mb-4">
            <span className="font-mono text-label uppercase text-text-tertiary">05</span>
            <span className="text-label uppercase text-text-tertiary">Data</span>
          </div>
          <div className="space-y-3">
            <button className="text-body text-text-primary hover:text-accent transition-colors duration-300 ease-spring block">
              Export my data
            </button>
            <button className="text-body text-alert hover:opacity-80 transition-opacity block">
              Delete account
            </button>
          </div>
        </section>

        <div className="rule" />

        {/* Privacy */}
        <section>
          <div className="flex items-baseline gap-2.5 mb-4">
            <span className="font-mono text-label uppercase text-text-tertiary">06</span>
            <span className="text-label uppercase text-text-tertiary">Privacy</span>
          </div>
          <Link
            href="/settings/privacy"
            className="inline-flex items-center gap-1.5 text-body text-accent font-medium group"
          >
            Sub-processors & your rights
            <span aria-hidden className="transition-transform duration-450 ease-spring group-hover:translate-x-0.5">→</span>
          </Link>
        </section>
      </div>
    </div>
  );
}
