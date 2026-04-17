import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { generateMeshGradient, hashString } from './mesh-gradient-core';

/**
 * Deterministic mesh gradient for source thumbnails (R3), topic covers (R1),
 * and share-preview tiles (R7, R9). The pure generator lives in
 * `./mesh-gradient-core` so it's unit-testable without pulling JSX through the
 * test pipeline; this file owns the React surface only.
 */

export interface MeshGradientProps {
  /** Stable identifier — typically `source.id`, `topic.key`, or `share.tokenHash`. */
  seed: string;
  /** Optional second axis so callers can branch deterministically (e.g., by kind). */
  variant?: string;
  className?: string;
  style?: CSSProperties;
}

export function MeshGradient({ seed, variant, className, style }: MeshGradientProps) {
  return (
    <div
      aria-hidden
      className={cn('rounded-card-sm', className)}
      style={{ background: generateMeshGradient(seed, variant), ...style }}
    />
  );
}

export { generateMeshGradient, hashString };
