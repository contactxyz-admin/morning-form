interface OrbitMarker {
  readonly label: string;
  readonly value: string;
  readonly angle: number;
  readonly dotClass: string;
}

const ORBIT_MARKERS: ReadonlyArray<OrbitMarker> = [
  { label: 'HbA1c', value: '5.2%', angle: 0, dotClass: 'bg-brand-blue-500' },
  { label: 'Ferritin', value: '98', angle: 60, dotClass: 'bg-brand-sage-500' },
  { label: 'Cortisol', value: 'am', angle: 120, dotClass: 'bg-brand-lavender-500' },
  { label: 'Vitamin D', value: '72', angle: 180, dotClass: 'bg-brand-blue-700' },
  { label: 'hs-CRP', value: '0.4', angle: 240, dotClass: 'bg-brand-orange-500' },
  { label: 'TSH', value: '1.8', angle: 300, dotClass: 'bg-brand-sage-700' },
];

/**
 * Testing hero visual — a ring of marker chips orbiting a "60+ markers,
 * one draw" badge. Purely decorative (aria-hidden); the honest specifics
 * (real booking slots, kit journey) live in the "Two ways to test"
 * section below, not here.
 */
export function MarkerOrbit({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`relative min-h-[380px] sm:min-h-[440px] overflow-hidden rounded-card shadow-md ${className ?? ''}`}
      style={{
        background:
          'radial-gradient(120% 110% at 78% 18%, rgba(249,232,251,0.85) 0%, rgba(227,243,255,0.9) 44%, rgba(223,230,193,0.55) 100%)',
      }}
    >
      <div className="absolute inset-0">
        <div className="absolute inset-0 animate-orbit">
          {ORBIT_MARKERS.map((m) => (
            <div
              key={m.label}
              className="absolute left-1/2 top-1/2"
              style={{ transform: `translate(-50%,-50%) rotate(${m.angle}deg) translateY(clamp(-168px,-15vw,-118px)) rotate(${-m.angle}deg)` }}
            >
              <div className="animate-orbit-counter flex items-center gap-1.5 whitespace-nowrap rounded-chip border border-white/90 bg-white/90 px-3.5 py-2 font-mono text-[11px] shadow-hairline backdrop-blur-sm">
                <span className={`h-1.5 w-1.5 rounded-full ${m.dotClass}`} />
                {m.label} <span className="text-text-secondary">{m.value}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="absolute inset-0 grid place-items-center">
          <div className="relative grid place-items-center">
            <div className="animate-pulse-glow absolute h-[150px] w-[150px] sm:h-[190px] sm:w-[190px] rounded-full bg-[radial-gradient(circle,rgba(147,188,219,0.35)_0%,rgba(147,188,219,0)_70%)]" />
            <div className="relative grid h-[104px] w-[104px] place-items-center rounded-full text-center shadow-md sm:h-[130px] sm:w-[130px]" style={{ background: 'radial-gradient(circle at 32% 30%, #FFFFFF 0%, #E3F3FF 100%)' }}>
              <div>
                <div className="font-display text-[30px] font-light leading-none tracking-[-0.02em] sm:text-[38px]">60+</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-text-secondary">
                  markers · 1 draw
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex justify-between px-[18px] py-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-brand-grey-300">
        <span>Eight body systems</span>
        <span>→ your record</span>
      </div>
    </div>
  );
}
