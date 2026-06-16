import { describe, expect, it } from 'vitest';
import { FLAG_PRESENTATION } from './flag-presentation';
import type { FlagTier } from '@/types/graph';

describe('FLAG_PRESENTATION', () => {
  const tiers: FlagTier[] = ['attention', 'clinician_discussion', 'escalation'];

  it('maps every flag tier (exhaustive — no unmapped flag can render)', () => {
    for (const t of tiers) expect(FLAG_PRESENTATION[t]).toBeDefined();
  });

  it('keeps the three tiers visually + textually distinct (never blurred)', () => {
    const labels = tiers.map((t) => FLAG_PRESENTATION[t].label);
    const classes = tiers.map((t) => FLAG_PRESENTATION[t].chipClass);
    expect(new Set(labels).size).toBe(3);
    expect(new Set(classes).size).toBe(3);
  });

  it('copy is plain-English and non-alarming (no "urgent"/"danger"/"abnormal")', () => {
    for (const t of tiers) {
      expect(FLAG_PRESENTATION[t].label).not.toMatch(/urgent|danger|abnormal|critical/i);
    }
  });
});
