/**
 * `compare_to_reference_range` — the canonical reference-range-comparison
 * judgment. Finds the biomarker by `canonicalKey` for the current user and
 * classifies its latest value against the reference range already captured
 * at ingest in `GraphNode.attributes` (see `src/lib/intake/biomarkers.ts`
 * for the source-of-truth range table).
 *
 * Scope:
 *   - User-scoped by ctx.userId at the DB layer.
 *   - Topic-scoped by the registry: a canonicalKey that doesn't substring-
 *     match any of the topic's `canonicalKeyPatterns` returns `not-found`
 *     without querying. A hallucinated `compare_to_reference_range` call
 *     on an unrelated biomarker cannot leak cross-topic data.
 *
 * Deliberately returns structured data, not prose — the scribe composes the
 * natural-language claim from the result and must still cite the biomarker
 * node. Classification buckets are the three a specialist GP uses in-clinic:
 * `below` / `in-range` / `above`. `insufficient-data` surfaces when the
 * ingest pipeline knows the biomarker but hasn't captured a range.
 */
import { z } from 'zod';
import { getTopicConfig } from '@/lib/topics/registry';
import type { ToolContext, ToolHandler } from './types';

export const compareToReferenceRangeSchema = z.object({
  canonicalKey: z.string().min(1).max(120),
});

export type CompareToReferenceRangeArgs = z.infer<typeof compareToReferenceRangeSchema>;

export type ReferenceClassification =
  | 'below'
  | 'in-range'
  | 'above'
  | 'insufficient-data'
  | 'not-found';

export interface CompareToReferenceRangeResult {
  canonicalKey: string;
  found: boolean;
  classification: ReferenceClassification;
  nodeId: string | null;
  value: number | null;
  unit: string | null;
  range: { low: number | null; high: number | null } | null;
}

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

function classify(
  value: number | null,
  low: number | null,
  high: number | null,
): ReferenceClassification {
  if (value === null) return 'insufficient-data';
  if (low === null && high === null) return 'insufficient-data';
  if (low !== null && value < low) return 'below';
  if (high !== null && value > high) return 'above';
  return 'in-range';
}

export const compareToReferenceRangeHandler: ToolHandler<
  CompareToReferenceRangeArgs,
  CompareToReferenceRangeResult
> = {
  name: 'compare_to_reference_range',
  description:
    'Classify a biomarker\'s latest captured value against its reference range. Returns structured data (below/in-range/above) so the scribe can compose the sentence; the scribe still cites the biomarker node.',
  parameters: compareToReferenceRangeSchema,
  async execute(ctx: ToolContext, args: CompareToReferenceRangeArgs) {
    const canonicalKey = args.canonicalKey.toLowerCase();

    // Topic scope gate — if the canonicalKey isn't one of this topic's
    // patterns, return not-found without a DB query. An unknown topic
    // (no registry entry) falls through the same way.
    const topic = getTopicConfig(ctx.topicKey);
    const matchesTopic =
      topic?.canonicalKeyPatterns.some((p) => canonicalKey.includes(p.toLowerCase())) ?? false;
    if (!matchesTopic) {
      return {
        canonicalKey,
        found: false,
        classification: 'not-found',
        nodeId: null,
        value: null,
        unit: null,
        range: null,
      };
    }

    const node = await ctx.db.graphNode.findUnique({
      where: {
        userId_type_canonicalKey: {
          userId: ctx.userId,
          type: 'biomarker',
          canonicalKey,
        },
      },
    });

    if (!node) {
      return {
        canonicalKey,
        found: false,
        classification: 'not-found',
        nodeId: null,
        value: null,
        unit: null,
        range: null,
      };
    }

    let attrs: Record<string, unknown> = {};
    if (node.attributes) {
      try {
        const parsed = JSON.parse(node.attributes);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          attrs = parsed as Record<string, unknown>;
        }
      } catch {
        // malformed attribute payload — treat as empty so we return insufficient-data
      }
    }

    const value = toNumberOrNull(attrs.latestValue);
    const low = toNumberOrNull(attrs.referenceRangeLow);
    const high = toNumberOrNull(attrs.referenceRangeHigh);
    const unit = typeof attrs.unit === 'string' ? attrs.unit : null;

    return {
      canonicalKey,
      found: true,
      classification: classify(value, low, high),
      nodeId: node.id,
      value,
      unit,
      range: low === null && high === null ? null : { low, high },
    };
  },
};
