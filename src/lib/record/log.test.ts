import { describe, expect, it } from 'vitest';
import { deriveTopicLog } from './log';
import type { TopicLogInput } from './log';

function baseInput(overrides: Partial<TopicLogInput> = {}): TopicLogInput {
  return {
    topicKey: 'iron',
    lastCompiledAt: null,
    sources: [],
    nodes: [],
    ...overrides,
  };
}

describe('deriveTopicLog', () => {
  it('summarizes counts and compile timestamp', () => {
    const out = deriveTopicLog(
      baseInput({
        lastCompiledAt: new Date('2026-04-10T12:00:00Z'),
        sources: [
          { id: 's1', kind: 'lab_pdf', createdAt: new Date('2026-04-01T09:00:00Z') },
          { id: 's2', kind: 'intake_text', createdAt: new Date('2026-04-05T09:00:00Z') },
        ],
        nodes: [
          { id: 'n1', displayName: 'Ferritin', createdAt: new Date('2026-04-01T09:05:00Z') },
        ],
      }),
    );

    expect(out.summary.sourceCount).toBe(2);
    expect(out.summary.nodeCount).toBe(1);
    expect(out.summary.lastCompiledAt).toBe('2026-04-10T12:00:00.000Z');
    expect(out.summary.staleSinceCompile).toBe(false);
  });

  it('returns null compile timestamp for a brand-new stub topic with no history', () => {
    const out = deriveTopicLog(baseInput());
    expect(out.summary.lastCompiledAt).toBeNull();
    expect(out.entries).toEqual([]);
  });

  it('flags staleSinceCompile when a source was added after the last compile', () => {
    const out = deriveTopicLog(
      baseInput({
        lastCompiledAt: new Date('2026-04-05T09:00:00Z'),
        sources: [
          { id: 's-late', kind: 'lab_pdf', createdAt: new Date('2026-04-07T10:00:00Z') },
        ],
      }),
    );
    expect(out.summary.staleSinceCompile).toBe(true);
  });

  it('orders entries reverse-chron and links each to the right target', () => {
    const out = deriveTopicLog(
      baseInput({
        lastCompiledAt: new Date('2026-04-10T12:00:00Z'),
        sources: [
          { id: 's1', kind: 'lab_pdf', createdAt: new Date('2026-04-01T09:00:00Z') },
        ],
        nodes: [
          { id: 'n1', displayName: 'Ferritin', createdAt: new Date('2026-04-02T09:00:00Z') },
        ],
      }),
    );

    expect(out.entries.map((e) => e.kind)).toEqual([
      'topic-compiled',
      'node-added',
      'source-added',
    ]);
    expect(out.entries[0].targetHref).toBe('/topics/iron');
    expect(out.entries[1].targetHref).toBe('/graph?focus=n1');
    expect(out.entries[2].targetHref).toBe('/record/source/s1');
  });

  it('humanizes source kind in the label', () => {
    const out = deriveTopicLog(
      baseInput({
        sources: [
          { id: 's1', kind: 'lab_pdf', createdAt: new Date('2026-04-01T09:00:00Z') },
        ],
      }),
    );
    expect(out.entries[0].label).toBe('Source ingested — Lab report');
  });

  it('caps entries at 20 even when many rows feed in', () => {
    const manySources = Array.from({ length: 25 }, (_, i) => ({
      id: `s${i}`,
      kind: 'lab_pdf',
      createdAt: new Date(2026, 3, 1 + i, 9),
    }));
    const out = deriveTopicLog(baseInput({ sources: manySources }));
    expect(out.entries.length).toBe(20);
    expect(out.summary.sourceCount).toBe(25);
  });
});
