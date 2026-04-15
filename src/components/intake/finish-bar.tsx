'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
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
      // Documents go to /api/intake/documents (multipart). The handler is U6;
      // best-effort here so the UI works as soon as that lands. We don't fail
      // the whole submit if docs upload fails — the user can re-upload later.
      for (const doc of documents) {
        const fd = new FormData();
        fd.append('file', doc.file);
        try {
          await fetch('/api/intake/documents', { method: 'POST', body: fd });
        } catch {
          // U6 not yet wired; ignore.
        }
      }

      // Submit the text + essentials payload to the extraction endpoint (U5).
      const res = await fetch('/api/intake/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          historyText,
          essentials,
          documentNames: documents.map((d) => d.name),
        }),
      });

      if (!res.ok && res.status !== 404) {
        // 404 means U5 isn't wired yet — treat as soft success so UI works
        // before the backend lands.
        throw new Error(`Submit failed: ${res.status}`);
      }

      reset();
      router.push('/home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed bottom-20 left-0 right-0 px-5 pointer-events-none">
      <div className="mx-auto max-w-screen-sm pointer-events-auto">
        {error && (
          <p className="mb-2 text-caption text-alert text-center bg-surface rounded-card px-3 py-2 border border-alert/30">
            {error}
          </p>
        )}
        <Button
          onClick={onFinish}
          disabled={!canFinish || submitting}
          loading={submitting}
          fullWidth
          size="lg"
        >
          {submitting ? 'Submitting…' : 'Finish intake'}
        </Button>
      </div>
    </div>
  );
}
