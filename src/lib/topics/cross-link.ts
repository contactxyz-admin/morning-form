/**
 * Inline cross-linking for compiled topic prose.
 *
 * The compiled output carries per-section `citations: { nodeId, excerpt }[]`
 * where each `excerpt` is a verbatim substring of `bodyMarkdown` (Zod
 * contract enforced at compile time, see `lib/topics/types.ts`). R6 turns
 * those excerpts into clickable spans that open the corresponding graph
 * node's detail sheet.
 *
 * This module returns a flat `Span[]` array rather than JSX so the shaping
 * is Prisma-free, React-free, and directly unit-testable. The renderer
 * walks the spans and wraps `node-link` segments in <button>s.
 *
 * Safety posture (plan R6):
 * - Only text whose exact literal matches a citation's `excerpt` becomes a
 *   link. No regex against display names, no substring heuristics against
 *   arbitrary prose. False-positives stay bounded to the LLM's own
 *   verbatim quotes.
 * - Each excerpt is linked at most once per section. Later citations with
 *   the same excerpt are ignored (dedup by first-seen).
 * - If no excerpt in the section can be found in the body, the section
 *   renders as plain prose — the footer citation list still exposes the
 *   full provenance, so we never silently drop information.
 */

import type { Citation } from './types';

export interface TextSpan {
  kind: 'text';
  content: string;
}

export interface NodeLinkSpan {
  kind: 'node-link';
  content: string;
  nodeId: string;
}

export type Span = TextSpan | NodeLinkSpan;

interface Match {
  start: number;
  end: number;
  nodeId: string;
}

/**
 * Build an ordered list of spans for one section's body. Excerpts are
 * matched as literal substrings in `bodyMarkdown`; each matched range is
 * replaced with a `node-link` span pointing at the citation's `nodeId`.
 *
 * Overlapping excerpts: the longest leftmost match wins, later matches
 * starting inside an already-matched range are skipped. This prevents
 * double-wrapping when the LLM cites two overlapping phrases.
 */
export function buildInlineSpans(bodyMarkdown: string, citations: Citation[]): Span[] {
  if (bodyMarkdown.length === 0) return [];
  if (citations.length === 0) return [{ kind: 'text', content: bodyMarkdown }];

  const seenExcerpts = new Set<string>();
  const matches: Match[] = [];

  for (const citation of citations) {
    const excerpt = citation.excerpt;
    if (excerpt.length === 0) continue;
    if (seenExcerpts.has(excerpt)) continue;
    seenExcerpts.add(excerpt);

    const start = bodyMarkdown.indexOf(excerpt);
    if (start === -1) continue;
    matches.push({ start, end: start + excerpt.length, nodeId: citation.nodeId });
  }

  if (matches.length === 0) {
    return [{ kind: 'text', content: bodyMarkdown }];
  }

  matches.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - a.end;
  });

  const nonOverlapping: Match[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start < cursor) continue;
    nonOverlapping.push(m);
    cursor = m.end;
  }

  const spans: Span[] = [];
  let offset = 0;
  for (const m of nonOverlapping) {
    if (m.start > offset) {
      spans.push({ kind: 'text', content: bodyMarkdown.slice(offset, m.start) });
    }
    spans.push({
      kind: 'node-link',
      content: bodyMarkdown.slice(m.start, m.end),
      nodeId: m.nodeId,
    });
    offset = m.end;
  }
  if (offset < bodyMarkdown.length) {
    spans.push({ kind: 'text', content: bodyMarkdown.slice(offset) });
  }

  return spans;
}
