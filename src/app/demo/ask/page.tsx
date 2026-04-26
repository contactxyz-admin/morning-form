'use client';

/**
 * `/demo/ask` — public, canned chat surface.
 *
 * No LLM call, no auth. Renders a hand-scripted conversation that
 * exercises the same `MessageList` + `MessageBubble` components as the
 * real `/ask` page, including a `ReferralChip` so visitors can see how
 * the general scribe attributes a turn to a specialist consultation.
 *
 * Picking from a suggestion chip swaps the visible turn — there is no
 * back-and-forth, just three pre-recorded answers that demonstrate the
 * surface. If we ever want a "live" demo, we can wire it to a
 * read-only LLM endpoint scoped to the persona; for now, canned keeps
 * it cheap and safe to share publicly.
 */

import { useState } from 'react';
import { MessageList } from '@/components/chat/message-list';
import type {
  AssistantBubbleModel,
  BubbleModel,
  UserBubbleModel,
} from '@/components/chat/message-bubble';
import type { Referral } from '@/lib/chat/types';

interface CannedTurn {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
  readonly topicKey: string;
  readonly referrals: readonly Referral[];
}

const TURNS: readonly CannedTurn[] = [
  {
    id: 'fatigue',
    question: 'Why am I tired in the afternoons?',
    answer:
      "A few things in your record line up with afternoon fatigue. Your ferritin has sat in the low-normal band, your 90-day sleep efficiency was running ~81% before the protocol, and your free testosterone was at the bottom of range. Each can pull energy down on its own — together they compound. The good news: ferritin and sleep efficiency are both moving in the right direction over the last three months.",
    topicKey: 'general',
    referrals: [
      {
        status: 'core',
        specialtyKey: 'sleep-recovery',
        displayName: 'Sleep and recovery',
        response:
          "Sleep efficiency has lifted from 81.0% to 85.5% across the 24-month window — broken-sleep nights are roughly halved compared with mid-2025. HRV is following: 38 ms → 47 ms. The caffeine cutoff at 14:00 and consistent wake time are likely doing the heavy lifting here.",
        requestId: 'demo-req-sleep-1',
        classification: 'clinical-safe',
      },
      {
        status: 'core',
        specialtyKey: 'hormonal-endocrine',
        displayName: 'Hormonal and endocrine health',
        response:
          "Free testosterone has climbed from 9.5 pg/mL to 11.8 pg/mL over the window — out of the bottom decile and into the middle of the reference range. TSH stayed normal throughout, which rules out thyroid as a driver of the fatigue picture.",
        requestId: 'demo-req-hormonal-1',
        classification: 'clinical-safe',
      },
    ],
  },
  {
    id: 'hba1c',
    question: 'Has my HbA1c actually changed?',
    answer:
      'Yes, meaningfully. The April 2024 value was 5.85%, drifting up to 6.10% by mid-2025 — into the prediabetic band. Since the August 2025 protocol started, it has come back down to about 5.78% on the most recent panel. Direction matters here: a clean reversal across multiple quarters reads as the lifestyle changes biting, not noise.',
    topicKey: 'cardiometabolic',
    referrals: [
      {
        status: 'core',
        specialtyKey: 'cardiometabolic',
        displayName: 'Cardiometabolic medicine',
        response:
          'HbA1c trajectory: 5.85 → 6.10 (peak Q3 2025) → 5.78 (latest). Resistance training and the Mediterranean-pattern diet land at the inflection. LDL and triglycerides are tracking the same arc; total cholesterol and HDL are the slower-moving levers.',
        requestId: 'demo-req-cardio-1',
        classification: 'clinical-safe',
      },
    ],
  },
  {
    id: 'sleep',
    question: 'How has my sleep been tracking?',
    answer:
      'Steadily improving. Across 720 nights of wearable data, your sleep efficiency has climbed from ~81% to ~85.5%, and HRV has lifted from 38 ms to 47 ms. The clearest break in the trend lines up with the August 2025 changes — caffeine cutoff at 14:00 and a consistent step target. Recovery is reading more reliably now than it did 18 months ago.',
    topicKey: 'sleep-recovery',
    referrals: [
      {
        status: 'core',
        specialtyKey: 'sleep-recovery',
        displayName: 'Sleep and recovery',
        response:
          '90-day sleep efficiency window: 81.0% → 85.5%. Total sleep median 7h 10m on the latest window, up from 6h 47m. <7h nights dropped from ~70% to ~36%. HRV trend confirms the recovery picture — autonomic balance is in a healthier place.',
        requestId: 'demo-req-sleep-2',
        classification: 'clinical-safe',
      },
    ],
  },
];

export default function DemoAskPage() {
  const [activeTurnId, setActiveTurnId] = useState<string>(TURNS[0].id);
  const turn = TURNS.find((t) => t.id === activeTurnId) ?? TURNS[0];

  const messages: BubbleModel[] = [
    {
      role: 'user',
      id: `${turn.id}-q`,
      content: turn.question,
    } satisfies UserBubbleModel,
    {
      role: 'assistant',
      id: `${turn.id}-a`,
      content: turn.answer,
      topicKey: turn.topicKey,
      classification: 'clinical-safe',
      citations: [],
      referrals: turn.referrals,
    } satisfies AssistantBubbleModel,
  ];

  return (
    <div className="pt-8 pb-12 flex flex-col gap-8">
      <div className="rise">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary mb-5">
          The chat — pre-recorded
        </p>
        <h1 className="font-display font-light text-display sm:text-display-xl text-text-primary -tracking-[0.04em]">
          A team of <span className="italic">specialists</span>, one conversation.
        </h1>
        <p className="mt-6 max-w-xl text-body-lg text-text-secondary leading-relaxed">
          The general assistant answers from your record, then consults specialists when
          the question warrants it. Each consultation lands as an expandable chip above
          the answer — open one to see what the specialist actually said.
        </p>
      </div>

      <div className="rounded-card border border-border bg-surface p-5 sm:p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary mb-4">
          Try a question
        </p>
        <div className="flex flex-wrap gap-2">
          {TURNS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTurnId(t.id)}
              className={
                t.id === activeTurnId
                  ? 'rounded-chip border border-text-primary bg-text-primary px-4 py-2 text-caption text-surface transition-[color,border-color,background-color] duration-300 ease-spring'
                  : 'rounded-chip border border-border bg-surface px-4 py-2 text-caption text-text-secondary hover:border-border-strong hover:text-text-primary transition-[color,border-color] duration-300 ease-spring'
              }
              aria-pressed={t.id === activeTurnId}
            >
              {t.question}
            </button>
          ))}
        </div>

        <div className="mt-8">
          <MessageList messages={messages} />
        </div>
      </div>

      <p className="text-caption text-text-tertiary">
        These exchanges are pre-recorded against the synthetic persona — no live LLM call.
        The full version, signed in, runs against your record and audits every turn.
      </p>
    </div>
  );
}
