import { describe, expect, it } from 'vitest';
import type { RecordIndex } from '@/lib/record/types';
import { deriveStatus, formatRelative, newestTopic } from './record-anchor-helpers';

function makeRecord(overrides: Partial<RecordIndex> = {}): RecordIndex {
  return {
    topics: [],
    recentActivity: [],
    graphSummary: { nodeCount: 0, sourceCount: 0, topicCount: 0 },
    ...overrides,
  };
}

describe('formatRelative', () => {
  const now = new Date('2026-04-17T12:00:00Z').getTime();

  it('returns null for nullish input', () => {
    expect(formatRelative(null, now)).toBeNull();
  });

  it('returns null for invalid dates', () => {
    expect(formatRelative('not-a-date', now)).toBeNull();
  });

  it('returns "just now" for recent timestamps', () => {
    expect(formatRelative(new Date(now - 5_000).toISOString(), now)).toBe('just now');
  });

  it('returns minutes for sub-hour diffs', () => {
    expect(formatRelative(new Date(now - 15 * 60_000).toISOString(), now)).toBe('15m ago');
  });

  it('returns hours for sub-day diffs', () => {
    expect(formatRelative(new Date(now - 3 * 60 * 60_000).toISOString(), now)).toBe('3h ago');
  });

  it('returns days for sub-month diffs', () => {
    expect(formatRelative(new Date(now - 5 * 24 * 60 * 60_000).toISOString(), now)).toBe('5d ago');
  });

  it('returns months for older timestamps', () => {
    expect(formatRelative(new Date(now - 90 * 24 * 60 * 60_000).toISOString(), now)).toBe(
      '3mo ago',
    );
  });
});

describe('newestTopic', () => {
  it('returns null when there are no topics with updatedAt', () => {
    expect(newestTopic(makeRecord())).toBeNull();
    expect(
      newestTopic(
        makeRecord({
          topics: [
            {
              topicKey: 't1',
              displayName: 'Topic 1',
              status: 'stub',
              updatedAt: null,
              sourceCount: 0,
              nodeCount: 0,
              hasEvidence: false,
            },
          ],
        }),
      ),
    ).toBeNull();
  });

  it('picks the most recently updated topic', () => {
    const now = new Date('2026-04-17T12:00:00Z').getTime();
    const result = newestTopic(
      makeRecord({
        topics: [
          {
            topicKey: 'older',
            displayName: 'Older',
            status: 'full',
            updatedAt: new Date(now - 3 * 24 * 60 * 60_000).toISOString(),
            sourceCount: 1,
            nodeCount: 2,
            hasEvidence: true,
          },
          {
            topicKey: 'newer',
            displayName: 'Newer',
            status: 'full',
            updatedAt: new Date(now - 30 * 60_000).toISOString(),
            sourceCount: 1,
            nodeCount: 2,
            hasEvidence: true,
          },
        ],
      }),
      now,
    );
    expect(result).toEqual({ name: 'Newer', when: '30m ago' });
  });
});

describe('deriveStatus', () => {
  it('returns unauth for 401', () => {
    expect(deriveStatus({ ok: false, status: 401, data: null })).toBe('unauth');
  });

  it('returns error for non-ok responses', () => {
    expect(deriveStatus({ ok: false, status: 500, data: null })).toBe('error');
  });

  it('returns error when data is missing but status is ok', () => {
    expect(deriveStatus({ ok: true, status: 200, data: null })).toBe('error');
  });

  it('returns empty when nodeCount and sourceCount are both zero', () => {
    expect(
      deriveStatus({
        ok: true,
        status: 200,
        data: makeRecord({ graphSummary: { nodeCount: 0, sourceCount: 0, topicCount: 0 } }),
      }),
    ).toBe('empty');
  });

  it('returns ready when at least one node or source exists', () => {
    expect(
      deriveStatus({
        ok: true,
        status: 200,
        data: makeRecord({ graphSummary: { nodeCount: 0, sourceCount: 1, topicCount: 0 } }),
      }),
    ).toBe('ready');
    expect(
      deriveStatus({
        ok: true,
        status: 200,
        data: makeRecord({ graphSummary: { nodeCount: 5, sourceCount: 0, topicCount: 1 } }),
      }),
    ).toBe('ready');
  });
});
