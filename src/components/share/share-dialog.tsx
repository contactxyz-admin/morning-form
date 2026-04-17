'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MeshGradient } from '@/components/ui/mesh-gradient';
import { SectionLabel } from '@/components/ui/section-label';
import type { ShareScope } from '@/lib/share/tokens';

/**
 * Modal for minting a shareable link on a topic or node.
 *
 * Posts to /api/share/create and reveals the raw URL inline — the token
 * is only surfaced once, so we keep it visible with an obvious copy
 * button. A manage-link trails off to /settings/shared-links for
 * revocation and history.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  scope: ShareScope;
  defaultLabel?: string;
}

type DialogState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'error'; message: string }
  | { status: 'created'; url: string; id: string; expiresAt: string | null };

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return 'Never expires unless you revoke it.';
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return 'Never expires unless you revoke it.';
  // Explicit calendar date beats "in 7 days" — the viewer, and the owner
  // revisiting their own Shared links later, needs the absolute anchor.
  const formatted = date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return `Expires ${formatted}`;
}

function meshSeed(scope: ShareScope, id: string): string {
  // Prefer topic-key-derived seed so the same topic always gets the same
  // gradient — gives the viewer a stable visual for repeat shares of the
  // same record. Fall back to the share id for node scope.
  if (scope.kind === 'topic') return `topic:${scope.topicKey}`;
  return `share:${id}`;
}

export function ShareDialog({ open, onClose, scope, defaultLabel }: Props) {
  const [label, setLabel] = useState(defaultLabel ?? '');
  const [state, setState] = useState<DialogState>({ status: 'idle' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setState({ status: 'idle' });
      setLabel(defaultLabel ?? '');
      setCopied(false);
    }
  }, [open, defaultLabel]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ status: 'submitting' });
    try {
      const res = await fetch('/api/share/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          label: label.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({
          status: 'error',
          message: body.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      const { url, id, expiresAt } = (await res.json()) as {
        url: string;
        id: string;
        expiresAt: string | null;
      };
      setState({ status: 'created', url, id, expiresAt });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* copy not available — user can select manually */
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="share-backdrop"
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            key="share-panel"
            role="dialog"
            aria-modal="true"
            className="absolute left-1/2 top-1/2 w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 360, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            <Card variant="paper" className="py-6">
              <SectionLabel>Share</SectionLabel>
              <h2 className="mt-3 font-display font-light text-heading text-text-primary -tracking-[0.02em]">
                {scope.kind === 'topic'
                  ? 'Share this topic'
                  : 'Share this node'}
              </h2>
              <p className="mt-2 text-caption text-text-tertiary leading-relaxed">
                A read-only link. You can revoke it any time from{' '}
                <a
                  href="/settings/shared-links"
                  className="underline hover:text-text-primary"
                >
                  Shared links
                </a>
                .
              </p>

              {state.status !== 'created' && (
                <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                  <label className="block">
                    <span className="text-caption text-text-secondary">
                      Label (optional — so you remember what this link is for)
                    </span>
                    <input
                      type="text"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="e.g. For Dr. Smith"
                      maxLength={120}
                      className="mt-1.5 w-full rounded-button border border-border bg-surface px-3 py-2 text-body text-text-primary focus:border-accent focus:outline-none focus:shadow-ring-focus"
                    />
                  </label>

                  {state.status === 'error' && (
                    <p className="text-caption text-alert">{state.message}</p>
                  )}

                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="ghost" onClick={onClose}>
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      loading={state.status === 'submitting'}
                      disabled={state.status === 'submitting'}
                    >
                      {state.status === 'submitting' ? 'Minting…' : 'Mint link'}
                    </Button>
                  </div>
                </form>
              )}

              {state.status === 'created' && (
                <div className="mt-5">
                  <MeshGradient
                    seed={meshSeed(scope, state.id)}
                    variant={scope.kind}
                    className="h-24 w-full rounded-card border border-border-subtle"
                  />
                  <p className="mt-2 text-caption text-text-tertiary">
                    {formatExpiry(state.expiresAt)}
                  </p>

                  <label className="mt-5 block">
                    <span className="text-caption text-text-secondary">
                      Your share link
                    </span>
                    <div className="mt-1.5 flex gap-2">
                      <input
                        type="text"
                        value={state.url}
                        readOnly
                        onFocus={(e) => e.currentTarget.select()}
                        className="flex-1 rounded-button border border-border bg-surface-warm px-3 py-2 font-mono text-caption text-text-primary"
                      />
                      <Button
                        type="button"
                        variant="tonal"
                        size="sm"
                        onClick={() => handleCopy(state.url)}
                      >
                        {copied ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                  </label>
                  <p className="mt-3 text-caption text-text-tertiary leading-relaxed">
                    We won&apos;t show this link again. Save it somewhere, or
                    revoke and mint a new one later.
                  </p>
                  <div className="mt-5 flex gap-2 justify-end">
                    <Button type="button" variant="secondary" onClick={onClose}>
                      Done
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
