/**
 * Action illustration — stepped checklist.
 *
 * Three stacked items: top is checked (filled circle + check mark + bar),
 * middle is in-progress (half-filled), bottom is queued (empty outline).
 * Communicates "ranked next steps" without specifying any clinical action,
 * which would be the kind of imperative copy our editorial-QA gate
 * (forbidden-phrases + static-copy.test.ts) is designed to catch.
 */
export function ActionIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 250"
      fill="none"
      role="presentation"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
      className={className}
    >
      {/* Item 1 — checked, top of stack. Filled circle with a check mark. */}
      <circle cx="40" cy="80" r="11" fill="#1D1D1F" />
      <path
        d="M 35 80 L 39 84 L 46 76"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <rect x="60" y="74" width="120" height="6" rx="1.5" fill="#1D1D1F" fillOpacity="0.85" />
      <rect x="60" y="86" width="78" height="5" rx="1.25" fill="#6E6E73" fillOpacity="0.32" />

      {/* Item 2 — in-progress, half-filled circle. */}
      <circle cx="40" cy="125" r="11" stroke="#1D1D1F" strokeWidth="1.5" />
      <path d="M 40 114 A 11 11 0 0 1 40 136 Z" fill="#1D1D1F" />
      <rect x="60" y="119" width="106" height="6" rx="1.5" fill="#1D1D1F" fillOpacity="0.7" />
      <rect x="60" y="131" width="64" height="5" rx="1.25" fill="#6E6E73" fillOpacity="0.32" />

      {/* Item 3 — queued, hairline outline only. */}
      <circle cx="40" cy="170" r="11" stroke="#6E6E73" strokeWidth="1.25" strokeOpacity="0.5" />
      <rect x="60" y="164" width="92" height="6" rx="1.5" fill="#6E6E73" fillOpacity="0.42" />
      <rect x="60" y="176" width="54" height="5" rx="1.25" fill="#6E6E73" fillOpacity="0.22" />
    </svg>
  );
}
