'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import {
  RecordAnchorCard,
  type RecordAnchorState,
} from '@/components/home/record-anchor-card';
import { deriveStatus } from '@/components/home/record-anchor-helpers';
import { AskAnywhereCard } from '@/components/home/ask-anywhere-card';
import { getGreeting, formatDate, getTimeOfDay, getDateKey } from '@/lib/utils';
import { useAssessmentData } from '@/lib/hooks/use-assessment-data';
import type { HealthSummary, ProtocolItem } from '@/types';
import type { RecordIndex } from '@/lib/record/types';

const EMPTY_HEALTH_SUMMARY: HealthSummary = {
  sleep: { duration: null, quality: null, deepSleep: null, remSleep: null, restingHR: null },
  activity: { steps: null, calories: null, activeMinutes: null, strain: null },
  recovery: { hrv: null, recoveryScore: null, respiratoryRate: null },
  heart: { restingHR: null, maxHR: null, avgHR: null },
  metabolic: { glucose: null },
};

function pickNextProtocolItem(
  items: ProtocolItem[],
  timeOfDay: ReturnType<typeof getTimeOfDay>,
): ProtocolItem | undefined {
  if (items.length === 0) return undefined;
  const targetSlot =
    timeOfDay === 'afternoon' ? 'afternoon' : timeOfDay === 'evening' ? 'evening' : 'morning';
  return items.find((item) => item.timeSlot === targetSlot) ?? items[0];
}

export default function HomePage() {
  const [morningDone, setMorningDone] = useState(false);
  const [eveningDone, setEveningDone] = useState(false);
  const [sleepQuality, setSleepQuality] = useState<string | null>(null);
  const [healthSummary, setHealthSummary] = useState<HealthSummary>(EMPTY_HEALTH_SUMMARY);
  const [recordState, setRecordState] = useState<RecordAnchorState>({ status: 'loading' });
  const assessment = useAssessmentData();
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/record/index', { cache: 'no-store' });
        if (cancelled) return;
        const data = res.ok ? ((await res.json()) as RecordIndex) : null;
        if (cancelled) return;
        const status = deriveStatus({ ok: res.ok, status: res.status, data });
        if (status === 'ready' && data) {
          setRecordState({ status: 'ready', data });
        } else if (status === 'ready') {
          setRecordState({ status: 'error' });
        } else {
          setRecordState({ status });
        }
      } catch {
        if (!cancelled) setRecordState({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentProtocolItem =
    assessment.kind === 'ready'
      ? pickNextProtocolItem(assessment.data.protocol.items, timeOfDay)
      : undefined;

  const showMorningCheckin = (timeOfDay === 'morning' || timeOfDay === 'afternoon') && !morningDone;
  const showEveningCheckin = (timeOfDay === 'evening' || timeOfDay === 'night') && !eveningDone;
  const showPoorSleepGuidance = morningDone && sleepQuality === 'poorly';

  return (
    <div className="px-5 pt-6 grain-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="block w-6 h-px bg-text-primary/60" />
          <span className="text-label uppercase text-text-tertiary">Morning Form</span>
        </div>
        <Link
          href="/guide"
          aria-label="Open guide"
          className="inline-flex items-center justify-center rounded-full -m-2 p-2 focus-visible:outline-none focus-visible:shadow-ring-focus"
        >
          <Icon
            name="guide"
            size="md"
            className="text-text-tertiary hover:text-text-primary transition-colors duration-300 ease-spring"
          />
        </Link>
      </div>

      {/* Greeting */}
      <div className="grain rise -mx-5 px-5 py-4">
        <p className="font-mono text-label uppercase text-text-tertiary mb-4">
          {formatDate(new Date())}
        </p>
        <h1 className="font-display font-light text-display-xl sm:text-display-2xl text-text-primary -tracking-[0.045em] leading-[0.98]">
          {getGreeting()}
        </h1>
      </div>

      <div className="mt-12 space-y-4 stagger">
        {/* Morning check-in card */}
        {showMorningCheckin && (
          <Link href="/check-in" className="block">
            <Card variant="action" accentColor="teal" clickable>
              <div className="flex items-baseline gap-2.5 mb-2">
                <span className="font-mono text-label uppercase text-text-tertiary">01</span>
                <span className="text-label uppercase text-text-tertiary">Morning check-in</span>
              </div>
              <p className="mt-2 text-body text-text-secondary leading-relaxed">
                How did you sleep? How are you feeling?
              </p>
              <p className="mt-4 inline-flex items-center gap-1.5 text-caption text-accent font-medium group">
                Start check-in
                <span aria-hidden className="transition-transform duration-450 ease-spring group-hover:translate-x-0.5">→</span>
              </p>
            </Card>
          </Link>
        )}

        {/* Evening check-in card */}
        {showEveningCheckin && (
          <Link href="/check-in" className="block">
            <Card variant="action" accentColor="teal" clickable>
              <div className="flex items-baseline gap-2.5 mb-2">
                <span className="font-mono text-label uppercase text-text-tertiary">01</span>
                <span className="text-label uppercase text-text-tertiary">Evening check-in</span>
              </div>
              <p className="mt-2 text-body text-text-secondary leading-relaxed">
                How was your focus? How&apos;s your energy?
              </p>
              <p className="mt-4 inline-flex items-center gap-1.5 text-caption text-accent font-medium group">
                Start check-in
                <span aria-hidden className="transition-transform duration-450 ease-spring group-hover:translate-x-0.5">→</span>
              </p>
            </Card>
          </Link>
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
          <Card variant="action" accentColor="amber">
            <div className="flex items-baseline gap-2.5 mb-2">
              <span className="font-mono text-label uppercase text-text-tertiary">·</span>
              <span className="text-label uppercase text-text-tertiary">Today&rsquo;s note</span>
            </div>
            <p className="mt-2 text-body text-text-secondary leading-relaxed">
              After poor sleep, your focus window may be shorter today. Consider front-loading
              important work. Your protocol is designed to buffer this — don&apos;t skip the
              afternoon dose.
            </p>
          </Card>
        )}

        {/* Ask anything — chat entry point, sits alongside the daily brief */}
        <AskAnywhereCard />

        {/* Your record — anchor card, position 3 */}
        <RecordAnchorCard state={recordState} />

        {/* Next protocol — shown only when the user has a real protocol */}
        {currentProtocolItem && (
          <Card variant="default">
            <div className="flex items-baseline gap-2.5 mb-2">
              <span className="font-mono text-label uppercase text-text-tertiary">02</span>
              <span className="text-label uppercase text-text-tertiary">Next up</span>
            </div>
            <h3 className="mt-2 font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
              {currentProtocolItem.compounds}
            </h3>
            <p className="mt-1 font-mono text-data text-accent">{currentProtocolItem.dosage}</p>
            <p className="mt-1 text-caption text-text-tertiary">{currentProtocolItem.timingCue}</p>
            <Link
              href="/protocol"
              className="mt-4 inline-flex items-center gap-1.5 text-caption text-accent font-medium group"
            >
              View detail
              <span aria-hidden className="transition-transform duration-450 ease-spring group-hover:translate-x-0.5">→</span>
            </Link>
          </Card>
        )}

        {/* Graph view */}
        <Link href="/graph" className="block">
          <Card variant="action" accentColor="sage" clickable>
            <div className="flex items-baseline gap-2.5 mb-2">
              <span className="font-mono text-label uppercase text-text-tertiary">·</span>
              <span className="text-label uppercase text-text-tertiary">The graph view</span>
            </div>
            <p className="mt-2 text-body text-text-secondary leading-relaxed">
              See how it all connects.
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-caption text-accent font-medium group">
              Open graph
              <span aria-hidden className="transition-transform duration-450 ease-spring group-hover:translate-x-0.5">→</span>
            </p>
          </Card>
        </Link>

        {/* Health data summary (if connected) */}
        {healthSummary.recovery.hrv && (
          <Card variant="default">
            <div className="flex items-baseline gap-2.5 mb-3">
              <span className="font-mono text-label uppercase text-text-tertiary">03</span>
              <span className="text-label uppercase text-text-tertiary">From your devices</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-4">
              <div>
                <p className="font-mono text-data text-accent">{healthSummary.recovery.hrv}</p>
                <p className="mt-0.5 text-caption text-text-tertiary">HRV</p>
              </div>
              <div>
                <p className="font-mono text-data text-accent">{healthSummary.sleep.duration}h</p>
                <p className="mt-0.5 text-caption text-text-tertiary">Sleep</p>
              </div>
              <div>
                <p className="font-mono text-data text-accent">
                  {healthSummary.recovery.recoveryScore ?? '—'}
                  {healthSummary.recovery.recoveryScore ? '%' : ''}
                </p>
                <p className="mt-0.5 text-caption text-text-tertiary">Recovery</p>
              </div>
            </div>
            <Link
              href="/insights"
              className="mt-4 inline-flex items-center gap-1.5 text-caption text-accent font-medium group"
            >
              See trends
              <span aria-hidden className="transition-transform duration-450 ease-spring group-hover:translate-x-0.5">→</span>
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
}
