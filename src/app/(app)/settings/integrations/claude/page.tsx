'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SectionLabel } from '@/components/ui/section-label';

/**
 * `/settings/integrations/claude`
 *
 * Management surface for the bearer tokens external MCP clients (Claude
 * Desktop, Claude Code, Codex, Cursor, VS Code MCP extension) use to
 * read the user's MorningForm vault.
 *
 * Three states the UI cycles through:
 *   1. Empty / list — no token issued yet, or list of existing tokens.
 *   2. Issuing — modal-ish "name your token" form.
 *   3. Just-issued — the only moment the raw token is visible. Copy or
 *      lose it; on dialog dismiss we never re-emit.
 */

interface TokenRow {
  id: string;
  label: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
  createdAt: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; tokens: TokenRow[] };

interface IssuedToken {
  id: string;
  label: string;
  rawToken: string;
  expiresAt: string | null;
}

export default function ClaudeIntegrationPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [issueOpen, setIssueOpen] = useState(false);
  const [justIssued, setJustIssued] = useState<IssuedToken | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/mcp/tokens', { cache: 'no-store' });
      if (!res.ok) {
        setState({ status: 'error', message: `HTTP ${res.status}` });
        return;
      }
      const json = (await res.json()) as { tokens: TokenRow[] };
      setState({ status: 'ready', tokens: json.tokens });
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
    if (!window.confirm('Revoke this token? Any Claude client using it will lose access immediately.')) {
      return;
    }
    try {
      const res = await fetch(`/api/mcp/tokens/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        window.alert('Revoke failed — please try again.');
        return;
      }
      await load();
    } catch {
      window.alert('Revoke failed — please try again.');
    }
  };

  const handleIssue = async (label: string) => {
    try {
      const res = await fetch('/api/mcp/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) {
        window.alert('Could not issue token — please try again.');
        return;
      }
      const issued = (await res.json()) as IssuedToken;
      setJustIssued(issued);
      setIssueOpen(false);
      await load();
    } catch {
      window.alert('Could not issue token — please try again.');
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
        <SectionLabel>Settings · Claude integration</SectionLabel>
      </div>

      <div className="rise">
        <h1 className="font-display font-light text-display sm:text-display-xl text-text-primary -tracking-[0.04em]">
          Connect to Claude.
        </h1>
        <p className="mt-4 text-body text-text-secondary max-w-xl leading-relaxed">
          Generate a token that lets Claude Desktop, Claude Code, Cursor, or
          VS Code read your MorningForm vault as a native tool. Read-only —
          Claude can search, view nodes, and trace provenance, but cannot
          modify your record.
        </p>
      </div>

      <div className="mt-10 flex justify-between items-center">
        <SectionLabel>Tokens</SectionLabel>
        <Button type="button" variant="primary" size="sm" onClick={() => setIssueOpen(true)}>
          New token
        </Button>
      </div>

      <div className="mt-4 stagger">
        {state.status === 'loading' && (
          <Card variant="sunken" className="opacity-60 py-10 text-center">
            <p className="text-caption text-text-tertiary">Loading…</p>
          </Card>
        )}

        {state.status === 'error' && (
          <Card variant="paper" accentColor="alert">
            <p className="text-body text-text-secondary">
              Couldn&apos;t load your tokens.
            </p>
            <p className="mt-2 font-mono text-caption text-text-tertiary">
              {state.message}
            </p>
          </Card>
        )}

        {state.status === 'ready' && state.tokens.length === 0 && (
          <Card variant="paper" className="py-10 text-center">
            <p className="font-display font-light text-heading text-text-primary -tracking-[0.02em]">
              No tokens yet.
            </p>
            <p className="mt-3 text-body text-text-secondary max-w-sm mx-auto leading-relaxed">
              Issue one to start a Claude conversation grounded in your
              record. You can revoke it at any time.
            </p>
          </Card>
        )}

        {state.status === 'ready' && state.tokens.length > 0 && (
          <div className="space-y-3">
            {state.tokens.map((token) => (
              <TokenRowCard key={token.id} token={token} onRevoke={handleRevoke} />
            ))}
          </div>
        )}
      </div>

      {issueOpen && (
        <IssueDialog
          onCancel={() => setIssueOpen(false)}
          onIssue={handleIssue}
        />
      )}

      {justIssued && (
        <JustIssuedDialog
          issued={justIssued}
          onClose={() => setJustIssued(null)}
        />
      )}
    </div>
  );
}

function TokenRowCard({
  token,
  onRevoke,
}: {
  token: TokenRow;
  onRevoke: (id: string) => void;
}) {
  const isRevoked = token.revokedAt !== null;
  const isExpired = token.expiresAt !== null && new Date(token.expiresAt).getTime() < Date.now();

  return (
    <Card variant={isRevoked || isExpired ? 'sunken' : 'default'} className="py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-body text-text-primary truncate">{token.label}</p>
          <p className="mt-1 text-caption text-text-tertiary">
            {isRevoked
              ? `Revoked ${fmtDate(token.revokedAt!)}`
              : isExpired
                ? `Expired ${fmtDate(token.expiresAt!)}`
                : `Created ${fmtDate(token.createdAt)}${
                    token.lastUsedAt ? ` · last used ${fmtRelative(token.lastUsedAt)}` : ' · never used'
                  } · ${token.useCount} call${token.useCount === 1 ? '' : 's'}`}
          </p>
        </div>
        {!isRevoked && !isExpired && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onRevoke(token.id)}
          >
            Revoke
          </Button>
        )}
      </div>
    </Card>
  );
}

function IssueDialog({
  onCancel,
  onIssue,
}: {
  onCancel: () => void;
  onIssue: (label: string) => void;
}) {
  const [label, setLabel] = useState('');
  const trimmed = label.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= 120;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm px-5">
      <Card variant="paper" className="max-w-md w-full">
        <h2 className="font-display font-light text-heading text-text-primary -tracking-[0.02em]">
          Name this token.
        </h2>
        <p className="mt-3 text-caption text-text-tertiary">
          Pick something that tells you which Claude client it belongs to —
          e.g. &ldquo;Claude Desktop on laptop&rdquo;.
        </p>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Claude Desktop on laptop"
          autoFocus
          className="mt-5 w-full px-3 py-2 bg-surface-warm border border-border rounded-md text-body text-text-primary placeholder:text-text-whisper focus:outline-none focus:ring-2 focus:ring-accent/50"
          maxLength={120}
        />
        <div className="mt-6 flex gap-3 justify-end">
          <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!canSubmit}
            onClick={() => onIssue(trimmed)}
          >
            Issue
          </Button>
        </div>
      </Card>
    </div>
  );
}

function JustIssuedDialog({
  issued,
  onClose,
}: {
  issued: IssuedToken;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<'token' | 'desktop' | 'code' | null>(null);
  const baseUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://morning-form.vercel.app';

  const desktopConfig = JSON.stringify(
    {
      mcpServers: {
        morningform: {
          url: `${baseUrl}/api/mcp`,
          headers: { Authorization: `Bearer ${issued.rawToken}` },
        },
      },
    },
    null,
    2,
  );

  // Pass the token via env (not argv) so it doesn't appear in `ps` /
  // process listings on multi-user hosts. `claude mcp add --env` is the
  // Claude Code path; the JSON config form above embeds it in the
  // headers object directly.
  const codeOneLiner = `claude mcp add morningform --env MORNINGFORM_TOKEN=${issued.rawToken} -- npx -y @morningform/mcp`;

  const copy = async (text: string, kind: 'token' | 'desktop' | 'code') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied((c) => (c === kind ? null : c)), 1500);
    } catch {
      window.alert('Copy failed — select the text manually.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm px-5 py-10 overflow-auto">
      <Card variant="paper" className="max-w-xl w-full">
        <SectionLabel className="text-accent">Token issued</SectionLabel>
        <h2 className="mt-2 font-display font-light text-heading text-text-primary -tracking-[0.02em]">
          {issued.label}
        </h2>
        <p className="mt-4 text-body text-text-secondary leading-relaxed">
          Copy the token below now. <span className="font-medium text-text-primary">It will never be shown again</span>—
          on close, you&apos;ll only see metadata. To rotate, revoke and issue a new one.
        </p>

        <div className="mt-6">
          <p className="font-mono text-label uppercase text-text-tertiary tracking-wider mb-2">
            Raw token
          </p>
          <div className="flex items-stretch gap-2">
            <code className="flex-1 px-3 py-2 bg-surface-warm border border-border rounded-md text-caption font-mono text-text-primary break-all">
              {issued.rawToken}
            </code>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => copy(issued.rawToken, 'token')}
            >
              {copied === 'token' ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>

        <div className="mt-6">
          <p className="font-mono text-label uppercase text-text-tertiary tracking-wider mb-2">
            Claude Desktop config
          </p>
          <p className="text-caption text-text-tertiary mb-2">
            Add to <code className="font-mono">claude_desktop_config.json</code> and restart the app.
          </p>
          <div className="flex items-start gap-2">
            <pre className="flex-1 px-3 py-2 bg-surface-warm border border-border rounded-md text-caption font-mono text-text-primary overflow-auto max-h-48">
              {desktopConfig}
            </pre>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => copy(desktopConfig, 'desktop')}
            >
              {copied === 'desktop' ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>

        <div className="mt-6">
          <p className="font-mono text-label uppercase text-text-tertiary tracking-wider mb-2">
            Claude Code (stdio)
          </p>
          <p className="text-caption text-text-tertiary mb-2">
            Once the <code className="font-mono">@morningform/mcp</code> package publishes, this one-liner registers a stdio bridge.
          </p>
          <div className="flex items-stretch gap-2">
            <code className="flex-1 px-3 py-2 bg-surface-warm border border-border rounded-md text-caption font-mono text-text-primary break-all">
              {codeOneLiner}
            </code>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => copy(codeOneLiner, 'code')}
            >
              {copied === 'code' ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <Button type="button" variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </Card>
    </div>
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

function fmtRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return fmtDate(iso);
  } catch {
    return iso;
  }
}
