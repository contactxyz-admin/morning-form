/**
 * Trend illustration — multi-line biomarker chart.
 *
 * Three trend lines over a soft baseline grid. The top line (text-primary)
 * is the focal trend with a "today" dot at its right edge; the lower two
 * (text-tertiary) read as background context. No labels, no numbers — just
 * shape, so the reader infers the product (your data over time) without us
 * making numerical claims a real chart would have to defend.
 *
 * Renders inline (no asset request, no Image component). Aspect ratio
 * matches the homepage card (4:5).
 */
export function TrendIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 250"
      fill="none"
      role="presentation"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
      className={className}
    >
      {/* Soft baseline grid — hairline dashed. */}
      {[80, 115, 150, 185].map((y) => (
        <line
          key={y}
          x1="20"
          y1={y}
          x2="180"
          y2={y}
          stroke="#E5E5EA"
          strokeWidth="1"
          strokeDasharray="2 4"
        />
      ))}

      {/* Background trend lines — text-tertiary. */}
      <path
        d="M 20 145 Q 50 142 80 148 T 140 142 T 180 138"
        stroke="#6E6E73"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d="M 20 175 Q 50 178 80 172 T 140 178 T 180 175"
        stroke="#6E6E73"
        strokeWidth="1.25"
        strokeLinecap="round"
      />

      {/* Foreground trend — text-primary, the focal upward line. */}
      <path
        d="M 20 120 Q 50 110 80 100 T 140 75 T 180 60"
        stroke="#1D1D1F"
        strokeWidth="1.75"
        strokeLinecap="round"
      />

      {/* "Today" dot at the right edge of the focal trend. */}
      <circle cx="180" cy="60" r="3.5" fill="#1D1D1F" />
      <circle cx="180" cy="60" r="6" fill="#1D1D1F" fillOpacity="0.12" />
    </svg>
  );
}
