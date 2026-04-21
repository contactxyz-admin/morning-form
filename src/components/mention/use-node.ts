'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { defaultNodeCache, type NodeCacheEntry } from './node-cache';

/**
 * Returns the current cache entry for `nodeId` and subscribes to updates.
 * Pass `enabled=false` to suppress the load side-effect — useful when a chip
 * is mounted but hasn't been clicked yet and we'd rather not prefetch.
 */
export function useNode(
  nodeId: string | null,
  opts: { enabled?: boolean } = {},
): NodeCacheEntry | undefined {
  const enabled = opts.enabled !== false;

  useEffect(() => {
    if (!enabled || !nodeId) return;
    defaultNodeCache.load(nodeId);
  }, [nodeId, enabled]);

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!nodeId) return () => {};
      return defaultNodeCache.subscribe(nodeId, onChange);
    },
    [nodeId],
  );

  const getSnapshot = useCallback(
    () => (nodeId ? defaultNodeCache.get(nodeId) : undefined),
    [nodeId],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => undefined);
}
