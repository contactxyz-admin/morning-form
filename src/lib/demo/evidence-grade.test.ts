import { describe, expect, it } from 'vitest';
import { evidenceGrade, sourceKindToGrade } from './evidence-grade';

describe('sourceKindToGrade', () => {
  it('maps each source kind to its grade', () => {
    expect(sourceKindToGrade('lab_pdf')).toBe('lab');
    expect(sourceKindToGrade('gp_record')).toBe('clinician');
    expect(sourceKindToGrade('wearable_window')).toBe('device');
    expect(sourceKindToGrade('intake_text')).toBe('self_reported');
    expect(sourceKindToGrade('checkin')).toBe('self_reported');
  });
});

describe('evidenceGrade', () => {
  it('no grounding sources → inferred', () => {
    expect(evidenceGrade([])).toBe('inferred');
  });
  it('a single lab source → lab', () => {
    expect(evidenceGrade(['lab_pdf'])).toBe('lab');
  });
  it('takes the STRONGEST when a node has multiple source kinds', () => {
    expect(evidenceGrade(['checkin', 'wearable_window', 'lab_pdf'])).toBe('lab');
    expect(evidenceGrade(['checkin', 'wearable_window'])).toBe('device');
    expect(evidenceGrade(['checkin', 'gp_record'])).toBe('clinician');
  });
  it('self-report alone stays self_reported (below device/clinician/lab)', () => {
    expect(evidenceGrade(['checkin'])).toBe('self_reported');
    expect(evidenceGrade(['intake_text'])).toBe('self_reported');
  });
});
