import { describe, expect, it, vi } from 'vitest';
import {
  ATTRIBUTE_SCHEMAS,
  NodeAttributesSchema,
  NodeAttributesValidationError,
  parseNodeAttributes,
  validateAttributesForWrite,
} from './attributes';
import { NODE_TYPES } from './types';

describe('ATTRIBUTE_SCHEMAS coverage', () => {
  it('declares a schema for every NodeType', () => {
    for (const t of NODE_TYPES) {
      expect(ATTRIBUTE_SCHEMAS[t]).toBeDefined();
    }
  });
});

describe('validateAttributesForWrite', () => {
  it('accepts valid medication attributes (passthrough preserves unknown keys)', () => {
    expect(() =>
      validateAttributesForWrite('medication', 'magnesium', {
        dose: '500mg',
        frequency: 'daily',
        source: 'supplement',
        // Unknown key survives passthrough:
        vendor: 'example-brand',
      }),
    ).not.toThrow();
  });

  it('accepts valid biomarker attributes using either value or latestValue', () => {
    expect(() =>
      validateAttributesForWrite('biomarker', 'ferritin', {
        value: 18,
        unit: 'ug/L',
        referenceRangeLow: 30,
        referenceRangeHigh: 400,
        flaggedOutOfRange: true,
      }),
    ).not.toThrow();
    expect(() =>
      validateAttributesForWrite('biomarker', 'haemoglobin', {
        latestValue: 12.1,
        unit: 'g/dL',
      }),
    ).not.toThrow();
  });

  it('rejects a biomarker with a string in a numeric field', () => {
    expect(() =>
      validateAttributesForWrite('biomarker', 'ferritin', {
        value: 'low' as unknown as number,
      }),
    ).toThrow(NodeAttributesValidationError);
  });

  it('rejects unknown keys on strict (biomarker) schemas', () => {
    expect(() =>
      validateAttributesForWrite('biomarker', 'ferritin', {
        value: 18,
        unit: 'ug/L',
        // Typo the extractor might produce — strict schema catches it.
        newBiomarkerField: 'nope',
      }),
    ).toThrow(NodeAttributesValidationError);
  });

  it('throws NodeAttributesValidationError with diagnostic fields', () => {
    try {
      validateAttributesForWrite('biomarker', 'ferritin', { value: 'low' as unknown as number });
      throw new Error('expected validation to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(NodeAttributesValidationError);
      const e = err as NodeAttributesValidationError;
      expect(e.nodeType).toBe('biomarker');
      expect(e.canonicalKey).toBe('ferritin');
      expect(e.issues.length).toBeGreaterThan(0);
    }
  });

  it('treats empty/undefined attributes as valid (no-op)', () => {
    expect(() => validateAttributesForWrite('biomarker', 'ferritin', undefined)).not.toThrow();
    expect(() => validateAttributesForWrite('biomarker', 'ferritin', {})).not.toThrow();
  });

  it('rejects a metric_window (strict) with unknown fields', () => {
    expect(() =>
      validateAttributesForWrite('metric_window', 'hrv-7d', {
        metric: 'hrv',
        windowStart: '2026-04-01',
        windowEnd: '2026-04-08',
        bogus: true,
      }),
    ).toThrow(NodeAttributesValidationError);
  });

  it('accepts passthrough fields on lifestyle', () => {
    expect(() =>
      validateAttributesForWrite('lifestyle', 'caffeine', {
        category: 'stimulant',
        frequency: 'daily',
        customFieldDuringMigration: 'ok',
      }),
    ).not.toThrow();
  });
});

describe('parseNodeAttributes (read-tolerant)', () => {
  it('returns {} for null/empty input without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseNodeAttributes('biomarker', null)).toEqual({});
    expect(parseNodeAttributes('biomarker', '')).toEqual({});
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns typed attributes on valid JSON', () => {
    const raw = JSON.stringify({ latestValue: 18, unit: 'ug/L' });
    const parsed = parseNodeAttributes('biomarker', raw);
    expect(parsed).toEqual({ latestValue: 18, unit: 'ug/L' });
    expect('_unvalidated' in parsed).toBe(false);
  });

  it('returns unvalidated envelope on malformed JSON and logs a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const parsed = parseNodeAttributes('biomarker', '{not-json');
    expect(parsed).toEqual({ _unvalidated: true, raw: {} });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('returns unvalidated envelope + logs warning on legacy shape mismatch (read does not throw)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Legacy row: unknown key that strict biomarker would reject on write.
    const raw = JSON.stringify({ value: 18, legacyField: 'pre-T1' });
    const parsed = parseNodeAttributes('biomarker', raw);
    expect(parsed).toMatchObject({
      _unvalidated: true,
      raw: { value: 18, legacyField: 'pre-T1' },
    });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('returns unvalidated envelope when JSON parses to a non-object (array / primitive)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseNodeAttributes('medication', JSON.stringify([1, 2, 3]))).toEqual({
      _unvalidated: true,
      raw: {},
    });
    expect(parseNodeAttributes('medication', JSON.stringify('plain-string'))).toEqual({
      _unvalidated: true,
      raw: {},
    });
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

describe('NodeAttributesSchema (discriminated union)', () => {
  it('narrows by nodeType for callers that want typed envelopes', () => {
    const parsed = NodeAttributesSchema.parse({
      nodeType: 'medication',
      attributes: { dose: '500mg', frequency: 'daily' },
    });
    // Discriminated union narrows the type on `nodeType`:
    if (parsed.nodeType === 'medication') {
      expect(parsed.attributes.dose).toBe('500mg');
    } else {
      throw new Error(`expected medication, got ${parsed.nodeType}`);
    }
  });

  it('rejects envelopes whose attributes violate the per-type contract', () => {
    const r = NodeAttributesSchema.safeParse({
      nodeType: 'biomarker',
      attributes: { value: 'low' },
    });
    expect(r.success).toBe(false);
  });
});
