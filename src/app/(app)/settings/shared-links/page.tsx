'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SectionLabel } from '@/components/ui/section-label';
import type { ShareScope } from '@/lib/share/tokens';

/**
 * /settings/shared-links
 *
 * Management surface for the viewable-once raw tokens minted via
 * ShareDialog. We never re-emit the raw URL here — only metadata
 * (scope, label, expiresAt, revokedAt, viewCount). To share again, mint
 * a new link from the source surface.
 */

interface ShareRow {
  id: string;
  scope: ShareScope;
  label: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  createdAt: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; shares: ShareRow[] };

export default function SharedLinksPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/share/list', { cache: 'no-store' });
      if (!res.ok) {
        setState({ status: 'error', message: `HTTP ${res.status}` });
        return;
      }
      const json = (await res.json()) as { shares: ShareRow[] };
      setState({ status: 'ready', shares: json.shares });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRevoke = async (id: string) => {
    if (!window.confirm('Revoke this link? It will stop working immediately.')) {
      return;
    }
    try {
      const res = await fetch('/api/share/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        window.alert('Revoke failed — please try again.');
        return;
      }
      await load();
    } catch {
      window.alert('Revoke failed — please try again.');
    }
  };

  return (
    <div className="px-5 pt-6 pb-16 grain-page">
      <div className="flex items-center gap-2.5 mb-6">
        <Link
          href="/settings"
          className="text-text-tertiary hover:text-text-primary transition-colors duration-300 ease-spring"
          aria-label="Back to settings"
        >
          <Icon name="back" size="md" />
        </Link>
        <SectionLabel>Settings · Shared links</SectionLabel>
      </div>

      <div className="rise">
        <h1 className="font-display font-light text-display sm:text-display-xl text-text-primary -tracking-[0.04em]">
          Shared links.
        </h1>
        <p className="mt-4 text-body text-text-secondary max-w-xl leading-relaxed">
          Every read-only link you&apos;ve minted. Revoking makes the link
          stop working immediately; the recipient will see a &ldquo;not
          active&rdquo; page on their next reload.
        </p>
      </div>

      <div className="mt-10 stagger">
        {state.status === 'loading' && (
          <Card variant="sunken" className="opacity-60 py-10 text-center">
            <p className="text-caption text-text-tertiary">Loading…</p>
          </Card>
        )}

        {state.status === 'error' && (
          <Card variant="paper" accentColor="alert">
            <p className="text-body text-text-secondary">
              Couldn&apos;t load your shared links.
            </p>
            <p className="mt-2 font-mono text-caption text-text-tertiary">
              {state.message}
            </p>
          </Card>
        )}

        {state.status === 'ready' && state.shares.length === 0 && (
          <Card variant="paper" className="py-10 text-center">
            <p className="font-display font-light text-heading text-text-primary -tracking-[0.02em]">
              No shared links yet.
            </p>
            <p className="mt-3 text-body text-text-secondary max-w-sm mx-auto leading-relaxed">
              From a topic or graph view, use the share action to mint a
              read-only link you can send to someone.
            </p>
          </Card>
        )}

        {state.status === 'ready' && state.shares.length > 0 && (
          <div className="space-y-3">
            {state.shares.map((share) => (
              <ShareRowCard key={share.id} share={share} onRevoke={handleRevoke} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ShareRowCard({
  share,
  onRevoke,
}: {
  share: ShareRow;
  onRevoke: (id: string) => void;
}) {
  const isRevoked = share.revokedAt !== null;
  const isExpired = share.expiresAt !== null && new Date(share.expiresAt).getTime() < Date.now();
  const scopeLabel =
    share.scope.kind === 'topic'
      ? `Topic · ${share.scope.topicKey}`
      : `Node · ${share.scope.nodeId}`;

  return (
    <Card variant={isRevoked ? 'sunken' : 'default'} className="py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-label uppercase text-text-tertiary tracking-wider">
            {scopeLabel}
          </p>
          {share.label && (
            <p className="mt-1.5 text-body text-text-primary truncate">
              {share.label}
            </p>
          )}
          <p className="mt-1 text-caption text-text-tertiary">
            {isRevoked
              ? `Revoked ${fmtDate(share.revokedAt!)}`
              : isExpired
              ? `Expired ${fmtDate(share.expiresAt!)}`
              : `Created ${fmtDate(share.createdAt)} · ${share.viewCount} view${share.viewCount === 1 ? '' : 's'}`}
          </p>
        </div>
        {!isRevoked && !isExpired && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onRevoke(share.id)}
          >
            Revoke
          </Button>
        )}
      </div>
    </Card>
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}
