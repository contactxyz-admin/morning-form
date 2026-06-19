import { afterEach, describe, expect, it } from 'vitest';
import {
  resolveEvidenceNote,
  __setReviewedEvidenceNoteForTest,
  __clearEvidenceNoteOverridesForTest,
  type EvidenceNote,
} from './evidence-notes';

afterEach(() => {
  __clearEvidenceNoteOverridesForTest();
});

const reviewed = (over: Partial<EvidenceNote> = {}): EvidenceNote => ({
  category: 'sleep-supplement',
  label: 'Sleep supplements',
  note: 'The general evidence here is mixed and depends on your history — worth a clinician conversation rather than a self-start.',
  suggestedQuestion: 'Are any over-the-counter sleep aids appropriate for me?',
  reviewedBy: 'Dr Test',
  reviewedAt: '2026-06-19',
  ...over,
});

describe('supplement-handoff evidence notes', () => {
  it('the seeded sleep-supplement note is clinician-reviewed and resolves (live)', () => {
    const note = resolveEvidenceNote('sleep-supplement');
    expect(note).not.toBeNull();
    expect(note?.category).toBe('sleep-supplement');
    expect(note?.note).toMatch(/clinician|pharmacist/i);
  });

  it('returns null for an unknown category', () => {
    expect(resolveEvidenceNote('not-a-category')).toBeNull();
  });

  it('resolves a clinician-reviewed, scan-clean note', () => {
    __setReviewedEvidenceNoteForTest('sleep-supplement', reviewed());
    const note = resolveEvidenceNote('sleep-supplement');
    expect(note).not.toBeNull();
    expect(note?.note).toMatch(/mixed/);
    expect(note?.category).toBe('sleep-supplement');
  });

  it('withholds a note missing either half of the clinician sign-off', () => {
    __setReviewedEvidenceNoteForTest('sleep-supplement', reviewed({ reviewedAt: null }));
    expect(resolveEvidenceNote('sleep-supplement')).toBeNull();
    __setReviewedEvidenceNoteForTest('sleep-supplement', reviewed({ reviewedBy: null }));
    expect(resolveEvidenceNote('sleep-supplement')).toBeNull();
  });

  it('withholds a reviewed note whose body smuggles a drug name + dose (scan gate)', () => {
    __setReviewedEvidenceNoteForTest(
      'sleep-supplement',
      reviewed({ note: 'Take 200mg magnesium glycinate an hour before bed.' }),
    );
    expect(resolveEvidenceNote('sleep-supplement')).toBeNull();
  });

  it('withholds a reviewed note whose suggested question names a forbidden compound', () => {
    __setReviewedEvidenceNoteForTest(
      'sleep-supplement',
      reviewed({ suggestedQuestion: 'Should I start melatonin?' }),
    );
    expect(resolveEvidenceNote('sleep-supplement')).toBeNull();
  });
});
