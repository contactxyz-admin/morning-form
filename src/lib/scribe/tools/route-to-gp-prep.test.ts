import { afterEach, describe, expect, it, vi } from 'vitest';

// Flag-gated handler — mock the env module and toggle the flag per test
// (mirrors the concierge-booking route test pattern). The getter defers
// access so the const is initialised before the factory reads it.
const envMock: { SUPPLEMENT_HANDOFF_ENABLED: string } = { SUPPLEMENT_HANDOFF_ENABLED: '' };
vi.mock('@/lib/env', () => ({
  get env() {
    return envMock;
  },
}));

import { routeToGpPrepHandler } from './route-to-gp-prep';
import {
  __setReviewedEvidenceNoteForTest,
  __clearEvidenceNoteOverridesForTest,
  type EvidenceNote,
} from '../supplement-handoff/evidence-notes';
import type { ToolContext } from './types';

// route_to_gp_prep needs no DB — pass a placeholder typed via ToolContext.
const fakeDb = {} as unknown as ToolContext['db'];
const ctx = (topicKey = 'sleep-recovery'): ToolContext => ({
  db: fakeDb,
  userId: 'u1',
  topicKey,
  requestId: 'test-req-id',
});

afterEach(() => {
  envMock.SUPPLEMENT_HANDOFF_ENABLED = '';
  __clearEvidenceNoteOverridesForTest();
});

describe('route_to_gp_prep handler', () => {
  it('returns a routed payload carrying the context topicKey + trimmed reason', async () => {
    const result = await routeToGpPrepHandler.execute(ctx('iron'), {
      reason: '  starting supplements is out of scope for this scribe  ',
      suggestedQuestion: '  Should I start an iron supplement given my ferritin?  ',
    });

    expect(result).toEqual({
      routed: true,
      topicKey: 'iron',
      reason: 'starting supplements is out of scope for this scribe',
      suggestedQuestion: 'Should I start an iron supplement given my ferritin?',
    });
  });

  it('rejects too-short reason via zod parse', () => {
    const parse = routeToGpPrepHandler.parameters.safeParse({
      reason: 'no',
      suggestedQuestion: 'fine question',
    });
    expect(parse.success).toBe(false);
  });

  it('rejects too-short suggestedQuestion via zod parse', () => {
    const parse = routeToGpPrepHandler.parameters.safeParse({
      reason: 'valid reason text',
      suggestedQuestion: 'no',
    });
    expect(parse.success).toBe(false);
  });

  it('reflects the ctx.topicKey back — the scribe cannot lie about its own topic', async () => {
    const result = await routeToGpPrepHandler.execute(ctx('sleep-recovery'), {
      reason: 'prescription questions are out of scope',
      suggestedQuestion: 'Should I try melatonin?',
    });
    expect(result.topicKey).toBe('sleep-recovery');
  });
});

describe('route_to_gp_prep — clinician-mediated supplement handoff (Plan 2026-06-19-001 Unit 2)', () => {
  const reviewed: EvidenceNote = {
    category: 'sleep-supplement',
    label: 'Sleep supplements',
    note: 'The general evidence here is mixed and depends on your history — worth a clinician conversation.',
    suggestedQuestion: 'Are any over-the-counter sleep aids appropriate for me?',
    reviewedBy: 'Dr Test',
    reviewedAt: '2026-06-19',
  };

  const args = {
    reason: 'whether to start a sleep supplement is a clinician decision',
    suggestedQuestion: 'Should I consider anything over the counter for sleep?',
    category: 'sleep-supplement',
  };

  it('does NOT attach an evidence note when the flag is off (byte-for-byte legacy shape)', async () => {
    envMock.SUPPLEMENT_HANDOFF_ENABLED = '';
    __setReviewedEvidenceNoteForTest('sleep-supplement', reviewed);
    const result = await routeToGpPrepHandler.execute(ctx(), args);

    expect(result).toEqual({
      routed: true,
      topicKey: 'sleep-recovery',
      reason: args.reason,
      suggestedQuestion: args.suggestedQuestion,
    });
    expect('evidenceNote' in result).toBe(false);
  });

  it('attaches a clinician-reviewed note when the flag is on and a category is given', async () => {
    envMock.SUPPLEMENT_HANDOFF_ENABLED = 'true';
    __setReviewedEvidenceNoteForTest('sleep-supplement', reviewed);
    const result = await routeToGpPrepHandler.execute(ctx(), args);

    expect(result.category).toBe('sleep-supplement');
    expect(result.evidenceNote).toBe(reviewed.note);
    // The base handoff is untouched.
    expect(result.reason).toBe(args.reason);
    expect(result.suggestedQuestion).toBe(args.suggestedQuestion);
  });

  it('does NOT attach an UNREVIEWED note even with the flag on (the dark gate)', async () => {
    envMock.SUPPLEMENT_HANDOFF_ENABLED = 'true';
    __setReviewedEvidenceNoteForTest('sleep-supplement', {
      ...reviewed,
      reviewedBy: null,
      reviewedAt: null,
    });
    const result = await routeToGpPrepHandler.execute(ctx(), args);
    expect(result.evidenceNote).toBeUndefined();
    expect(result.category).toBeUndefined();
  });

  it('does NOT attach a note for an unknown category', async () => {
    envMock.SUPPLEMENT_HANDOFF_ENABLED = 'true';
    const result = await routeToGpPrepHandler.execute(ctx(), {
      ...args,
      category: 'not-a-category',
    });
    expect(result.evidenceNote).toBeUndefined();
  });

  it('does NOT attach when the flag is on but the scribe passed no category', async () => {
    envMock.SUPPLEMENT_HANDOFF_ENABLED = 'true';
    __setReviewedEvidenceNoteForTest('sleep-supplement', reviewed);
    const result = await routeToGpPrepHandler.execute(ctx(), {
      reason: args.reason,
      suggestedQuestion: args.suggestedQuestion,
    });
    expect(result.evidenceNote).toBeUndefined();
  });

  it('drops a reviewed note that smuggles a forbidden phrase (scan gate)', async () => {
    envMock.SUPPLEMENT_HANDOFF_ENABLED = 'true';
    __setReviewedEvidenceNoteForTest('sleep-supplement', {
      ...reviewed,
      note: 'Many people take 200mg magnesium glycinate before bed.',
    });
    const result = await routeToGpPrepHandler.execute(ctx(), args);
    expect(result.evidenceNote).toBeUndefined();
  });
});
