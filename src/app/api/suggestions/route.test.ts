import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureTodaysSuggestionsMock = vi.fn();
const currentUserMock = vi.fn();

vi.mock('@/lib/session', () => ({
  getCurrentUser: () => currentUserMock(),
}));

vi.mock('@/lib/suggestions/engine', () => ({
  ensureTodaysSuggestions: (...args: unknown[]) => ensureTodaysSuggestionsMock(...args),
}));

import { GET } from './route';

beforeEach(() => {
  ensureTodaysSuggestionsMock.mockReset();
  currentUserMock.mockReset();
  currentUserMock.mockResolvedValue({ id: 'demo-user-1' });
});

describe('GET /api/suggestions', () => {
  it('returns 200 with the suggestions envelope', async () => {
    ensureTodaysSuggestionsMock.mockResolvedValue([
      {
        id: 's1',
        date: '2026-04-15T00:00:00.000Z',
        kind: 'recovery_low',
        title: 'Prioritise recovery today — consider a lighter session and an earlier bedtime',
        tier: 'moderate',
        triggeringMetricIds: ['p1'],
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0]).toMatchObject({
      kind: 'recovery_low',
      tier: 'moderate',
      triggeringMetricIds: ['p1'],
    });
    expect(ensureTodaysSuggestionsMock).toHaveBeenCalledWith('demo-user-1');
  });

  it('returns an empty envelope when no rules fire', async () => {
    ensureTodaysSuggestionsMock.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).suggestions).toEqual([]);
  });

  it('returns 500 when the engine throws', async () => {
    ensureTodaysSuggestionsMock.mockRejectedValue(new Error('boom'));
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to load suggestions');
  });

  it('returns 401 when the caller is unauthenticated', async () => {
    currentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(ensureTodaysSuggestionsMock).not.toHaveBeenCalled();
  });
});
