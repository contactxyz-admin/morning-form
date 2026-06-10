/**
 * `/demo/ask` canned sequences — content + state machine.
 *
 * Plan 2026-06-10-001: the demo chat generalizes from single Q/A turn
 * swaps to *sequences* — a question, a grounded answer, and (for the
 * Studio-booking and Supply-order sequences) an interactive card step
 * that advances the conversation when tapped. Everything here is
 * deterministic client-side fiction: no LLM, no DB, no payment.
 *
 * `src/lib/demo` is a static-copy SCAN_ROOT (added alongside this module
 * — src/lib at large is NOT scanned) so every line of demo copy passes
 * the compliance scan. Do NOT rename this file to anything containing
 * "fixtures" — the scan walker skips such files and the copy would
 * silently go unscanned. A wiring test in static-copy.test.ts pins both.
 */

import type { BubbleModel } from '@/components/chat/message-bubble';
import type { Referral } from '@/lib/chat/types';
import type { Citation } from '@/lib/topics/types';

export type DemoTopicKey =
  | 'general'
  | 'cardiometabolic'
  | 'sleep-recovery'
  | 'hormonal-endocrine';

/** Which interactive step, if any, follows the answer bubble. */
export type DemoInteraction = 'none' | 'studio-booking' | 'supply-order';

export interface DemoSequence {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
  readonly topicKey: DemoTopicKey;
  readonly referrals: readonly Referral[];
  readonly interaction: DemoInteraction;
  /**
   * Citations on /demo/ask must stay empty: the <Mention> chip rendered
   * by CitationList calls /api/graph/nodes/.../provenance, an authed
   * surface that would 401 for public demo visitors. Typed `never[]` so
   * a future contributor adding a real Citation fails typecheck rather
   * than silently shipping a broken chip.
   */
  readonly citations?: readonly never[];
}

// ---------------------------------------------------------------------------
// Studio + Supply preview content (deck Layers I and III).
// Prices come from src/lib/marketing/constants.ts — never literals here.
// ---------------------------------------------------------------------------

export const DEMO_STUDIO = {
  name: 'Morning Form Studio — SoHo',
  address: '19 Crosby Street, New York',
  /** Honesty tag (plan R-E): the pilot has not launched. */
  previewTag: 'Studios · pilot preview',
} as const;

export const DEMO_SUPPLY_PRODUCT = {
  name: 'Form Supply — Recovery Stack',
  descriptor:
    'Sourced and third-party tested by Morning Form, formulated around your recovery protocol.',
  /** Honesty tag (plan R-E): the Supply layer has not launched. */
  previewTag: 'Supply · launching soon',
} as const;

export const STUDIO_BOOKING_REFERENCE = 'MF-STU-4821';
export const SUPPLY_ORDER_REFERENCE = 'MF-SUP-1107';

// ---------------------------------------------------------------------------
// Slots — deterministic given `now`, never stale: the next weekday
// mornings rolling forward from tomorrow.
// ---------------------------------------------------------------------------

export interface DemoSlot {
  readonly id: string;
  readonly label: string;
}

const SLOT_TIMES = ['8:40', '9:10', '8:20'] as const;

const SLOT_DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/** One slot per upcoming weekday, one time each — always SLOT_TIMES.length slots. */
export function upcomingSlots(now: Date): readonly DemoSlot[] {
  const slots: DemoSlot[] = [];
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  while (slots.length < SLOT_TIMES.length) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day === 0 || day === 6) continue;
    slots.push({
      id: `slot-${cursor.getFullYear()}-${cursor.getMonth() + 1}-${cursor.getDate()}`,
      label: `${SLOT_DATE_FORMAT.format(cursor)} · ${SLOT_TIMES[slots.length]}`,
    });
  }
  return slots;
}

// ---------------------------------------------------------------------------
// Sequence state machine. One active sequence at a time; switching chips
// resets to INITIAL_SEQUENCE_STATE (parity with the old turn-swap UX).
// ---------------------------------------------------------------------------

export interface SequenceState {
  readonly stage: 'answered' | 'completed';
  /**
   * The slot the user tapped, stored whole. Carrying the object (not an
   * id to re-resolve) means the card and the confirmation bubble read
   * the same value by construction — no lookup, no fallback, no way for
   * the two render paths to disagree (review finding, 2026-06-10).
   */
  readonly pickedSlot: DemoSlot | null;
}

export const INITIAL_SEQUENCE_STATE: SequenceState = {
  stage: 'answered',
  pickedSlot: null,
};

export type SequenceEvent =
  | { readonly type: 'pick-slot'; readonly slot: DemoSlot }
  | { readonly type: 'confirm-order' };

/**
 * Pure transition: only the matching event advances the matching
 * interaction kind, exactly once. Completed is terminal — repeat taps
 * and mismatched events return the state unchanged.
 */
export function advanceSequence(
  sequence: DemoSequence,
  state: SequenceState,
  event: SequenceEvent,
): SequenceState {
  if (state.stage === 'completed') return state;
  if (sequence.interaction === 'studio-booking' && event.type === 'pick-slot') {
    return { stage: 'completed', pickedSlot: event.slot };
  }
  if (sequence.interaction === 'supply-order' && event.type === 'confirm-order') {
    return { stage: 'completed', pickedSlot: null };
  }
  return state;
}

// ---------------------------------------------------------------------------
// Visible items — what the page renders for (sequence, state).
// ---------------------------------------------------------------------------

export type DemoAskItem =
  | { readonly kind: 'bubble'; readonly bubble: BubbleModel }
  | {
      readonly kind: 'studio-card';
      readonly slots: readonly DemoSlot[];
      readonly pickedSlot: DemoSlot | null;
    }
  | { readonly kind: 'supply-card'; readonly ordered: boolean };

function assistantBubble(
  id: string,
  content: string,
  topicKey: DemoTopicKey,
  referrals: readonly Referral[] = [],
  citations: readonly Citation[] = [],
): BubbleModel {
  return {
    role: 'assistant',
    id,
    content,
    topicKey,
    classification: 'clinical-safe',
    citations,
    referrals,
  };
}

export function buildSequenceItems(
  sequence: DemoSequence,
  state: SequenceState,
  slots: readonly DemoSlot[],
): readonly DemoAskItem[] {
  const items: DemoAskItem[] = [
    {
      kind: 'bubble',
      bubble: { role: 'user', id: `${sequence.id}-q`, content: sequence.question },
    },
    {
      kind: 'bubble',
      bubble: assistantBubble(
        `${sequence.id}-a`,
        sequence.answer,
        sequence.topicKey,
        sequence.referrals,
        // Honors the never[] contract: today this is always empty, and the
        // type stops a sequence from carrying a real Citation; if that
        // contract is ever relaxed, the citations flow through here.
        sequence.citations ?? [],
      ),
    },
  ];

  if (sequence.interaction === 'studio-booking') {
    items.push({ kind: 'studio-card', slots, pickedSlot: state.pickedSlot });
    if (state.stage === 'completed' && state.pickedSlot) {
      items.push({
        kind: 'bubble',
        bubble: assistantBubble(
          `${sequence.id}-confirm`,
          studioBookingConfirmation(state.pickedSlot),
          sequence.topicKey,
        ),
      });
    }
  }

  if (sequence.interaction === 'supply-order') {
    items.push({ kind: 'supply-card', ordered: state.stage === 'completed' });
    if (state.stage === 'completed') {
      items.push({
        kind: 'bubble',
        bubble: assistantBubble(
          `${sequence.id}-confirm`,
          SUPPLY_ORDER_CONFIRMATION,
          sequence.topicKey,
        ),
      });
    }
  }

  return items;
}

export function studioBookingConfirmation(slot: DemoSlot): string {
  return [
    `Booked — ${slot.label} at ${DEMO_STUDIO.name}.`,
    '',
    'Your reference:',
    `- ${STUDIO_BOOKING_REFERENCE}: it is also in your confirmation email`,
    '',
    'What to expect:',
    '- The draw: a standard venous blood draw, about ten minutes door to door',
    '- Results: they land in your record automatically, usually within two days',
    '',
    'After:',
    '- This booking sits in your Decisions timeline, so the re-test closes the loop on its own card.',
  ].join('\n');
}

export const SUPPLY_ORDER_CONFIRMATION = [
  'Order confirmed.',
  '',
  'Your reference:',
  `- ${SUPPLY_ORDER_REFERENCE}: the receipt is in your email`,
  '',
  'Delivery:',
  '- Ships within two days; tracking lands in your inbox',
  '',
  'Subscription:',
  '- This stays on your monthly cycle — pause, swap, or cancel any time from Settings.',
].join('\n');

// ---------------------------------------------------------------------------
// The sequences. The first four are the original canned turns, verbatim;
// the last two are the Studio-booking and Supply-order previews.
// ---------------------------------------------------------------------------

export const DEMO_ASK_SEQUENCES: readonly [DemoSequence, ...DemoSequence[]] = [
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
    interaction: 'none',
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
    interaction: 'none',
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
    interaction: 'none',
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
    interaction: 'none',
    referrals: [],
  },
  {
    id: 'studio-booking',
    question: 'Can you book my next HbA1c draw?',
    answer: [
      'Yes — and the timing is right.',
      '',
      'What I see:',
      '- HbA1c: 5.85% → 6.10% at the mid-2025 peak → 5.78% on the latest panel',
      '- Cadence: quarterly draws, the last one about three months ago',
      '',
      'Why book now:',
      '- The reversal reads as a real trajectory change. The next quarterly draw is the one that confirms it held.',
      '',
      'Next:',
      '- I can hold a morning slot at the Studio — pick one below and you are done.',
    ].join('\n'),
    topicKey: 'general',
    interaction: 'studio-booking',
    referrals: [],
  },
  {
    id: 'supply-reorder',
    question: "I'm nearly out of my Form stack — can you reorder it?",
    answer: [
      'Done in one tap — here is what would go out.',
      '',
      'Your stack:',
      `- ${DEMO_SUPPLY_PRODUCT.name}: the formulation built around your recovery protocol`,
      '- Sourcing: supplied and third-party tested by Morning Form, batch-matched to the version you are on',
      '',
      'Context:',
      '- The recovery picture has kept improving alongside it — sleep efficiency 81% to 85.5%, HRV 38 ms to 47 ms.',
      '',
      'Next:',
      '- I can place the reorder now — confirm below.',
    ].join('\n'),
    topicKey: 'general',
    interaction: 'supply-order',
    referrals: [],
  },
];
