'use client';

/**
 * Module-level registry of graph nodes keyed by id.
 *
 * The Universal `<Mention>` primitive (S1 from the chat ↔ record bridge
 * ideation) renders a citation chip that opens `NodeDetailSheet`. The sheet
 * takes a hydrated `GraphNodeWire`, but a Citation only gives us `nodeId`.
 * This module closes that gap: fetch-once on demand, cache the result, and
 * let multiple chips pointing at the same node share one in-flight request.
 *
 * Scope is deliberately narrow:
 *   - No eviction. Nodes are small and citations are bounded per turn.
 *   - No background refresh. Nodes are graph-derived and stable within a
 *     session; a page navigation or hard refresh is a fine recency signal.
 *   - No SSR. This registry is client-only; the chip itself is a `'use client'`
 *     component, so the cache never runs on the server.
 */

import type { GraphNodeWire } from '@/types/graph';

export type NodeCacheEntry =
  | { status: 'loading' }
  | { status: 'ready'; node: GraphNodeWire }
  | { status: 'error'; message: string };

type Fetcher = (nodeId: string) => Promise<GraphNodeWire>;

type Listener = () => void;

export interface NodeCache {
  get(nodeId: string): NodeCacheEntry | undefined;
  /**
   * Returns the cached entry. Kicks off a fetch the first time the node is
   * seen; subsequent calls while the fetch is in flight share that promise.
   */
  load(nodeId: string): NodeCacheEntry;
  subscribe(nodeId: string, listener: Listener): () => void;
  /** Test helper — resets internal state so specs don't leak across tests. */
  reset(): void;
}

export function createNodeCache(fetcher: Fetcher): NodeCache {
  const entries = new Map<string, NodeCacheEntry>();
  const listeners = new Map<string, Set<Listener>>();
  const inflight = new Map<string, Promise<void>>();

  function notify(nodeId: string) {
    const subs = listeners.get(nodeId);
    if (!subs) return;
    subs.forEach((cb) => cb());
  }

  function set(nodeId: string, entry: NodeCacheEntry) {
    entries.set(nodeId, entry);
    notify(nodeId);
  }

  function startLoad(nodeId: string): Promise<void> {
    const existing = inflight.get(nodeId);
    if (existing) return existing;
    const promise = (async () => {
      try {
        const node = await fetcher(nodeId);
        set(nodeId, { status: 'ready', node });
      } catch (err) {
        set(nodeId, {
          status: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      } finally {
        inflight.delete(nodeId);
      }
    })();
    inflight.set(nodeId, promise);
    return promise;
  }

  return {
    get(nodeId) {
      return entries.get(nodeId);
    },
    load(nodeId) {
      const current = entries.get(nodeId);
      if (current && current.status !== 'error') return current;
      set(nodeId, { status: 'loading' });
      void startLoad(nodeId);
      return entries.get(nodeId)!;
    },
    subscribe(nodeId, listener) {
      let subs = listeners.get(nodeId);
      if (!subs) {
        subs = new Set();
        listeners.set(nodeId, subs);
      }
      subs.add(listener);
      return () => {
        subs!.delete(listener);
        if (subs!.size === 0) listeners.delete(nodeId);
      };
    },
    reset() {
      entries.clear();
      listeners.clear();
      inflight.clear();
    },
  };
}

/**
 * Production fetcher. Uses the existing provenance endpoint because it
 * already returns `{ node, provenance[] }` with owner-scoped 404s — no need
 * for a new API surface just to hydrate a node.
 */
export async function fetchNodeViaProvenance(nodeId: string): Promise<GraphNodeWire> {
  const res = await fetch(
    `/api/graph/nodes/${encodeURIComponent(nodeId)}/provenance`,
    { cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { node?: GraphNodeWire };
  if (!json.node || typeof json.node.id !== 'string') {
    throw new Error('Malformed provenance response: missing node');
  }
  return json.node;
}

// Singleton used by `useNode`. Tests can build their own cache via
// `createNodeCache` rather than mutating this one.
export const defaultNodeCache = createNodeCache(fetchNodeViaProvenance);
