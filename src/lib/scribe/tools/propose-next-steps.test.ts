/**
 * propose_next_steps tool tests (Plan 2026-06-05-001 Phase A Unit 5).
 *
 * Test-first on the validation boundary — the safety property lives here.
 */
import { describe, expect, it } from 'vitest';
import { proposeNextStepsHandler, NEXT_STEP_VERBS } from './propose-next-steps';
import type { ToolContext } from './types';

const MOCK_CTX: ToolContext = {
  db: {} as never,
  userId: 'u1',
  topicKey: 'iron',
  requestId: 'r1',
};

describe('propose_next_steps — validation boundary', () => {
  it('accepts valid measure/discuss/track/behavior actions', async () => {
    const result = await proposeNextStepsHandler.execute(MOCK_CTX, {
      actions: [
        { verb: 'measure', label: 'Get a ferritin blood test in 3 months', markerName: 'Ferritin' },
        { verb: 'discuss', label: 'Ask your GP about your iron panel results' },
        { verb: 'track', label: 'Log your energy levels each morning', markerName: 'Energy' },
        { verb: 'behavior', label: 'Keep a consistent bedtime this week' },
      ],
    });

    expect(result.actions).toHaveLength(4);
    expect(result.dropped).toBe(0);
    expect(result.actions.map((a) => a.verb)).toEqual(['measure', 'discuss', 'track', 'behavior']);
  });

  it('rejects unknown verbs at the schema (zod enum) boundary', () => {
    // Unknown verbs are enforced by the z.enum(NEXT_STEP_VERBS) at the parse
    // boundary (the executor re-parses tool input against proposeNextStepsSchema
    // before calling execute), not by a handler-side check. A bad verb produces
    // a parse failure → tool-error frame, never a silently-dropped action.
    const parsed = proposeNextStepsHandler.parameters.safeParse({
      actions: [
        { verb: 'measure', label: 'Get a ferritin test' },
        { verb: 'prescribe', label: 'Take iron pills' },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it('drops actions whose labels contain dietary directive phrases', async () => {
    const result = await proposeNextStepsHandler.execute(MOCK_CTX, {
      actions: [
        { verb: 'measure', label: 'Get a ferritin test' },
        { verb: 'behavior', label: 'Increase your intake of iron-rich foods like spinach' },
        { verb: 'behavior', label: 'Eat more red meat at dinner' },
      ],
    });

    expect(result.actions).toHaveLength(1);
    expect(result.dropped).toBe(2);
    expect(result.actions[0].label).toBe('Get a ferritin test');
  });

  it('drops actions containing drug names or dose strings', async () => {
    const result = await proposeNextStepsHandler.execute(MOCK_CTX, {
      actions: [
        { verb: 'measure', label: 'Get a ferritin test' },
        { verb: 'discuss', label: 'Consider ferrous sulfate 65mg supplementation' },
      ],
    });

    expect(result.actions).toHaveLength(1);
    expect(result.dropped).toBe(1);
  });

  it('drops an action whose markerName contains a drug name + dose', async () => {
    const result = await proposeNextStepsHandler.execute(MOCK_CTX, {
      actions: [
        { verb: 'measure', label: 'Get a blood test', markerName: 'Ferrous sulfate 65mg' },
        { verb: 'measure', label: 'Re-test ferritin in 8 weeks', markerName: 'Ferritin' },
      ],
    });

    // The drug-name markerName action is dropped; the clean one survives.
    expect(result.actions).toHaveLength(1);
    expect(result.dropped).toBe(1);
    expect(result.actions[0].markerName).toBe('Ferritin');
    expect(result.dropReasons[0]).toMatch(/markerName/i);
  });

  it('caps label length to MAX_LABEL_LENGTH', async () => {
    const longLabel = 'x'.repeat(300);
    const result = await proposeNextStepsHandler.execute(MOCK_CTX, {
      actions: [{ verb: 'measure', label: longLabel }],
    });

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].label.length).toBeLessThanOrEqual(200);
  });

  it('returns empty actions + dropped count when all are invalid', async () => {
    const result = await proposeNextStepsHandler.execute(MOCK_CTX, {
      actions: [
        { verb: 'behavior', label: 'You should take 65mg ferrous sulfate' },
      ],
    });

    expect(result.actions).toHaveLength(0);
    expect(result.dropped).toBe(1);
  });

  it('drops action with forbidden label but keeps others', async () => {
    const result = await proposeNextStepsHandler.execute(MOCK_CTX, {
      actions: [
        { verb: 'measure', label: 'Re-test ferritin in 8 weeks' },
        { verb: 'discuss', label: 'Ask your GP whether a sleep study is appropriate' },
        { verb: 'behavior', label: 'You should take 65mg ferrous sulfate' }, // dropped
      ],
    });

    expect(result.actions).toHaveLength(2);
    expect(result.dropped).toBe(1);
    expect(result.actions.map((a) => a.verb)).toEqual(['measure', 'discuss']);
  });

  it('all 4 canonical verbs are valid', async () => {
    for (const verb of NEXT_STEP_VERBS) {
      const result = await proposeNextStepsHandler.execute(MOCK_CTX, {
        actions: [{ verb, label: `Do something with verb ${verb}` }],
      });
      expect(result.dropped).toBe(0);
    }
  });
});
