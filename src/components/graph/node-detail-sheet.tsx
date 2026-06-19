'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from '@/components/ui/icon';
import { SectionLabel } from '@/components/ui/section-label';
import { cn } from '@/lib/utils';
import type { EvidenceGrade, GraphNodeWire, NodeType } from '@/types/graph';
import type { SourceDocumentKind } from '@/lib/graph/types';
import { kindLabel, type SourceView } from '@/lib/record/source-view';
import {
  SourceDetailBody,
  type SourceGroundedMarker,
} from '@/components/record/source-detail-body';
import {
  changeClassificationLabel,
  changeDirectionGlyph,
} from '@/lib/markers/change-presentation';
import { FLAG_PRESENTATION } from '@/lib/markers/flag-presentation';
import { SOURCE_ABNORMALITY_LABEL } from '@/lib/markers/source-abnormality';
import type { TopicReference } from '@/lib/topics/node-topics';

// Evidence grade → human label (plan 2026-06-16-002 R9). Distinguishes a
// validated lab from a wearable estimate, a self-report, or an inferred link.
// ponytail: this is grade-keyed (the derived EvidenceGrade); the source-detail
// body has a kind-keyed twin (`authorityLabel` in src/lib/record/source-detail.ts).
// Keep the copy in step if either changes.
const EVIDENCE_LABELS: Record<EvidenceGrade, string> = {
  lab: 'Lab result',
  clinician: 'Clinician record',
  device: 'Wearable estimate',
  self_reported: 'Self-reported',
  inferred: 'Inferred link',
};

interface ProvenanceItemWire {
  chunkId: string;
  documentId: string;
  documentKind: SourceDocumentKind;
  text: string;
  offsetStart: number;
  offsetEnd: number;
  pageNumber: number | null;
  capturedAt: string;
}

interface ProvenanceResponse {
  node: GraphNodeWire;
  provenance: ProvenanceItemWire[];
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: ProvenanceResponse }
  | { status: 'error'; message: string };

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  biomarker: 'Biomarker',
  symptom: 'Symptom',
  symptom_episode: 'Symptom episode',
  condition: 'Condition',
  medication: 'Medication',
  intervention: 'Intervention',
  intervention_event: 'Intervention event',
  lifestyle: 'Lifestyle',
  metric_window: 'Metric',
  observation: 'Observation',
  mood: 'Mood',
  energy: 'Energy',
  allergy: 'Allergy',
  immunisation: 'Immunisation',
  encounter: 'Encounter',
  referral: 'Referral',
  procedure: 'Procedure',
  source_document: 'Source',
};

// Source-document kind→label lookup moved to `kindLabel` in
// `lib/record/source-view.ts` as the single cross-surface source of
// truth — pre-cleanup, three competing maps drifted ("Lab pdf" /
// "Lab report" / "Lab result" for the same kind).

interface Props {
  node: GraphNodeWire | null;
  onClose: () => void;
  /**
   * Optional pre-hydrated provenance. When provided, the sheet renders
   * the chunks directly and skips the authed `/api/graph/nodes/:id/provenance`
   * fetch — required by surfaces that have no session cookie (e.g. the
   * public /demo/record canvas, where the fixture is the source of truth).
   */
  hydratedProvenance?: ProvenanceResponse;
  /**
   * Optional pre-hydrated topic list. When provided, skips the authed
   * `/api/graph/nodes/:id/topics` fetch. Pass an empty array to suppress
   * the section without firing the request.
   */
  hydratedTopics?: TopicReference[];
  /**
   * Source-detail payload (plan 2026-06-17-002). When the open node is a
   * `source_document` and this is present, the sheet renders the shared
   * <SourceDetailBody> (what the report established + verbatim excerpts)
   * instead of the health-node sections — and skips the authed provenance/topic
   * fetches. Absent for every health node and authed caller → today's behaviour.
   */
  sourceDetail?: { sourceView: SourceView; grounded: SourceGroundedMarker[] };
  /** Drill-down from a grounded marker in the source body into that marker. */
  onOpenNode?: (marker: SourceGroundedMarker) => void;
}

export function NodeDetailSheet({
  node,
  onClose,
  hydratedProvenance,
  hydratedTopics,
  sourceDetail,
  onOpenNode,
}: Props) {
  const showSource = node?.type === 'source_document' && sourceDetail != null;
  const [state, setState] = useState<LoadState>({ status: 'idle' });

  useEffect(() => {
    if (!node) {
      setState({ status: 'idle' });
      return;
    }
    // Source nodes render the shared source body, which carries its own data —
    // never fetch the authed provenance endpoint for them (the demo has no
    // session; the fetch would only fail).
    if (showSource) {
      setState({ status: 'idle' });
      return;
    }
    if (hydratedProvenance) {
      setState({ status: 'ready', data: hydratedProvenance });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    (async () => {
      try {
        const res = await fetch(`/api/graph/nodes/${encodeURIComponent(node.id)}/provenance`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          if (!cancelled) {
            setState({ status: 'error', message: `HTTP ${res.status}` });
          }
          return;
        }
        const json = (await res.json()) as ProvenanceResponse;
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
  }, [node, hydratedProvenance, showSource]);

  useEffect(() => {
    if (!node) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [node, onClose]);

  // ── Modal focus management (plan 2026-06-18-003) ──
  // The sheet is role="dialog" aria-modal: it must take focus on open, trap Tab
  // within itself, and return focus to the trigger on close (WCAG 2.1.2 / 2.4.3
  // / 4.1.2). Without this, focus stayed on the canvas node behind the scrim and
  // Tab walked the page underneath.
  const dialogRef = useRef<HTMLDivElement>(null);
  // The element to restore focus to on close — captured once on the closed→open
  // transition (NOT re-captured on a drill-down content swap, so the original
  // trigger stays the return target). Typed HTMLElement | SVGElement because the
  // common trigger is the canvas node <g> (an SVGElement, NOT an HTMLElement) —
  // narrowing to HTMLElement would drop every canvas-opened case.
  const returnFocusRef = useRef<HTMLElement | SVGElement | null>(null);
  const wasOpenRef = useRef(false);

  // Capture the trigger on open; restore focus to it on close.
  useEffect(() => {
    const isOpen = node !== null;
    if (isOpen && !wasOpenRef.current) {
      const active = document.activeElement;
      returnFocusRef.current =
        active instanceof HTMLElement || active instanceof SVGElement ? active : null;
    }
    if (!isOpen && wasOpenRef.current) {
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      // Defer to the next frame so this restore runs AFTER GraphCanvas's
      // synchronous blur-on-deselect effect (graph-canvas.tsx) — which fires on
      // the same close and would otherwise blur the node we just refocused,
      // dumping focus to <body> (a cross-component effect-order race). Only
      // refocus if the trigger is still in the DOM.
      requestAnimationFrame(() => {
        if (target && target.isConnected) target.focus?.();
      });
    }
    wasOpenRef.current = isOpen;
  }, [node]);

  // Move focus into the dialog on open AND on each content swap (drill-down) so
  // the new title is announced; one frame out so the AnimatePresence child has
  // mounted. The container carries aria-label, so focusing it reads the title.
  useEffect(() => {
    if (!node) return;
    const raf = requestAnimationFrame(() => dialogRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [node]);

  // Tab trap: keep focus cycling within the dialog while it's open.
  const onTrapKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const root = dialogRef.current;
    if (!root) return;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (focusables.length === 0) {
      // Nothing focusable yet (content still loading) — keep focus on the dialog.
      e.preventDefault();
      root.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || active === root) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  const open = node !== null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-text-primary/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={node?.displayName}
            tabIndex={-1}
            onKeyDown={onTrapKeyDown}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className={cn(
              'focus:outline-none',
              'fixed z-50 bg-surface-warm border-border',
              'inset-x-0 bottom-0 rounded-t-[28px] border-t',
              'md:inset-y-0 md:right-0 md:left-auto md:rounded-t-none md:rounded-l-[28px] md:border-t-0 md:border-l md:w-[440px]',
              'max-h-[88vh] md:max-h-none overflow-hidden flex flex-col',
              'shadow-sheet',
            )}
          >
            {/* Mobile grab handle */}
            <div className="md:hidden flex justify-center pt-3 pb-2">
              <span aria-hidden className="h-1 w-10 rounded-full bg-text-tertiary/30" />
            </div>

            {/* Header */}
            <div className="flex items-start justify-between gap-4 px-6 pt-4 pb-5 border-b border-border/60">
              <div className="min-w-0 flex-1">
                <SectionLabel>{node ? NODE_TYPE_LABELS[node.type] : ''}</SectionLabel>
                <h2 className="mt-2 font-display font-normal text-heading text-text-primary -tracking-[0.02em] break-words">
                  {node?.displayName}
                </h2>
                {node?.promoted && (
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-accent/70">
                    Promoted node · Tier {node.tier}
                  </p>
                )}
                {node?.evidenceGrade && (
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
                    Evidence: {EVIDENCE_LABELS[node.evidenceGrade]}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className={cn(
                  'shrink-0 rounded-full p-2 -mr-2 -mt-1',
                  'text-text-tertiary hover:text-text-primary hover:bg-surface-sunken',
                  'transition-colors duration-300 ease-spring',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-button-focus',
                )}
                aria-label="Close"
              >
                <Icon name="close" size="md" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
              {showSource && sourceDetail ? (
                <SourceDetailBody
                  sourceView={sourceDetail.sourceView}
                  grounded={sourceDetail.grounded}
                  onSelectNode={onOpenNode}
                />
              ) : (
                <>
                  {node?.change && <ChangeSince node={node} />}
                  {node?.interpretation && <Interpretation node={node} />}
                  {node?.sourceFlag && !node?.interpretation && <SourceFlagNote node={node} />}
                  <Attributes node={node} />
                  <Provenance state={state} />
                  {node && <AppearsIn nodeId={node.id} hydratedTopics={hydratedTopics} />}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function fmtChangeDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function ChangeSince({ node }: { node: GraphNodeWire }) {
  const change = node.change;
  if (!change) return null;
  // `new` (null direction) has no before-value, so its glyph isn't rendered
  // inline below — the empty string keeps the before/after row clean.
  const arrow = change.direction ? changeDirectionGlyph(change.direction) : '';
  return (
    <section>
      <SectionLabel>Since your last test</SectionLabel>
      <p className="mt-3 font-mono text-body text-text-primary">
        {change.beforeValue != null ? (
          <>
            <span className="text-text-tertiary">{change.beforeValue} {arrow} </span>
            <span className="font-semibold">{change.afterValue}</span>
          </>
        ) : (
          <span className="font-semibold">{change.afterValue}</span>
        )}
        {change.unit && <span className="text-text-tertiary"> {change.unit}</span>}
        <span className="ml-2 inline-flex rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
          {changeClassificationLabel(change.classification)}
        </span>
      </p>
      {(change.beforeAt || change.afterAt) && (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
          {change.beforeAt ? `${fmtChangeDate(change.beforeAt)} → ` : ''}
          {fmtChangeDate(change.afterAt)}
        </p>
      )}
      <Link
        href={`/decisions/marker/${encodeURIComponent(node.displayName)}`}
        className="mt-3 inline-block font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary hover:text-text-secondary transition-colors"
      >
        See trajectory →
      </Link>
      <p className="mt-3 text-caption text-text-tertiary leading-relaxed">
        Described relative to this marker&rsquo;s reference range — information to discuss with a
        clinician, not medical advice.
      </p>
    </section>
  );
}

// The consumer "what this means" card (plan 2026-06-16-003): the CMO's four
// dimensions — "what changed" is the ChangeSince section above; this adds where
// it is now / how clear / what to do next, in plain English, with a calm flag.
// Escalation never shows a user-facing interpretation — it hands over to a
// clinician (nothing diagnostic is presented as a conclusion).
function Interpretation({ node }: { node: GraphNodeWire }) {
  const i = node.interpretation;
  if (!i) return null;
  const chip = FLAG_PRESENTATION[i.flag];
  const Chip = (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]',
        chip.chipClass,
      )}
    >
      {chip.label}
    </span>
  );

  if (i.flag === 'escalation') {
    return (
      <section>
        <SectionLabel>What this means</SectionLabel>
        <div className="mt-3">{Chip}</div>
        <p className="mt-3 text-body text-text-primary leading-relaxed">
          This result needs review by a clinician before it&rsquo;s interpreted here — we&rsquo;ve
          flagged it for clinician handover.
        </p>
      </section>
    );
  }

  const rows: Array<[string, string]> = [
    ['Where it is now', i.whereItIsNow],
    ['How clear the signal is', i.signalClarity],
    ['What to do next', i.nextStep],
  ];
  return (
    <section>
      <SectionLabel>What this means</SectionLabel>
      <div className="mt-3">{Chip}</div>
      <p className="mt-3 text-body text-text-primary leading-relaxed">{i.plainEnglish}</p>
      <dl className="mt-4 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
              {label}
            </dt>
            <dd className="mt-0.5 text-caption text-text-secondary leading-relaxed">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// Source-abnormality safety net (plan 2026-06-18-002) — the SOURCE's own
// out-of-range flag, relayed faithfully and source-attributed. Shown only when
// there's no authored interpretation (which would already cover the value); the
// outlined, neutral chip is visually distinct from the colour-coded authored
// tiers so it never reads as a MorningForm clinical judgement.
function SourceFlagNote({ node }: { node: GraphNodeWire }) {
  const sf = node.sourceFlag;
  if (!sf) return null;
  return (
    <section>
      <SectionLabel>Flagged by the source</SectionLabel>
      <div className="mt-3">
        <span className="inline-flex rounded-full border border-border-mid bg-surface px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
          {SOURCE_ABNORMALITY_LABEL[sf.position]}
        </span>
      </div>
      <p className="mt-3 text-caption text-text-tertiary leading-relaxed">
        This value was flagged out of range by the source itself — shown for tracking and discussion
        with a clinician, not a MorningForm assessment.
      </p>
    </section>
  );
}

// Attribute keys that have a DEDICATED presentation elsewhere in the sheet and
// must not also appear as a raw key/value row — `flaggedOutOfRange` is relayed by
// the calm, source-attributed SourceFlagNote chip (plan 2026-06-18-002); shown
// raw it double-messages and, on the authed map (which sets no sourceFlag), the
// bare boolean reads as an unattributed MorningForm judgement.
const HIDDEN_ATTRIBUTE_KEYS = new Set(['flaggedOutOfRange']);

function Attributes({ node }: { node: GraphNodeWire | null }) {
  if (!node) return null;
  const entries = Object.entries(node.attributes).filter(
    ([k, v]) => v !== null && v !== undefined && !HIDDEN_ATTRIBUTE_KEYS.has(k),
  );
  if (entries.length === 0) return null;
  return (
    <section>
      <SectionLabel>Attributes</SectionLabel>
      <dl className="mt-3 grid grid-cols-2 gap-4">
        {entries.map(([key, value]) => (
          <div key={key}>
            <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
              {key}
            </dt>
            <dd className="mt-1 font-mono text-data text-text-primary break-words">
              {formatValue(value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function Provenance({ state }: { state: LoadState }) {
  return (
    <section>
      <SectionLabel>Where this came from</SectionLabel>
      <div className="mt-3">
        {state.status === 'loading' && (
          <p className="text-caption text-text-tertiary">Loading sources…</p>
        )}
        {state.status === 'error' && (
          <p className="text-caption text-alert">Couldn&apos;t load sources — {state.message}</p>
        )}
        {state.status === 'ready' && state.data.provenance.length === 0 && (
          <p className="text-body text-text-secondary leading-relaxed">
            No documents supporting this node yet.
          </p>
        )}
        {state.status === 'ready' && state.data.provenance.length > 0 && (
          <ul className="space-y-4">
            {state.data.provenance.map((p) => (
              <li
                key={p.chunkId}
                className="rounded-card border border-border bg-surface p-4"
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
                    {kindLabel(p.documentKind)}
                    {p.pageNumber !== null ? ` · p.${p.pageNumber}` : ''}
                  </span>
                  <time className="font-mono text-[10px] text-text-tertiary">
                    {new Date(p.capturedAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </time>
                </div>
                <p className="text-body text-text-secondary leading-relaxed whitespace-pre-wrap">
                  {p.text}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

type TopicsState =
  | { status: 'loading' }
  | { status: 'ready'; topics: TopicReference[] }
  | { status: 'error' };

function AppearsIn({
  nodeId,
  hydratedTopics,
}: {
  nodeId: string;
  hydratedTopics?: TopicReference[];
}) {
  const [state, setState] = useState<TopicsState>(() =>
    hydratedTopics ? { status: 'ready', topics: hydratedTopics } : { status: 'loading' },
  );

  useEffect(() => {
    if (hydratedTopics) {
      setState({ status: 'ready', topics: hydratedTopics });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    (async () => {
      try {
        const res = await fetch(`/api/graph/nodes/${encodeURIComponent(nodeId)}/topics`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          if (!cancelled) setState({ status: 'error' });
          return;
        }
        const json = (await res.json()) as { topics: TopicReference[] };
        if (!cancelled) setState({ status: 'ready', topics: json.topics });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nodeId, hydratedTopics]);

  if (state.status === 'loading') return null;
  if (state.status === 'error') return null;
  if (state.topics.length === 0) return null;

  return (
    <section>
      <SectionLabel>Appears in</SectionLabel>
      <ul className="mt-3 flex flex-wrap gap-2">
        {state.topics.map((t) => (
          <li key={t.topicKey}>
            <Link
              href={`/topics/${encodeURIComponent(t.topicKey)}`}
              className={cn(
                'inline-flex items-center rounded-full border border-border bg-surface px-3 py-1',
                'text-caption text-text-secondary',
                'hover:border-border-hover hover:text-text-primary',
                'transition-colors duration-300 ease-spring',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-button-focus',
              )}
            >
              {t.displayName}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
