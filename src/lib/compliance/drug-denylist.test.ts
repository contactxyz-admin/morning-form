import { describe, expect, it } from 'vitest';
import { lint } from '@/lib/llm/linter';
import { scanForbiddenPhrases } from '@/lib/scribe/policy/enforce';
import { FORBIDDEN_PHRASE_PATTERNS } from '@/lib/scribe/policy/forbidden-phrases';
import { MEDICATION_DENYLIST, MEDICATION_DENYLIST_PATTERNS } from './drug-denylist';

const chatBlocks = (text: string): boolean =>
  scanForbiddenPhrases(text, FORBIDDEN_PHRASE_PATTERNS).length > 0;

const topicBlocks = (text: string): boolean =>
  lint(text, { surface: 'topic' }).violations.some(
    (v) => v.rule === 'drug_name' || v.rule === 'dosage_unit',
  );

describe('shared medication denylist (Plan 2026-06-19 fast-follow)', () => {
  it('covers the prescription + product-form names the chat path used to miss', () => {
    const names = MEDICATION_DENYLIST.map((d) => d.name);
    for (const n of [
      'metformin',
      'ozempic',
      'semaglutide',
      'atorvastatin',
      'iron tablets',
      'magnesium supplement',
      'paracetamol',
    ]) {
      expect(names).toContain(n);
    }
  });

  it('the chat enforce path includes every shared medication pattern (structural no-drift)', () => {
    for (const pattern of MEDICATION_DENYLIST_PATTERNS) {
      expect(FORBIDDEN_PHRASE_PATTERNS).toContain(pattern);
    }
  });

  it('newly-unified names are blocked on BOTH the chat and topic-page surfaces', () => {
    const samples = [
      'Some clinicians prescribe metformin for this.',
      'Patients are sometimes started on ozempic.',
      'A magnesium supplement is often discussed.',
      'Iron tablets can help once the cause is known.',
      'Paracetamol is a common option.',
      'Melatonin is sometimes used for sleep.', // chat had it; the linter gains it via the shared list
    ];
    for (const text of samples) {
      expect(chatBlocks(text)).toBe(true);
      expect(topicBlocks(text)).toBe(true);
    }
  });

  it('bare nutrient nouns stay allowed on the chat path (clinician-mediated category framing)', () => {
    for (const text of [
      'Magnesium is commonly discussed for sleep — worth raising with your clinician.',
      'Your iron stores are worth discussing with your clinician.',
      'Vitamin D is worth a conversation with your clinician.',
    ]) {
      expect(chatBlocks(text)).toBe(false);
    }
  });
});
