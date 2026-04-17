'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { RecordIndex } from '@/components/record/record-index';
import type { RecordIndex as RecordIndexData } from '@/lib/record/types';

type LoadState =
  | { status: 'loading' }
  | { status: 'unauth' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: RecordIndexData };

export default function RecordPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/record/index', { cache: 'no-store' });
        if (res.status === 401) {
          if (!cancelled) setState({ status: 'unauth' });
          return;
        }
        if (!res.ok) {
          if (!cancelled) setState({ status: 'error', message: `HTTP ${res.status}` });
          return;
        }
        const json = (await res.json()) as RecordIndexData;
        if (!cancelled) setState({ status: 'ready', data: json });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-record-grid">
      <div className="px-5 pt-6 pb-16 grain-page">
        {state.status === 'loading' && (
          <Card variant="sunken" className="opacity-60 py-16 text-center">
            <p className="font-display font-light text-heading text-text-primary">
              Opening your record…
            </p>
          </Card>
        )}

        {state.status === 'unauth' && (
          <Card variant="paper">
            <p className="text-body text-text-secondary">Sign in to view your record.</p>
          </Card>
        )}

        {state.status === 'error' && (
          <Card variant="paper" accentColor="alert">
            <p className="text-body text-text-secondary">
              Something went wrong loading your record.
            </p>
            <p className="mt-2 font-mono text-caption text-text-tertiary">{state.message}</p>
          </Card>
        )}

        {state.status === 'ready' && <RecordIndex data={state.data} />}
      </div>
    </div>
  );
}
