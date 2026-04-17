'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@/components/ui/icon';
import { getTimeOfDay, getDateKey } from '@/lib/utils';
import { cn } from '@/lib/utils';

type OptionValue = string;

interface QuickSelectProps {
  index: number;
  label: string;
  options: { label: string; value: OptionValue }[];
  selected: OptionValue | null;
  onSelect: (value: OptionValue) => void;
}

function QuickSelect({ index, label, options, selected, onSelect }: QuickSelectProps) {
  return (
    <div className="mb-10">
      <div className="flex items-baseline gap-2.5 mb-4">
        <span className="font-mono text-label uppercase text-text-tertiary">
          {String(index).padStart(2, '0')}
        </span>
        <p className="text-body-lg text-text-primary -tracking-[0.005em]">{label}</p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onSelect(opt.value)}
            aria-pressed={selected === opt.value}
            className={cn(
              'py-3 px-2 rounded-card-sm text-caption font-medium border text-center',
              'transition-[transform,background-color,border-color,color] duration-450 ease-spring',
              'active:scale-[0.97] active:duration-150',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-button-focus',
              selected === opt.value
                ? 'bg-accent text-[#FFFFFF] border-accent'
                : 'bg-surface text-text-secondary border-border hover:text-text-primary hover:border-border-strong',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CheckInPage() {
  const router = useRouter();
  const timeOfDay = getTimeOfDay();
  const isMorning = timeOfDay === 'morning' || timeOfDay === 'afternoon';
  const dateKey = getDateKey();

  const [done, setDone] = useState(false);
  const [sleepQuality, setSleepQuality] = useState<string | null>(null);
  const [currentFeeling, setCurrentFeeling] = useState<string | null>(null);
  const [focusQuality, setFocusQuality] = useState<string | null>(null);
  const [afternoonEnergy, setAfternoonEnergy] = useState<string | null>(null);
  const [protocolAdherence, setProtocolAdherence] = useState<string | null>(null);

  useEffect(() => {
    const key = isMorning ? `mf_checkin_morning_${dateKey}` : `mf_checkin_evening_${dateKey}`;
    if (localStorage.getItem(key)) setDone(true);
  }, [isMorning, dateKey]);

  const handleSubmit = () => {
    if (isMorning) {
      localStorage.setItem(
        `mf_checkin_morning_${dateKey}`,
        JSON.stringify({ sleepQuality, currentFeeling }),
      );
    } else {
      localStorage.setItem(
        `mf_checkin_evening_${dateKey}`,
        JSON.stringify({ focusQuality, afternoonEnergy, protocolAdherence }),
      );
    }
    setDone(true);
    setTimeout(() => router.push('/home'), 1200);
  };

  useEffect(() => {
    if (isMorning && sleepQuality && currentFeeling) {
      handleSubmit();
    }
  }, [sleepQuality, currentFeeling]);

  useEffect(() => {
    if (!isMorning && focusQuality && afternoonEnergy && protocolAdherence) {
      handleSubmit();
    }
  }, [focusQuality, afternoonEnergy, protocolAdherence]);

  if (done) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center px-8 grain-page">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, filter: 'blur(6px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
          className="text-center"
        >
          <Icon name="check" size="lg" className="text-positive mx-auto mb-6" />
          <p className="font-display font-light text-display sm:text-display-xl text-text-primary -tracking-[0.04em]">
            Noted.
          </p>
          <p className="mt-4 text-body-lg text-text-secondary max-w-xs mx-auto leading-relaxed">
            This shapes tomorrow&rsquo;s guidance.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="px-5 pt-6 pb-32 grain-page">
      <Link
        href="/record"
        className="group mb-5 flex items-center justify-between rounded-card border border-border-subtle bg-surface-paper/60 px-4 py-3 text-caption text-text-secondary transition-colors duration-300 ease-spring hover:border-border hover:text-text-primary"
      >
        <span>
          Now part of your{' '}
          <span className="font-medium text-text-primary">record</span>.
        </span>
        <Icon name="arrow-right" size="sm" className="text-text-tertiary group-hover:text-text-primary" />
      </Link>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="block w-6 h-px bg-text-primary/60" />
          <span className="text-label uppercase text-text-tertiary">
            {isMorning ? 'Morning' : 'Evening'}
          </span>
        </div>
        <button
          onClick={() => router.push('/home')}
          aria-label="Close"
          className="text-text-tertiary hover:text-text-primary transition-colors duration-300 ease-spring"
        >
          <Icon name="close" size="md" />
        </button>
      </div>

      <div className="rise">
        <h1 className="font-display font-light text-display sm:text-display-xl text-text-primary mb-12 -tracking-[0.04em]">
          {isMorning ? (
            <>
              How was <span className="italic text-accent">last night</span>?
            </>
          ) : (
            <>
              How did <span className="italic text-accent">today</span> land?
            </>
          )}
        </h1>

        <AnimatePresence mode="wait">
          {isMorning ? (
            <motion.div key="morning" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <QuickSelect
                index={1}
                label="How did you sleep?"
                options={[
                  { label: 'Poorly', value: 'poorly' },
                  { label: 'OK', value: 'ok' },
                  { label: 'Well', value: 'well' },
                  { label: 'Great', value: 'great' },
                ]}
                selected={sleepQuality}
                onSelect={setSleepQuality}
              />
              <QuickSelect
                index={2}
                label="How are you feeling right now?"
                options={[
                  { label: 'Low', value: 'low' },
                  { label: 'Flat', value: 'flat' },
                  { label: 'Steady', value: 'steady' },
                  { label: 'Sharp', value: 'sharp' },
                ]}
                selected={currentFeeling}
                onSelect={setCurrentFeeling}
              />
            </motion.div>
          ) : (
            <motion.div key="evening" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <QuickSelect
                index={1}
                label="How was your focus today?"
                options={[
                  { label: 'Scattered', value: 'scattered' },
                  { label: 'Variable', value: 'variable' },
                  { label: 'Good', value: 'good' },
                  { label: 'Locked in', value: 'locked-in' },
                ]}
                selected={focusQuality}
                onSelect={setFocusQuality}
              />
              <QuickSelect
                index={2}
                label="Energy through the afternoon?"
                options={[
                  { label: 'Crashed', value: 'crashed' },
                  { label: 'Dipped', value: 'dipped' },
                  { label: 'Steady', value: 'steady' },
                  { label: 'Strong', value: 'strong' },
                ]}
                selected={afternoonEnergy}
                onSelect={setAfternoonEnergy}
              />
              <QuickSelect
                index={3}
                label="Did you follow your protocol today?"
                options={[
                  { label: 'Fully', value: 'fully' },
                  { label: 'Mostly', value: 'mostly' },
                  { label: 'Partially', value: 'partially' },
                  { label: 'Skipped', value: 'skipped' },
                ]}
                selected={protocolAdherence}
                onSelect={setProtocolAdherence}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
