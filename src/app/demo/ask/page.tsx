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

type DemoTopicKey =
  | 'general'
  | 'cardiometabolic'
  | 'sleep-recovery'
  | 'hormonal-endocrine';

interface CannedTurn {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
  readonly topicKey: DemoTopicKey;
  readonly referrals: readonly Referral[];
  /**
   * Citations on /demo/ask must stay empty: the <Mention> chip rendered
   * by CitationList calls /api/graph/nodes/.../provenance, an authed
   * surface that would 401 for public demo visitors. Typed `never[]` so
   * a future contributor adding a real Citation fails typecheck rather
   * than silently shipping a broken chip.
   */
  readonly citations?: readonly never[];
}

const TURNS: readonly [CannedTurn, ...CannedTurn[]] = [
  {
    id: 'fatigue',
    question: 'Why am I tired in the afternoons?',
    answer: [
      'Afternoon fatigue looks multi-factorial in this record, not a single isolated lever.',
      '',
      'What I see:',
      '- Ferritin: low-normal across recent panels',
      '- Sleep efficiency: improving from the low 80s toward the mid 80s',
      '- Free testosterone: previously near the bottom of range',
      '',
      'What that means:',
      '- The pattern fits a compounded energy load: iron stores, recovery, and hormones all matter here.',
      '- The encouraging part is direction: ferritin and sleep efficiency are both moving the right way.',
      '',
      'Next:',
      '- The most useful follow-up is a combined view of iron status and sleep recovery rather than treating either one as the whole story.',
    ].join('\n'),
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
    answer: [
      'Yes. The direction changed enough to be meaningful across multiple quarters.',
      '',
      'What I see:',
      '- April 2024: 5.85%',
      '- Mid-2025 peak: 6.10%',
      '- Latest panel: about 5.78%',
      '',
      'Interpretation:',
      '- That is a reversal from the prediabetic band back toward the earlier baseline.',
      '- Because the shift appears across quarters, it reads more like a real trajectory change than a one-off fluctuation.',
    ].join('\n'),
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
    answer: [
      'Sleep is steadily improving, and the recovery signal is becoming more reliable.',
      '',
      'What I see:',
      '- Sleep efficiency: about 81% to 85.5%',
      '- HRV: 38 ms to 47 ms',
      '- Short nights: less frequent than in the earlier window',
      '',
      'What that means:',
      '- The trend points toward better recovery rather than just a few better nights.',
      '- The clearest break lines up with the August 2025 routine changes.',
    ].join('\n'),
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
  {
    id: 'iron-empty',
    question: 'What iron results are in my record?',
    answer: [
      "I don't have iron results in this record yet.",
      '',
      'Checked:',
      '- Ferritin: not found',
      '- Serum iron: not found',
      '- Transferrin saturation: not found',
      '- Haemoglobin: not found',
      '',
      'Next:',
      '- The useful next step is adding a recent iron panel or lab report so the record has values to compare.',
    ].join('\n'),
    topicKey: 'cardiometabolic',
    referrals: [],
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
      // Empty by contract — see CannedTurn.citations docstring.
      citations: turn.citations ?? [],
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
