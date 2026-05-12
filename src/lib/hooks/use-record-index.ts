'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RecordIndex as RecordIndexData } from '@/lib/record/types';

export type RecordIndexState =
  | { status: 'loading' }
  | { status: 'unauth' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: RecordIndexData };

export interface UseRecordIndexResult {
  state: RecordIndexState;
  refresh: () => Promise<void>;
}

/**
 * Single-source fetcher for the `GET /api/record` vault surface.
 *
 * Owns an `AbortController` so unmount or rapid `refresh()` calls cancel
 * any in-flight request — a slow first response cannot clobber a faster
 * second one, and unmount mid-fetch never writes to a torn-down tree.
 *
 * `refresh()` is the post-mutation callback (used by AddDocumentsDialog)
 * and intentionally does NOT flash the page through `loading` — current
 * data stays visible while the new payload is in-flight. Errors still
 * surface via the `error` state. Initial mount starts in `loading`
 * because no prior data exists.
 *
 * Replaces the duplicated fetch logic that previously lived inside
 * `<VaultLayout>` (ce:review M3 / kieran duplicated-fetch).
 */
export function useRecordIndex(): UseRecordIndexResult {
  const [state, setState] = useState<RecordIndexState>({ status: 'loading' });
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async (resetToLoading: boolean): Promise<void> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    if (resetToLoading) setState({ status: 'loading' });

    try {
      const res = await fetch('/api/record', {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (res.status === 401) {
        setState({ status: 'unauth' });
        return;
      }
      if (!res.ok) {
        setState({ status: 'error', message: `HTTP ${res.status}` });
        return;
      }
      const json = (await res.json()) as RecordIndexData;
      if (!controller.signal.aborted) setState({ status: 'ready', data: json });
    } catch (err) {
      if (controller.signal.aborted) return;
      // Browsers throw AbortError on aborted fetches even when we check
      // signal.aborted first; ignore the rejection rather than surfacing
      // it as a user-facing error state.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, []);

  useEffect(() => {
    void load(true);
    return () => {
      controllerRef.current?.abort();
    };
  }, [load]);

  const refresh = useCallback(() => load(false), [load]);

  return { state, refresh };
}
