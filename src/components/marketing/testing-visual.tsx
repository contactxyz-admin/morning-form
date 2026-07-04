/**
 * TestingVisual — the /[market]/testing hero's product shot.
 *
 * A static composition of the two testing routes: a draw-day booking
 * card (partner club) with the at-home kit card tucked behind it. Pure
 * presentation with no live availability — the mono "Preview" caption
 * is the honesty label, same convention as the demo's studio booking
 * card (plan 2026-06-10-001 R-E).
 */

const MONO_LABEL = 'font-mono text-[10px] uppercase tracking-[0.14em]';

const OPEN_SLOTS = ['07:20', '07:40', '08:20'] as const;

export function TestingVisual({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="relative max-w-[440px] mx-auto lg:mx-0 pt-10">
        {/* At-home kit — the second route, tucked behind the draw-day card. */}
        <div
          aria-hidden
          className="absolute top-0 right-0 sm:-right-6 w-[230px] rotate-[2.5deg] rounded-card border border-border bg-surface-warm px-4 py-3.5"
        >
          <div className="flex items-baseline justify-between">
            <span className={`${MONO_LABEL} text-text-tertiary`}>At home</span>
            <span className={`${MONO_LABEL} text-text-whisper`}>02</span>
          </div>
          <p className="mt-2 text-caption text-text-secondary">Collection kit, posted to your door</p>
          <p className="mt-1 text-caption text-text-tertiary">Prepaid return · same lab</p>
        </div>

        {/* Draw day at a partner club — the main card. */}
        <div className="relative rounded-card border border-border-mid bg-surface p-5 sm:p-6 shadow-card-hover">
          <div className="flex items-baseline justify-between">
            <span className={`${MONO_LABEL} text-text-tertiary`}>Draw day · Partner club</span>
            <span className={`${MONO_LABEL} text-text-whisper`}>01</span>
          </div>

          <p className="mt-4 text-body font-medium text-text-primary">Saturday · private room</p>
          <p className="mt-1 text-caption text-text-secondary leading-relaxed">
            A registered phlebotomist, in the building you already train in.
          </p>

          <p className={`mt-5 mb-2.5 ${MONO_LABEL} text-text-tertiary`}>Morning slots</p>
          <div className="flex flex-wrap gap-2">
            {OPEN_SLOTS.slice(0, 2).map((slot) => (
              <span
                key={slot}
                className="rounded-chip border border-border bg-surface px-3 py-1.5 text-caption text-text-secondary font-mono"
              >
                {slot}
              </span>
            ))}
            <span className="rounded-chip bg-text-primary px-3 py-1.5 text-caption text-bg font-mono">
              08:00 · booked
            </span>
            <span className="rounded-chip border border-border bg-surface px-3 py-1.5 text-caption text-text-secondary font-mono">
              {OPEN_SLOTS[2]}
            </span>
          </div>

          <div className="rule mt-5" />
          <div className="mt-4 flex items-baseline justify-between gap-3">
            <span className={`${MONO_LABEL} text-text-tertiary`}>60+ markers · one draw</span>
            <span className={`${MONO_LABEL} text-text-tertiary`}>→ your record</span>
          </div>
        </div>
      </div>

      <p className={`mt-4 ${MONO_LABEL} text-text-whisper text-center lg:text-left`}>
        Preview · booking opens in the app
      </p>
    </div>
  );
}
