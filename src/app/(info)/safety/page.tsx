import type { Metadata } from 'next';

/**
 * /safety — the clinical posture, stated publicly.
 *
 * Grounded in the shipped guardrails: the canonical disclaimer
 * (src/components/ui/disclaimer.tsx), the refusal boundaries and
 * phrase tripwires (src/lib/scribe/policy/*), and the out-of-scope →
 * clinician-prep routing (docs/brainstorms/2026-04-21-regulatory-
 * posture-requirements.md). If the guardrails change, update this page
 * in the same PR.
 */

export const metadata: Metadata = {
  title: 'Safety & clinical — Morning Form',
  description:
    'Morning Form is a health information, interpretation, and decision-support service. It is not a medical device and does not replace clinical advice. Here is exactly where it draws the line.',
};

const SECTION_HEADING = 'font-display font-normal text-heading text-text-primary -tracking-[0.02em]';
const BODY = 'mt-3 text-body text-text-secondary leading-relaxed';

const REFUSALS: ReadonlyArray<string> = [
  'It never diagnoses, and never produces probabilistic diagnostic output.',
  'It never names a product or substance you should take, and never suggests amounts or schedules.',
  'It never advises on prescriptions — that conversation belongs to your prescribing clinician.',
  'It never triages emergencies. Anything that reads as acute routes to one message: speak to a clinician now.',
];

export default function SafetyPage() {
  return (
    <article>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
        Safety &amp; clinical
      </p>
      <h1 className="mt-6 font-display font-light text-display sm:text-display-xl text-text-primary -tracking-[0.04em] leading-[1.02]">
        Where Morning Form draws the line.
      </h1>
      <p className="mt-6 text-body-lg text-text-secondary leading-relaxed max-w-xl">
        Morning Form is a health information, interpretation, and
        decision-support service. It helps you understand your health data in
        context and prepare for conversations with your clinician. It is not
        a medical device and does not replace clinical advice.
      </p>

      <div className="mt-16 flex flex-col gap-12">
        <section>
          <h2 className={SECTION_HEADING}>What it refuses to do</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {REFUSALS.map((r) => (
              <li key={r} className="text-body text-text-secondary leading-relaxed">
                {r}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className={SECTION_HEADING}>How the line is enforced</h2>
          <p className={BODY}>
            These are not tone-of-voice guidelines — they are automated
            checks. Every generated read passes through phrase-level
            tripwires that reject named substances, quantity-and-schedule
            language, and directive treatment phrasing before anything
            reaches you. When a question falls outside the safe scope, the
            answer is not watered down: it becomes a preparation note for
            your clinician instead, with the question framed so the
            conversation starts in the right place.
          </p>
        </section>

        <section>
          <h2 className={SECTION_HEADING}>When something needs a clinician</h2>
          <p className={BODY}>
            When a marker crosses a threshold that needs real clinical
            attention, Morning Form flags it clearly, explains it in plain
            English, and recommends you speak to a clinician — with your
            trend and your latest panel ready to bring along. Flags are never
            buried, never hyped, and never sold around.
          </p>
        </section>

        <section>
          <h2 className={SECTION_HEADING}>If it is urgent</h2>
          <p className={BODY}>
            Morning Form is not an emergency service and does not monitor for
            emergencies. If you are acutely unwell, contact your local
            emergency services or your clinician directly.
          </p>
        </section>
      </div>
    </article>
  );
}
