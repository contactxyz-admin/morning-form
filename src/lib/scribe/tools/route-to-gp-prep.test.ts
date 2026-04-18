import { describe, expect, it } from 'vitest';
import { routeToGpPrepHandler } from './route-to-gp-prep';
import type { ToolContext } from './types';

// route_to_gp_prep is a pure function — no DB needed. We pass a placeholder
// db object typed as any via ToolContext, since the handler never touches it.
const fakeDb = {} as unknown as ToolContext['db'];

describe('route_to_gp_prep handler', () => {
  it('returns a routed payload carrying the context topicKey + trimmed reason', async () => {
    const ctx: ToolContext = { db: fakeDb, userId: 'u1', topicKey: 'iron' };
    const result = await routeToGpPrepHandler.execute(ctx, {
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
    const ctx: ToolContext = { db: fakeDb, userId: 'u1', topicKey: 'sleep-recovery' };
    const result = await routeToGpPrepHandler.execute(ctx, {
      reason: 'prescription questions are out of scope',
      suggestedQuestion: 'Should I try melatonin?',
    });
    expect(result.topicKey).toBe('sleep-recovery');
  });
});
