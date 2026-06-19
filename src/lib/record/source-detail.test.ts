import { describe, expect, it } from 'vitest';
import { authorityLabel, flagRank, groundedMarkerRank } from './source-detail';
import { SOURCE_DOCUMENT_KINDS } from '@/lib/graph/types';

describe('authorityLabel', () => {
  it('returns a string for every known source kind (no crash as the enum grows)', () => {
    for (const kind of SOURCE_DOCUMENT_KINDS) {
      expect(typeof authorityLabel(kind)).toBe('string');
    }
  });

  it('calibrates trust: lab vs wearable vs self-report vs clinician', () => {
    expect(authorityLabel('lab_pdf')).toBe('Verified lab result');
    expect(authorityLabel('wearable_window')).toBe('Wearable estimate');
    expect(authorityLabel('intake_text')).toBe('Self-reported');
    expect(authorityLabel('checkin')).toBe('Self-reported');
    expect(authorityLabel('gp_record')).toBe('Clinician record');
  });

  it('returns "" (no cue) for unmapped / unknown kinds', () => {
    expect(authorityLabel('protocol')).toBe('');
    expect(authorityLabel('not_a_real_kind')).toBe('');
  });
});

describe('flagRank', () => {
  it('orders escalation < clinician_discussion < attention < no-flag', () => {
    expect(flagRank('escalation')).toBeLessThan(flagRank('clinician_discussion'));
    expect(flagRank('clinician_discussion')).toBeLessThan(flagRank('attention'));
    expect(flagRank('attention')).toBeLessThan(flagRank(undefined));
  });
});

describe('groundedMarkerRank', () => {
  it('ranks an authored flag by its tier (matches flagRank)', () => {
    expect(groundedMarkerRank('escalation', false)).toBe(flagRank('escalation'));
    expect(groundedMarkerRank('attention', false)).toBe(flagRank('attention'));
  });

  it('floats a source-only flag above unflagged, below any authored tier', () => {
    // A lab-flagged value surfaces above plain readings WITHOUT claiming a tier.
    expect(groundedMarkerRank(undefined, true)).toBeLessThan(groundedMarkerRank(undefined, false));
    expect(groundedMarkerRank('attention', false)).toBeLessThan(groundedMarkerRank(undefined, true));
  });

  it('an authored flag wins even when a source flag is also present', () => {
    expect(groundedMarkerRank('clinician_discussion', true)).toBe(flagRank('clinician_discussion'));
  });
});
