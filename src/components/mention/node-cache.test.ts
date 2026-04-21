/**
 * `node-cache` is the hydration store behind `<Mention>`. Component
 * rendering is covered manually (no jsdom in this repo), but the caching
 * and subscriber contract has enough shape to pin down here: dedupe of
 * in-flight requests, subscriber notification on status transitions, and
 * re-loading after a failed fetch.
 */
import { describe, expect, it, vi } from 'vitest';
import { createNodeCache } from './node-cache';
import type { GraphNodeWire } from '@/types/graph';

function makeNode(id: string): GraphNodeWire {
  return {
    id,
    userId: 'user-1',
    type: 'biomarker',
    canonicalKey: `canonical-${id}`,
    displayName: `Node ${id}`,
    attributes: {},
    confidence: 1,
    promoted: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    tier: 1,
    score: 0.5,
  };
}

describe('node-cache', () => {
  it('transitions loading → ready and notifies subscribers once', async () => {
    let resolve!: (n: GraphNodeWire) => void;
    const fetcher = vi.fn(
      () => new Promise<GraphNodeWire>((r) => (resolve = r)),
    );
    const cache = createNodeCache(fetcher);

    const listener = vi.fn();
    cache.subscribe('a', listener);

    const first = cache.load('a');
    expect(first.status).toBe('loading');
    expect(listener).toHaveBeenCalledTimes(1);

    resolve(makeNode('a'));
    await Promise.resolve();
    await Promise.resolve();

    expect(cache.get('a')).toMatchObject({ status: 'ready' });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent loads for the same id', async () => {
    let resolve!: (n: GraphNodeWire) => void;
    const fetcher = vi.fn(
      () => new Promise<GraphNodeWire>((r) => (resolve = r)),
    );
    const cache = createNodeCache(fetcher);

    cache.load('a');
    cache.load('a');
    cache.load('a');

    expect(fetcher).toHaveBeenCalledTimes(1);

    resolve(makeNode('a'));
    await Promise.resolve();
    await Promise.resolve();
    expect(cache.get('a')).toMatchObject({ status: 'ready' });
  });

  it('captures fetch errors and allows retry', async () => {
    let reject!: (err: Error) => void;
    let resolve!: (n: GraphNodeWire) => void;
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<GraphNodeWire>((_, r) => (reject = r)),
      )
      .mockImplementationOnce(
        () => new Promise<GraphNodeWire>((r) => (resolve = r)),
      );
    const cache = createNodeCache(fetcher);

    cache.load('a');
    reject(new Error('HTTP 500'));
    await Promise.resolve();
    await Promise.resolve();

    const afterError = cache.get('a');
    expect(afterError).toEqual({ status: 'error', message: 'HTTP 500' });

    // Retry: load() should re-fetch from an error state.
    cache.load('a');
    expect(fetcher).toHaveBeenCalledTimes(2);

    resolve(makeNode('a'));
    await Promise.resolve();
    await Promise.resolve();
    expect(cache.get('a')).toMatchObject({ status: 'ready' });
  });

  it('does not notify listeners after unsubscribe', async () => {
    let resolve!: (n: GraphNodeWire) => void;
    const fetcher = () => new Promise<GraphNodeWire>((r) => (resolve = r));
    const cache = createNodeCache(fetcher);

    const listener = vi.fn();
    const unsub = cache.subscribe('a', listener);
    cache.load('a');
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    resolve(makeNode('a'));
    await Promise.resolve();
    await Promise.resolve();

    // Listener was called on the initial `loading` transition only; the
    // `ready` transition after unsubscribe must not reach it.
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('serves cached ready entries without re-fetching', async () => {
    const fetcher = vi.fn(async () => makeNode('a'));
    const cache = createNodeCache(fetcher);

    cache.load('a');
    await Promise.resolve();
    await Promise.resolve();

    cache.load('a');
    cache.load('a');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
