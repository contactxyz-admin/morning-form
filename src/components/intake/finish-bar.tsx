'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useIntakeStore } from '@/lib/intake/store';

export function FinishBar() {
  const router = useRouter();
  const documents = useIntakeStore((s) => s.documents);
  const historyText = useIntakeStore((s) => s.historyText);
  const essentials = useIntakeStore((s) => s.essentials);
  const isEssentialsComplete = useIntakeStore((s) => s.isEssentialsComplete());
  const reset = useIntakeStore((s) => s.reset);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canFinish = isEssentialsComplete;

  async function onFinish() {
    setSubmitting(true);
    setError(null);
    try {
      const failed: string[] = [];
      for (const doc of documents) {
        const fd = new FormData();
        fd.append('file', doc.file);
        try {
          const docRes = await fetch('/api/intake/documents', { method: 'POST', body: fd });
          if (!docRes.ok) failed.push(doc.name);
        } catch {
          failed.push(doc.name);
        }
      }
      if (failed.length > 0) {
        throw new Error(
          `Failed to upload ${failed.length} document${failed.length === 1 ? '' : 's'}: ${failed.join(', ')}`,
        );
      }

      const res = await fetch('/api/intake/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          historyText,
          essentials,
          documentNames: documents.map((d) => d.name),
        }),
      });

      if (!res.ok) {
        throw new Error(`Submit failed: ${res.status}`);
      }

      router.push('/home');
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed bottom-16 left-0 right-0 pointer-events-none z-40"
      aria-live="polite"
    >
      {/* The bar's atmosphere is a single long gradient fade — content below
          bleeds up through warm paper, then hits the CTA which owns its own
          shadow/focus treatment. No extra wrapper around the button. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg via-bg/85 to-transparent"
      />
      <div className="relative px-6 sm:px-8 pt-5 pb-4">
        <div className="mx-auto max-w-2xl pointer-events-auto">
          {error && (
            <p className="mb-3 text-caption text-alert text-center bg-surface rounded-card-sm px-4 py-3 border border-alert/30 shadow-hairline">
              {error}
            </p>
          )}
          <Button
            onClick={onFinish}
            disabled={!canFinish || submitting}
            loading={submitting}
            fullWidth
            size="lg"
            iconTrailing={canFinish && !submitting ? <Icon name="arrow-right" size="md" /> : undefined}
          >
            {submitting ? 'Submitting…' : 'Finish intake'}
          </Button>
          {!canFinish && (
            <p className="mt-3 text-caption text-text-tertiary text-center">
              Complete the Essentials tab to finish.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
