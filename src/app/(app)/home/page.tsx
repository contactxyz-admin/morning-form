'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { SectionLabel } from '@/components/ui/section-label';
import { getGreeting, formatDate, getTimeOfDay, getDateKey } from '@/lib/utils';
import { mockProtocolItems, mockHealthSummary } from '@/lib/mock-data';
import type { HealthSummary } from '@/types';

export default function HomePage() {
  const [morningDone, setMorningDone] = useState(false);
  const [eveningDone, setEveningDone] = useState(false);
  const [sleepQuality, setSleepQuality] = useState<string | null>(null);
  const [healthSummary, setHealthSummary] = useState<HealthSummary>(mockHealthSummary);
  const timeOfDay = getTimeOfDay();

  useEffect(() => {
    const dateKey = getDateKey();
    const morning = localStorage.getItem(`mf_checkin_morning_${dateKey}`);
    const evening = localStorage.getItem(`mf_checkin_evening_${dateKey}`);
    if (morning) {
      setMorningDone(true);
      const parsed = JSON.parse(morning);
      setSleepQuality(parsed.sleepQuality);
    }
    if (evening) setEveningDone(true);

    const loadHealthSummary = async () => {
      try {
        const response = await fetch('/api/health/sync', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (data.summary) {
          setHealthSummary(data.summary as HealthSummary);
        }
      } catch (error) {
        console.error(error);
      }
    };

    loadHealthSummary();
  }, []);

  const currentProtocolItem = timeOfDay === 'morning' || timeOfDay === 'night'
    ? mockProtocolItems[0]
    : timeOfDay === 'afternoon'
    ? mockProtocolItems[1]
    : mockProtocolItems[2];

  const showMorningCheckin = (timeOfDay === 'morning' || timeOfDay === 'afternoon') && !morningDone;
  const showEveningCheckin = (timeOfDay === 'evening' || timeOfDay === 'night') && !eveningDone;
  const showPoorSleepGuidance = morningDone && sleepQuality === 'poorly';

  return (
    <div className="px-5 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <span className="font-mono text-label tracking-[0.2em] text-text-primary uppercase">
          Morning Form
        </span>
        <Link href="/guide">
          <Icon name="guide" size="md" className="text-text-tertiary hover:text-accent transition-colors" />
        </Link>
      </div>

      {/* Greeting */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <h1 className="text-heading text-text-primary">{getGreeting()}</h1>
        <p className="text-body text-text-tertiary mt-1">{formatDate(new Date())}</p>
      </motion.div>

      <div className="mt-8 space-y-4">
        {/* Morning check-in card */}
        {showMorningCheckin && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Link href="/check-in">
              <Card variant="action" accentColor="teal" clickable>
                <SectionLabel>MORNING CHECK-IN</SectionLabel>
                <p className="mt-2 text-body text-text-secondary">
                  How did you sleep? How are you feeling?
                </p>
                <p className="mt-3 text-caption text-accent font-medium">Start check-in →</p>
              </Card>
            </Link>
          </motion.div>
        )}

        {/* Evening check-in card */}
        {showEveningCheckin && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Link href="/check-in">
              <Card variant="action" accentColor="teal" clickable>
                <SectionLabel>EVENING CHECK-IN</SectionLabel>
                <p className="mt-2 text-body text-text-secondary">
                  How was your focus? How&apos;s your energy?
                </p>
                <p className="mt-3 text-caption text-accent font-medium">Start check-in →</p>
              </Card>
            </Link>
          </motion.div>
        )}

        {/* Check-in complete */}
        {morningDone && (timeOfDay === 'morning' || timeOfDay === 'afternoon') && (
          <Card variant="default" className="opacity-60">
            <div className="flex items-center gap-2">
              <Icon name="check" size="sm" className="text-positive" />
              <span className="text-caption text-text-tertiary">Morning check-in complete</span>
            </div>
          </Card>
        )}

        {/* Poor sleep guidance */}
        {showPoorSleepGuidance && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card variant="action" accentColor="amber">
              <p className="text-body text-text-secondary leading-relaxed">
                After poor sleep, your focus window may be shorter today. Consider front-loading
                important work. Your protocol is designed to buffer this — don&apos;t skip the afternoon dose.
              </p>
            </Card>
          </motion.div>
        )}

        {/* Next protocol */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card variant="default">
            <SectionLabel>NEXT UP</SectionLabel>
            <h3 className="mt-2 text-subheading font-medium text-text-primary">{currentProtocolItem.compounds}</h3>
            <p className="mt-1 font-mono text-data text-accent">{currentProtocolItem.dosage}</p>
            <p className="mt-1 text-caption text-text-tertiary">{currentProtocolItem.timingCue}</p>
            <Link href="/protocol" className="mt-3 inline-block text-caption text-accent font-medium hover:underline">
              View detail →
            </Link>
          </Card>
        </motion.div>

        {/* Health data summary (if connected) */}
        {healthSummary.recovery.hrv && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card variant="default">
              <SectionLabel>FROM YOUR DEVICES</SectionLabel>
              <div className="mt-3 grid grid-cols-3 gap-4">
                <div>
                  <p className="font-mono text-data text-accent">{healthSummary.recovery.hrv}</p>
                  <p className="text-caption text-text-tertiary">HRV</p>
                </div>
                <div>
                  <p className="font-mono text-data text-accent">{healthSummary.sleep.duration}h</p>
                  <p className="text-caption text-text-tertiary">Sleep</p>
                </div>
                <div>
                  <p className="font-mono text-data text-accent">{healthSummary.recovery.recoveryScore ?? '—'}{healthSummary.recovery.recoveryScore ? '%' : ''}</p>
                  <p className="text-caption text-text-tertiary">Recovery</p>
                </div>
              </div>
              <Link href="/insights" className="mt-3 inline-block text-caption text-accent font-medium hover:underline">
                See trends →
              </Link>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
