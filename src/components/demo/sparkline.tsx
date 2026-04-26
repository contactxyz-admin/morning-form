/**
 * Sparkline — editorial line chart for the public `/demo` surfaces.
 *
 * Pure SVG, no deps, server-renderable. Renders an n-point line with an
 * optional vertical "inflection" rule that marks the lifestyle-intervention
 * point in the metabolic persona's 24-month arc (see
 * `prisma/fixtures/synthetic/metabolic-persona.ts`).
 *
 * The line stays a clean 1px stroke at `text-primary`; the post-inflection
 * segment optionally draws in `positive` or `alert` so the "before / after"
 * direction reads at a glance. Y-axis is auto-padded by 4% so endpoints
 * never touch the frame.
 */

export interface SparklineProps {
  readonly values: readonly number[];
  /** Index along `values` where the persona's intervention happened. */
  readonly inflectionIndex?: number;
  /**
   * Direction of improvement after the inflection. `down` means lower is
   * better (HbA1c, BP); `up` means higher is better (HRV, sleep). Drives
   * the post-inflection stroke colour.
   */
  readonly improvement?: 'up' | 'down';
  /** Domain min/max override; default = derived from values with 4% pad. */
  readonly domain?: readonly [number, number];
  readonly width?: number;
  readonly height?: number;
  readonly className?: string;
  readonly ariaLabel?: string;
}

export function Sparkline({
  values,
  inflectionIndex,
  improvement,
  domain,
  width = 320,
  height = 80,
  className,
  ariaLabel,
}: SparklineProps) {
  if (values.length < 2) return null;

  const [domMin, domMax] = domain ?? autoDomain(values);
  const span = domMax - domMin || 1;
  const stepX = width / (values.length - 1);

  const project = (v: number, i: number): [number, number] => [
    i * stepX,
    height - ((v - domMin) / span) * height,
  ];

  const points = values.map((v, i) => project(v, i));
  const linePath = toPath(points);

  // Improvement direction picks the post-inflection colour.
  // We don't recolour the pre-inflection segment — it stays ink.
  const postValues =
    inflectionIndex !== undefined && inflectionIndex < values.length - 1
      ? values.slice(inflectionIndex)
      : null;
  const postPath =
    postValues && inflectionIndex !== undefined
      ? toPath(postValues.map((v, i) => project(v, inflectionIndex + i)))
      : null;
  const postClass =
    improvement === 'up'
      ? 'stroke-positive'
      : improvement === 'down'
        ? 'stroke-positive'
        : 'stroke-text-primary';

  const inflectionX =
    inflectionIndex !== undefined ? inflectionIndex * stepX : null;

  const startPt = points[0];
  const endPt = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      className={className}
    >
      {/* Faint baseline rule — sits at the lower 4% pad so it reads as a
         tasteful frame without looking like an axis. */}
      <line
        x1={0}
        x2={width}
        y1={height - 1}
        y2={height - 1}
        className="stroke-border"
        strokeWidth={1}
      />

      {inflectionX !== null && (
        <line
          x1={inflectionX}
          x2={inflectionX}
          y1={6}
          y2={height - 4}
          className="stroke-border-mid"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      )}

      {/* Pre-inflection (or full) line — always ink. */}
      <path
        d={linePath}
        className="stroke-text-primary"
        strokeWidth={1.4}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Post-inflection overdraw in semantic colour. */}
      {postPath && (
        <path
          d={postPath}
          className={postClass}
          strokeWidth={1.6}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Endpoint dots — start hairline, end solid. */}
      <circle cx={startPt[0]} cy={startPt[1]} r={2} className="fill-border-strong" />
      <circle
        cx={endPt[0]}
        cy={endPt[1]}
        r={2.5}
        className={postPath ? postClass : 'fill-text-primary'}
        fill="currentColor"
      />
    </svg>
  );
}

function autoDomain(values: readonly number[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const pad = (max - min) * 0.08 || Math.abs(max) * 0.05 || 1;
  return [min - pad, max + pad];
}

function toPath(points: readonly (readonly [number, number])[]): string {
  return points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');
}
