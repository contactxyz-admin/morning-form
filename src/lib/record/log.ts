/**
 * Per-topic log shaper for `GET /api/topics/[topicKey]/log` and the
 * `TopicLogFooter` below each topic page. Karpathy's `log.md` analog:
 * a compact, reverse-chronological stream of the ingest + compile events
 * that shaped a single topic.
 *
 * Prisma-free so the full surface is unit-testable with synthetic rows.
 * The route layer handles auth, ownership, and hydration; this library is
 * responsible only for converting raw rows into the wire shape.
 */

import type { LogEntry } from './types';
import { kindLabel } from './source-view';

export interface TopicLogSourceRow {
  id: string;
  kind: string;
  createdAt: Date;
}

export interface TopicLogNodeRow {
  id: string;
  displayName: string;
  createdAt: Date;
}

export interface TopicLogInput {
  topicKey: string;
  lastCompiledAt: Date | null;
  sources: TopicLogSourceRow[];
  nodes: TopicLogNodeRow[];
}

export interface TopicLogSummary {
  lastCompiledAt: string | null;
  sourceCount: number;
  nodeCount: number;
  /**
   * True when at least one contributing source was ingested *after* the
   * last compile — UI surfaces this as "Recompile pending" to avoid the
   * implicit lie that the compiled prose reflects everything in the graph.
   */
  staleSinceCompile: boolean;
}

export interface TopicLog {
  summary: TopicLogSummary;
  entries: LogEntry[];
}

const MAX_ENTRIES = 20;

export function deriveTopicLog(input: TopicLogInput): TopicLog {
  const entries: Array<LogEntry & { _ts: number }> = [];

  for (const s of input.sources) {
    entries.push({
      _ts: s.createdAt.getTime(),
      ts: s.createdAt.toISOString(),
      kind: 'source-added',
      label: `Source ingested — ${kindLabel(s.kind)}`,
      targetHref: `/record/source/${s.id}`,
    });
  }

  for (const n of input.nodes) {
    entries.push({
      _ts: n.createdAt.getTime(),
      ts: n.createdAt.toISOString(),
      kind: 'node-added',
      label: `${n.displayName} added to graph`,
      targetHref: `/graph?focus=${n.id}`,
    });
  }

  if (input.lastCompiledAt) {
    entries.push({
      _ts: input.lastCompiledAt.getTime(),
      ts: input.lastCompiledAt.toISOString(),
      kind: 'topic-compiled',
      label: `Compiled ${input.topicKey}`,
      targetHref: `/topics/${input.topicKey}`,
    });
  }

  entries.sort((a, b) => b._ts - a._ts);
  const trimmed = entries.slice(0, MAX_ENTRIES).map(
    ({ ts, kind, label, targetHref }) => ({ ts, kind, label, targetHref }),
  );

  const compiledAtMs = input.lastCompiledAt?.getTime() ?? null;
  const staleSinceCompile =
    compiledAtMs !== null && input.sources.some((s) => s.createdAt.getTime() > compiledAtMs);

  return {
    summary: {
      lastCompiledAt: input.lastCompiledAt ? input.lastCompiledAt.toISOString() : null,
      sourceCount: input.sources.length,
      nodeCount: input.nodes.length,
      staleSinceCompile,
    },
    entries: trimmed,
  };
}
