'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { mockProtocolItems } from '@/lib/mock-data';
import { formatTime } from '@/lib/utils';

export default function SetupPage() {
  const router = useRouter();
  const [wakeTime, setWakeTime] = useState('07:00');
  const [windDownTime, setWindDownTime] = useState('22:00');

  const handleComplete = () => {
    localStorage.setItem('mf_preferences', JSON.stringify({ wakeTime, windDownTime }));
    localStorage.setItem('mf_onboarded', 'true');
    router.push('/home');
  };

  return (
    <div className="min-h-screen bg-bg px-5 pt-12 pb-32">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-lg mx-auto"
      >
        <h2 className="text-heading font-medium text-text-primary">Set your rhythm</h2>
        <p className="mt-2 text-body text-text-secondary">
          We&apos;ll map your protocol to your natural schedule.
        </p>

        <div className="mt-10 space-y-6">
          <div>
            <label className="block text-label uppercase tracking-widest text-text-tertiary mb-2">
              When do you typically wake?
            </label>
            <input
              type="time"
              value={wakeTime}
              onChange={(e) => setWakeTime(e.target.value)}
              className="w-full h-14 px-4 rounded-input border border-border bg-surface text-heading text-text-primary text-center focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="block text-label uppercase tracking-widest text-text-tertiary mb-2">
              When do you start winding down?
            </label>
            <input
              type="time"
              value={windDownTime}
              onChange={(e) => setWindDownTime(e.target.value)}
              className="w-full h-14 px-4 rounded-input border border-border bg-surface text-heading text-text-primary text-center focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>

        {/* Timeline preview */}
        <div className="mt-12">
          <span className="text-label uppercase tracking-widest text-text-tertiary">Your daily timeline</span>
          <div className="mt-6 relative pl-8">
            {/* Vertical line */}
            <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />

            {mockProtocolItems.map((item, i) => {
              const time = i === 0 ? formatTime(wakeTime) : i === 1 ? '12:30pm' : formatTime(windDownTime);
              return (
                <div key={item.id} className="relative mb-8 last:mb-0">
                  <div className="absolute -left-5 top-1.5 w-2.5 h-2.5 rounded-full bg-accent border-2 border-bg" />
                  <span className="font-mono text-data text-accent">{time}</span>
                  <p className="mt-1 text-body font-medium text-text-primary">{item.compounds}</p>
                  <p className="text-caption text-text-tertiary">{item.timingCue}</p>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>

      <div className="fixed bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-bg via-bg to-transparent pt-12">
        <Button fullWidth onClick={handleComplete}>
          Looks good →
        </Button>
      </div>
    </div>
  );
}
