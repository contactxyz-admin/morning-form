'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { TimePicker } from '@/components/ui/time-picker';
import { SectionLabel } from '@/components/ui/section-label';
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
    <div className="min-h-screen bg-bg px-5 sm:px-8 pt-16 pb-32">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
        className="max-w-xl mx-auto"
      >
        <SectionLabel>Setup</SectionLabel>
        <h2 className="mt-4 font-display font-light text-display-sm sm:text-display text-text-primary -tracking-[0.03em] leading-[1.1]">
          Set your <span className="italic font-light">rhythm</span>.
        </h2>
        <p className="mt-5 text-body-lg text-text-secondary max-w-lg">
          We&rsquo;ll map your protocol to your natural schedule.
        </p>

        <div className="mt-12 space-y-6">
          <div>
            <label className="block text-label uppercase text-text-tertiary mb-3">
              When do you typically wake?
            </label>
            <TimePicker value={wakeTime} onChange={setWakeTime} />
          </div>
          <div>
            <label className="block text-label uppercase text-text-tertiary mb-3">
              When do you start winding down?
            </label>
            <TimePicker value={windDownTime} onChange={setWindDownTime} />
          </div>
        </div>

        {/* Timeline preview */}
        <div className="mt-14">
          <SectionLabel>Your daily timeline</SectionLabel>
          <div className="mt-8 relative pl-8">
            <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />

            {mockProtocolItems.map((item, i) => {
              const time =
                i === 0 ? formatTime(wakeTime) : i === 1 ? '12:30pm' : formatTime(windDownTime);
              return (
                <div key={item.id} className="relative mb-8 last:mb-0">
                  <div className="absolute -left-5 top-[7px] w-2.5 h-2.5 rounded-full bg-accent border-2 border-bg" />
                  <span className="font-mono text-caption text-accent">{time}</span>
                  <p className="mt-1 font-display font-normal text-subheading text-text-primary -tracking-[0.01em]">
                    {item.compounds}
                  </p>
                  <p className="text-caption text-text-tertiary">{item.timingCue}</p>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>

      <div className="fixed bottom-0 left-0 right-0 px-5 sm:px-8 pb-6 pt-12 bg-gradient-to-t from-bg via-bg/95 to-transparent">
        <div className="max-w-xl mx-auto">
          <Button fullWidth size="lg" onClick={handleComplete}>
            Looks good →
          </Button>
        </div>
      </div>
    </div>
  );
}
