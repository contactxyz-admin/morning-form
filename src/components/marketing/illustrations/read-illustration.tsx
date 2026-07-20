/**
 * Read illustration — annotated paragraph mockup.
 *
 * Six horizontal "text bars" (varying widths, evoking ragged-right prose),
 * with one bar emphasized in text-primary and a left-margin pull-quote
 * marker. Communicates "we read this and tell you what matters" without
 * placing actual reading-level claims on the page.
 */
export function ReadIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 250"
      fill="none"
      role="presentation"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
      className={className}
    >
      {/* Pull-quote marker — vertical hairline + dot, centered on the
          highlighted bar (y=110, height=6 → center y=113). */}
      <line x1="22" y1="100" x2="22" y2="126" stroke="#161616" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="22" cy="113" r="2" fill="#161616" />

      {/* Bar widths chosen for ragged-right prose feel. y values give an
          editorial vertical rhythm rather than mechanical equal spacing. */}
      {[
        { y: 60, w: 142 },
        { y: 75, w: 158 },
        { y: 95, w: 132 },
        { y: 110, w: 146 }, // highlighted bar
        { y: 130, w: 124 },
        { y: 150, w: 154 },
        { y: 170, w: 138 },
      ].map((bar, i) => (
        <rect
          key={i}
          x="35"
          y={bar.y}
          width={bar.w}
          height="6"
          rx="1.5"
          fill={bar.y === 110 ? '#161616' : '#7E7F81'}
          fillOpacity={bar.y === 110 ? 0.85 : 0.32}
        />
      ))}

      {/* Final two bars trail off as a soft fade-to-grey. */}
      <rect x="35" y="190" width="86" height="6" rx="1.5" fill="#7E7F81" fillOpacity="0.18" />
    </svg>
  );
}
