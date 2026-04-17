'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { MeshGradient } from '@/components/ui/mesh-gradient';
import { kindLabel } from '@/lib/record/source-view';

export interface SourceCardData {
  id: string;
  kind: string;
  sourceRef: string | null;
  capturedAt: string;
  referenceCount: number;
}

interface SourceCardProps {
  source: SourceCardData;
  /** When true, renders a redacted placeholder — no seed leaks into the gradient. */
  hidden?: boolean;
}

function formatCapturedDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function deriveTitle(source: SourceCardData): string {
  if (source.sourceRef && source.sourceRef.trim().length > 0) return source.sourceRef.trim();
  return `${kindLabel(source.kind)} — ${formatCapturedDate(source.capturedAt)}`;
}

function SourceCard({ source, hidden = false }: SourceCardProps) {
  if (hidden) {
    return (
      <Card variant="sunken" className="flex items-center gap-4 opacity-70">
        <div
          aria-hidden
          className="h-12 w-12 shrink-0 rounded-card-sm border border-border/60 bg-surface-sunken"
        />
        <div className="flex-1 min-w-0">
          <p className="text-body text-text-tertiary italic">Hidden by sharer</p>
        </div>
      </Card>
    );
  }

  const title = deriveTitle(source);
  return (
    <Link
      href={`/record/source/${encodeURIComponent(source.id)}`}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-button-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg rounded-card"
      aria-label={`${title} — source details`}
    >
      <Card clickable className="flex items-center gap-4">
        <MeshGradient
          seed={source.id}
          variant={source.kind}
          className="h-12 w-12 shrink-0 rounded-card-sm border border-border/60"
        />
        <div className="flex-1 min-w-0">
          <p className="font-display font-light text-subheading text-text-primary -tracking-[0.01em] truncate">
            {title}
          </p>
          <p className="mt-1 text-caption text-text-tertiary">
            {kindLabel(source.kind)} · {source.referenceCount} reference
            {source.referenceCount === 1 ? '' : 's'} · {formatCapturedDate(source.capturedAt)}
          </p>
        </div>
      </Card>
    </Link>
  );
}

export { SourceCard };
